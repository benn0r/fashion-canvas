const DB_NAME = 'fashion-canvas-images';
const STORE_NAME = 'images';
const PREFIX = 'fc-image://';
const objectUrls = new Map<string, string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local image storage.'));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (
    store: IDBObjectStore,
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void,
  ) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    action(tx.objectStore(STORE_NAME), resolve, reject);
    tx.oncomplete = () => database.close();
    tx.onerror = () => reject(tx.error ?? new Error('Local image storage failed.'));
  });
}

export async function storeImage(source: string, id: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not save generated image (${response.status}).`);
  const blob = await response.blob();
  await transaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return `${PREFIX}${id}`;
}

export async function resolveImage(reference: string): Promise<string> {
  if (!reference.startsWith(PREFIX)) return reference;
  const cached = objectUrls.get(reference);
  if (cached) return cached;
  const id = reference.slice(PREFIX.length);
  const blob = await transaction<Blob | undefined>('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!blob) return reference;
  const url = URL.createObjectURL(blob);
  objectUrls.set(reference, url);
  return url;
}

export async function deleteStoredImage(reference: string): Promise<void> {
  if (!reference.startsWith(PREFIX)) return;
  const cached = objectUrls.get(reference);
  if (cached) URL.revokeObjectURL(cached);
  objectUrls.delete(reference);
  await transaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(reference.slice(PREFIX.length));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function isImageStored(reference: string): boolean {
  return reference.startsWith(PREFIX);
}
