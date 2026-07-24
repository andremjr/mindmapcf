// Media storage.
// Node images/videos stay local: the map stores only a lightweight file
// reference and IndexedDB keeps the Blob/FileSystemHandle cache. We never
// upload node media to Supabase Storage.
// Sonic avatar images are the only media uploaded to Supabase Storage.

import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "mindmap-images";
const STORE = "images";
export const AVATAR_BUCKET = "avatar-images";
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3MB per avatar image

export interface ImageRef {
  id: string;
  /** Local reference shown to the user. Browsers expose the filename, not the full OS path. */
  localPath?: string;
  /** Private Supabase Storage path. Only avatar images should set this. */
  storagePath?: string;
  /** Storage bucket. Only avatar images should set this to `avatar-images`. */
  bucket?: string;
  name: string;
  size: number;
  lastModified: number;
  contentType?: string;
  /** Media kind. Missing = image (backwards compatible). */
  kind?: "image" | "video" | "audio";
}

interface Entry extends ImageRef {
  handle?: FileSystemFileHandle;
  blob?: Blob;
}

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".m4v", ".ogg", ".ogv", ".mkv"];
const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".webm", ".flac"];
const urlCache = new Map<string, string>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste navegador."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(entry: Entry) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function safePut(entry: Entry) {
  try {
    await put(entry);
  } catch {
    // Some browsers refuse to persist FileSystemHandle objects. Keep the blob
    // cache + metadata instead; node media remains local-only either way.
    const { handle: _handle, ...withoutHandle } = entry;
    await put(withoutHandle).catch(() => undefined);
  }
}

async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => res(req.result as Entry | undefined);
    req.onerror = () => rej(req.error);
  });
}

/** Scan the cache for any previously-picked file with the same fingerprint. */
async function findByFingerprint(
  name: string,
  size: number,
  lastModified: number,
): Promise<Entry | undefined> {
  try {
    const db = await openDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const all = (req.result as Entry[]) ?? [];
        res(
          all.find(
            (e) =>
              e.name === name &&
              e.size === size &&
              e.lastModified === lastModified &&
              !!e.blob,
          ),
        );
      };
      req.onerror = () => rej(req.error);
    });
  } catch {
    return undefined;
  }
}

async function del(id: string) {
  const db = await openDB();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

function objectUrlFor(id: string, blob: Blob) {
  const existing = urlCache.get(id);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

function hasFSAccess() {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

function sanitizeFileName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "arquivo";
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Você precisa estar logado para salvar arquivos.");
  return data.user.id;
}

function makeStoragePath(userId: string, name: string) {
  return `${userId}/${crypto.randomUUID()}-${sanitizeFileName(name)}`;
}

async function uploadAvatarToStorage(file: Blob, name = "avatar") {
  const userId = await currentUserId();
  const storagePath = makeStoragePath(userId, name);
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return storagePath;
}

async function downloadAvatarFromStorage(storagePath: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).download(storagePath);
  if (error || !data) return null;
  return data;
}

function pickFileFallback(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** Pick an image constrained to <=3MB and upload it to `avatar-images`. */
export async function pickAvatarImageAndStore(): Promise<ImageRef | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  let file: File | null = null;
  if (hasFSAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: "Imagens", accept: { "image/*": IMAGE_EXT } }],
        multiple: false,
        excludeAcceptAllOption: false,
      });
      file = await handle.getFile();
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
    }
  }
  if (!file) file = await pickFileFallback("image/*");
  if (!file) return null;
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error(
      `Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite: 3MB.`,
    );
  }
  const id = crypto.randomUUID();
  const storagePath = await uploadAvatarToStorage(file, file.name);
  const ref: ImageRef = {
    id,
    localPath: file.name,
    storagePath,
    bucket: AVATAR_BUCKET,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    contentType: file.type || undefined,
    kind: "image",
  };
  await safePut({ ...ref, blob: file });
  return ref;
}

/** Pick a local node image/video/audio. This never uploads to Supabase. */
export async function pickMediaAndStore(kind: "image" | "video" | "audio"): Promise<ImageRef | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const id = crypto.randomUUID();
  const description = kind === "image" ? "Imagens" : kind === "video" ? "Vídeos" : "Áudios";
  const mime = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/*";
  const exts = kind === "image" ? IMAGE_EXT : kind === "video" ? VIDEO_EXT : AUDIO_EXT;
  if (hasFSAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description, accept: { [mime]: exts } }],
        multiple: false,
        excludeAcceptAllOption: false,
      });
      const file = await handle.getFile();
      const ref: ImageRef = {
        id,
        localPath: file.name,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        contentType: file.type || undefined,
        kind,
      };
      await safePut({ ...ref, handle, blob: file });
      return ref;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
    }
  }
  const file = await pickFileFallback(mime);
  if (!file) return null;
  const ref: ImageRef = {
    id,
    localPath: (file as any).webkitRelativePath || file.name,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    contentType: file.type || undefined,
    kind,
  };
  await safePut({ ...ref, blob: file });
  return ref;
}

/** Back-compat alias — always picks an image. */
export function pickImageAndStore(): Promise<ImageRef | null> {
  return pickMediaAndStore("image");
}

/**
 * Pick multiple local media files at once (image/video/audio). Each file is
 * persisted into IndexedDB and returned as an ImageRef. Used when the user
 * wants to bulk-import images (e.g. a folder of pictures for a tier list).
 */
export async function pickMediaMultipleAndStore(
  kind: "image" | "video" | "audio",
): Promise<ImageRef[]> {
  if (typeof window === "undefined" || typeof document === "undefined") return [];
  const description = kind === "image" ? "Imagens" : kind === "video" ? "Vídeos" : "Áudios";
  const mime = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/*";
  const exts = kind === "image" ? IMAGE_EXT : kind === "video" ? VIDEO_EXT : AUDIO_EXT;

  const files: File[] = [];
  if (hasFSAccess()) {
    try {
      const handles = await (window as any).showOpenFilePicker({
        types: [{ description, accept: { [mime]: exts } }],
        multiple: true,
        excludeAcceptAllOption: false,
      });
      for (const handle of handles) {
        try {
          const f = await handle.getFile();
          (f as any).__handle = handle;
          files.push(f);
        } catch { /* skip */ }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return [];
    }
  }
  if (files.length === 0) {
    const picked = await pickFilesFallback(mime);
    files.push(...picked);
  }

  const refs: ImageRef[] = [];
  for (const file of files) {
    const ref: ImageRef = {
      id: crypto.randomUUID(),
      localPath: (file as any).webkitRelativePath || file.name,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      contentType: file.type || undefined,
      kind,
    };
    const handle = (file as any).__handle;
    await safePut(handle ? { ...ref, handle, blob: file } : { ...ref, blob: file });
    refs.push(ref);
  }
  return refs;
}

function pickFilesFallback(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/**
 * Persist a Blob/File directly into the local media cache (IndexedDB) and
 * return an ImageRef. Used for clipboard paste — the blob never leaves the
 * browser, exactly like a file picked from disk.
 */
export async function storeMediaBlob(
  blob: Blob,
  opts: { name?: string; kind?: "image" | "video" } = {},
): Promise<ImageRef> {
  const kind = opts.kind ?? (blob.type.startsWith("video/") ? "video" : "image");
  const ext =
    (blob.type.split("/")[1] || (kind === "video" ? "webm" : "png")).split(";")[0];
  const name = opts.name || `colado-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
  const file =
    blob instanceof File
      ? blob
      : new File([blob], name, { type: blob.type || undefined, lastModified: Date.now() });
  const ref: ImageRef = {
    id: crypto.randomUUID(),
    localPath: file.name,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    contentType: file.type || undefined,
    kind,
  };
  await safePut({ ...ref, blob: file });
  return ref;
}

async function tryReadHandle(entry: Entry, interactive: boolean): Promise<File | null> {
  if (!entry.handle) return null;
  const h: any = entry.handle;
  try {
    let perm: PermissionState = "prompt";
    if (typeof h.queryPermission === "function") {
      perm = await h.queryPermission({ mode: "read" });
    }
    if (perm !== "granted") {
      if (!interactive) return null;
      if (typeof h.requestPermission !== "function") return null;
      const req = await h.requestPermission({ mode: "read" });
      if (req !== "granted") return null;
    }
    return await entry.handle.getFile();
  } catch {
    return null;
  }
}

/** Resolve a local node file or an avatar image. Node refs do not fall back to Storage. */
export async function resolveImage(ref: string | ImageRef): Promise<string | null> {
  const id = typeof ref === "string" ? ref : ref.id;
  const cached = urlCache.get(id);
  if (cached) return cached;
  const entry = await getEntry(id).catch(() => undefined);
  if (entry?.blob) return objectUrlFor(id, entry.blob);

  const storagePath =
    typeof ref === "object" ? ref.storagePath ?? entry?.storagePath : entry?.storagePath;
  const bucket = (typeof ref === "object" ? ref.bucket : undefined) ?? entry?.bucket;
  if (storagePath && bucket === AVATAR_BUCKET) {
    const blob = await downloadAvatarFromStorage(storagePath);
    if (blob) {
      const nextEntry: Entry = {
        ...(typeof ref === "object"
          ? ref
          : entry ?? {
              id,
              name: "Avatar",
              size: blob.size,
              lastModified: Date.now(),
              kind: "image" as const,
            }),
        storagePath,
        bucket: AVATAR_BUCKET,
        blob,
      };
      await safePut(nextEntry).catch(() => undefined);
      return objectUrlFor(id, blob);
    }
  }

  if (entry) {
    const file = await tryReadHandle(entry, false);
    if (file) {
      await safePut({ ...entry, blob: file }).catch(() => undefined);
      return objectUrlFor(id, file);
    }
  }

  if (typeof ref === "object") {
    const twin = await findByFingerprint(ref.name, ref.size, ref.lastModified);
    if (twin?.blob) {
      await safePut({
        id,
        localPath: ref.localPath ?? ref.name,
        storagePath: ref.bucket === AVATAR_BUCKET ? ref.storagePath : undefined,
        bucket: ref.bucket === AVATAR_BUCKET ? AVATAR_BUCKET : undefined,
        name: ref.name,
        size: ref.size,
        lastModified: ref.lastModified,
        contentType: ref.contentType,
        kind: ref.kind,
        blob: twin.blob,
      }).catch(() => undefined);
      return objectUrlFor(id, twin.blob);
    }
  }
  return null;
}

export interface ReconnectResult {
  url: string;
  /** Present when reconnection refreshed the local reference. */
  ref?: ImageRef;
}

/** Reconnect a broken local media reference by asking the user to re-select it. */
export async function requestImageAccess(ref: string | ImageRef): Promise<ReconnectResult | null> {
  const id = typeof ref === "string" ? ref : ref.id;
  const cached = urlCache.get(id);
  if (cached) return { url: cached };
  const resolved = await resolveImage(ref);
  if (resolved) return { url: resolved };

  const entry = await getEntry(id).catch(() => undefined);
  if (entry) {
    const file = await tryReadHandle(entry, true);
    if (file) {
      const nextRef: ImageRef = {
        id,
        localPath: entry.localPath ?? file.name,
        storagePath: entry.bucket === AVATAR_BUCKET ? entry.storagePath : undefined,
        bucket: entry.bucket === AVATAR_BUCKET ? AVATAR_BUCKET : undefined,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        contentType: file.type || entry.contentType,
        kind: entry.kind,
      };
      await safePut({ ...nextRef, handle: entry.handle, blob: file }).catch(() => undefined);
      return { url: objectUrlFor(id, file), ref: nextRef };
    }
  }

  if (typeof ref === "object") {
    const twin = await findByFingerprint(ref.name, ref.size, ref.lastModified);
    if (twin?.blob) {
      const nextRef: ImageRef = {
        id,
        localPath: ref.localPath ?? ref.name,
        storagePath: ref.bucket === AVATAR_BUCKET ? ref.storagePath : undefined,
        bucket: ref.bucket === AVATAR_BUCKET ? AVATAR_BUCKET : undefined,
        name: ref.name,
        size: ref.size,
        lastModified: ref.lastModified,
        contentType: ref.contentType,
        kind: ref.kind,
      };
      await safePut({ ...nextRef, blob: twin.blob }).catch(() => undefined);
      return { url: objectUrlFor(id, twin.blob), ref: nextRef };
    }
  }

  const kind = entry?.kind ?? (typeof ref === "object" ? ref.kind : undefined) ?? "image";
  const mime = kind === "image" ? "image/*" : "video/*";
  const exts = kind === "image" ? IMAGE_EXT : VIDEO_EXT;
  let file: File | null = null;
  let handle: FileSystemFileHandle | undefined;
  if (hasFSAccess()) {
    try {
      const [h] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: kind === "image" ? "Imagens" : "Vídeos",
            accept: { [mime]: exts },
          },
        ],
        multiple: false,
        excludeAcceptAllOption: false,
      });
      handle = h;
      file = await h.getFile();
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
    }
  }
  if (!file) file = await pickFileFallback(mime);
  if (!file) return null;
  const nextRef: ImageRef = {
    id,
    localPath: (file as any).webkitRelativePath || file.name,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    contentType: file.type || undefined,
    kind,
  };
  await safePut({ ...nextRef, handle, blob: file });
  return { url: objectUrlFor(id, file), ref: nextRef };
}

export async function deleteImage(id: string) {
  const entry = await getEntry(id).catch(() => undefined);
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  if (entry?.storagePath && entry.bucket === AVATAR_BUCKET) {
    await supabase.storage.from(AVATAR_BUCKET).remove([entry.storagePath]).catch(() => undefined);
  }
  await del(id).catch(() => undefined);
}
