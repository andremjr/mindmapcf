// Local image storage for mind-map nodes.
// Prefers the File System Access API (persists a handle → reads the same
// file from disk on later sessions). Falls back to storing the Blob in
// IndexedDB when the API is unavailable. Nothing is ever sent to Supabase.

const DB_NAME = "mindmap-images";
const STORE = "images";

export interface ImageRef {
  id: string;
  name: string;
  size: number;
  lastModified: number;
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

function hasFSAccess() {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
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
 *  We always cache the file bytes in IndexedDB (local-only, never uploaded)
 *  so page reloads work without a permission re-prompt. When the File System
 *  Access API is available we ALSO keep the handle so future edits to the
 *  same file on disk can refresh the cached bytes. */
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
      const ref: ImageRef = {
        id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        kind,
      };
      // Cache the bytes so a reload works without re-permission, and keep the
      // handle so we can re-read from disk if the user updates the file.
      await put({ ...ref, handle, blob: file });
      return ref;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
      // Fall through to fallback
    }
  }
  const file = await pickFileFallback(mime);
  if (!file) return null;
  const ref: ImageRef = {
    id,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    kind,
  };
  await put({ ...ref, blob: file });
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
 *  reloads), then tries the handle silently. Returns null only when the
 *  entry is missing entirely. */
export async function resolveImage(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const entry = await getEntry(id).catch(() => undefined);
  if (!entry) return null;
  if (entry.blob) {
    const url = URL.createObjectURL(entry.blob);
    urlCache.set(id, url);
    return url;
  }
  const file = await tryReadHandle(entry, false);
  if (file) {
    const url = URL.createObjectURL(file);
    urlCache.set(id, url);
    // Backfill blob cache so future reloads don't need permission.
    await put({ ...entry, blob: file }).catch(() => {});
    return url;
  }
  return null;
}

/** Called from a user gesture to reconnect a broken reference. Tries the
 *  stored handle first; if that fails (permission denied, file moved,
 *  handle lost), opens a fresh file picker so the user can point at the
 *  file again. The new selection reuses the same id, so every node that
 *  referenced it lights up at once. */
export async function requestImageAccess(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const entry = await getEntry(id).catch(() => undefined);
  if (entry?.blob) {
    const url = URL.createObjectURL(entry.blob);
    urlCache.set(id, url);
    return url;
  }
  if (entry) {
    const file = await tryReadHandle(entry, true);
    if (file) {
      const url = URL.createObjectURL(file);
      urlCache.set(id, url);
      await put({ ...entry, blob: file }).catch(() => {});
      return url;
    }
  }
  // Last resort: prompt the user to re-select the file.
  const kind = entry?.kind ?? "image";
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
  const nextEntry: Entry = {
    id,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    kind,
    handle,
    blob: file,
  };
  await put(nextEntry);
  const url = URL.createObjectURL(file);
  urlCache.set(id, url);
  return url;
}


export async function deleteImage(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  await del(id).catch(() => undefined);
}
