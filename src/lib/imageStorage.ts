// Media storage for mind-map nodes.
// Durable source: private Supabase Storage path saved in the node's ImageRef.
// Local source: IndexedDB blob cache + optional File System Access handle for
// fast reloads. Browser security does not allow a website to re-open an
// arbitrary local file path after restart, so the private storage path is the
// only reliable cross-session source.

import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "mindmap-images";
const STORE = "images";
const BUCKET = "mindmap-media";

export interface ImageRef {
  id: string;
  storagePath?: string;
  name: string;
  size: number;
  lastModified: number;
  contentType?: string;
  /** Media kind. Missing = image (backwards compatible). */
  kind?: "image" | "video";
}

interface Entry extends ImageRef {
  handle?: FileSystemFileHandle;
  blob?: Blob;
}

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
    // Some browsers refuse to persist FileSystemHandle objects. Keep the
    // durable storage path + blob cache instead.
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

/** Scan the cache for any previously-picked file with the same fingerprint
 *  (name+size+lastModified). Lets a second device / browser auto-adopt a
 *  local file the user already picked once, without a re-prompt. */
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


const urlCache = new Map<string, string>();

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

function makeStoragePath(userId: string, file: File) {
  return `${userId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
}

async function uploadToStorage(file: File) {
  const userId = await currentUserId();
  const storagePath = makeStoragePath(userId, file);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return storagePath;
}

async function downloadFromStorage(storagePath: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
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

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".m4v", ".ogg", ".ogv", ".mkv"];

/** Prompt the user for an image or a video and persist a reference to it.
 *  The original file is uploaded to the user's private Storage folder, and
 *  that path is saved in the map JSON. We also cache bytes locally so reloads
 *  are instant. */
export async function pickMediaAndStore(
  kind: "image" | "video",
): Promise<ImageRef | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const id = crypto.randomUUID();
  const description = kind === "image" ? "Imagens" : "Vídeos";
  const mime = kind === "image" ? "image/*" : "video/*";
  const exts = kind === "image" ? IMAGE_EXT : VIDEO_EXT;
  if (hasFSAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description, accept: { [mime]: exts } }],
        multiple: false,
        excludeAcceptAllOption: false,
      });
      const file = await handle.getFile();
      const storagePath = await uploadToStorage(file);
      const ref: ImageRef = {
        id,
        storagePath,
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
      // Fall through to fallback
    }
  }
  const file = await pickFileFallback(mime);
  if (!file) return null;
  const storagePath = await uploadToStorage(file);
  const ref: ImageRef = {
    id,
    storagePath,
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

async function tryReadHandle(
  entry: Entry,
  interactive: boolean,
): Promise<File | null> {
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

/** Resolve without a user gesture. Serves cached bytes first (survives
 *  reloads), then tries the handle silently. When invoked with the full
 *  ImageRef, also matches by fingerprint (name+size+lastModified) so a
 *  second device / browser picks up files the user already opened in
 *  another node. Returns null when nothing local matches. */
export async function resolveImage(
  ref: string | ImageRef,
): Promise<string | null> {
  const id = typeof ref === "string" ? ref : ref.id;
  const cached = urlCache.get(id);
  if (cached) return cached;
  const entry = await getEntry(id).catch(() => undefined);
  if (entry?.blob) {
    return objectUrlFor(id, entry.blob);
  }
  const storagePath =
    typeof ref === "object" ? ref.storagePath ?? entry?.storagePath : entry?.storagePath;
  if (storagePath) {
    const blob = await downloadFromStorage(storagePath);
    if (blob) {
      const nextEntry: Entry = {
        ...(typeof ref === "object"
          ? ref
          : entry ?? {
              id,
              name: "Arquivo",
              size: blob.size,
              lastModified: Date.now(),
            }),
        storagePath,
        blob,
      };
      await safePut(nextEntry).catch(() => undefined);
      return objectUrlFor(id, blob);
    }
  }
  if (entry) {
    const file = await tryReadHandle(entry, false);
    if (file) {
      await safePut({ ...entry, blob: file }).catch(() => {});
      return objectUrlFor(id, file);
    }
  }
  // Cross-device fingerprint fallback: reuse a blob the user already
  // picked for this same file on this browser.
  if (typeof ref === "object") {
    const twin = await findByFingerprint(ref.name, ref.size, ref.lastModified);
    if (twin?.blob) {
      // Adopt the blob under the new id so subsequent lookups are direct.
      await safePut({
        id,
        storagePath: ref.storagePath,
        name: ref.name,
        size: ref.size,
        lastModified: ref.lastModified,
        contentType: ref.contentType,
        kind: ref.kind,
        blob: twin.blob,
      }).catch(() => {});
      return objectUrlFor(id, twin.blob);
    }
  }
  return null;
}

export interface ReconnectResult {
  url: string;
  /** Present when reconnection created a stronger durable reference. */
  ref?: ImageRef;
}

/** Called from a user gesture to reconnect a broken reference. Tries the
 *  stored Storage path first. Only if the app has no durable path does it ask
 *  for the file once, upload it to private Storage, and update the reference. */
export async function requestImageAccess(
  ref: string | ImageRef,
): Promise<ReconnectResult | null> {
  const id = typeof ref === "string" ? ref : ref.id;
  const cached = urlCache.get(id);
  if (cached) return { url: cached };
  const resolved = await resolveImage(ref);
  if (resolved) return { url: resolved };

  const entry = await getEntry(id).catch(() => undefined);
  if (entry) {
    const file = await tryReadHandle(entry, true);
    if (file) {
      const storagePath = entry.storagePath ?? (await uploadToStorage(file));
      const nextRef: ImageRef = {
        id,
        storagePath,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        contentType: file.type || entry.contentType,
        kind: entry.kind,
      };
      await safePut({ ...nextRef, handle: entry.handle, blob: file }).catch(() => {});
      return { url: objectUrlFor(id, file), ref: nextRef };
    }
  }
  // Try the fingerprint fallback before nagging the user with a picker.
  if (typeof ref === "object") {
    const twin = await findByFingerprint(ref.name, ref.size, ref.lastModified);
    if (twin?.blob) {
      const storagePath = ref.storagePath ?? (await uploadToStorage(twin.blob as File));
      const nextRef: ImageRef = {
        id,
        storagePath,
        name: ref.name,
        size: ref.size,
        lastModified: ref.lastModified,
        contentType: ref.contentType,
        kind: ref.kind,
      };
      await safePut({ ...nextRef, blob: twin.blob }).catch(() => {});
      return { url: objectUrlFor(id, twin.blob), ref: nextRef };
    }
  }
  // Last resort: prompt the user to re-select the file.
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
  const storagePath = await uploadToStorage(file);
  const nextRef: ImageRef = {
    id,
    storagePath,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    contentType: file.type || undefined,
    kind,
  };
  const nextEntry: Entry = {
    ...nextRef,
    handle,
    blob: file,
  };
  await safePut(nextEntry);
  return { url: objectUrlFor(id, file), ref: nextRef };
}



export async function deleteImage(id: string) {
  const entry = await getEntry(id).catch(() => undefined);
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  if (entry?.storagePath) {
    await supabase.storage.from(BUCKET).remove([entry.storagePath]).catch(() => undefined);
  }
  await del(id).catch(() => undefined);
}
