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

function pickFileFallback(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Not all browsers fire oncancel — resolve null on next tick if unused.
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** Prompt the user for an image, persist a reference to it, return the ref. */
export async function pickImageAndStore(): Promise<ImageRef | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const id = crypto.randomUUID();
  if (hasFSAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Imagens",
            accept: {
              "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"],
            },
          },
        ],
        multiple: false,
        excludeAcceptAllOption: false,
      });
      const file = await handle.getFile();
      const ref: ImageRef = {
        id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      };
      await put({ ...ref, handle });
      return ref;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
      // Fall through to fallback
    }
  }
  const file = await pickFileFallback();
  if (!file) return null;
  const ref: ImageRef = {
    id,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
  await put({ ...ref, blob: file });
  return ref;
}

async function readHandle(
  entry: Entry,
  interactive: boolean,
): Promise<string | null> {
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
    const file: File = await entry.handle.getFile();
    const url = URL.createObjectURL(file);
    urlCache.set(entry.id, url);
    return url;
  } catch {
    return null;
  }
}

/** Try to resolve an image without a user gesture. Returns null if unavailable
 *  (file moved/renamed/deleted, or the browser needs a permission prompt). */
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
  return readHandle(entry, false);
}

/** Called from a user gesture (button click) to reconnect a broken image. */
export async function requestImageAccess(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const entry = await getEntry(id).catch(() => undefined);
  if (!entry) return null;
  if (entry.blob) {
    const url = URL.createObjectURL(entry.blob);
    urlCache.set(id, url);
    return url;
  }
  return readHandle(entry, true);
}

export async function deleteImage(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  await del(id).catch(() => undefined);
}
