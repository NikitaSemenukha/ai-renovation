/**
 * Хранение загруженных файлов планов в IndexedDB браузера (прототип).
 * localStorage для этого не подходит: лимит ~5 МБ и только строки.
 * На следующем этапе заменяется загрузкой на сервер (S3-совместимое хранилище).
 */
const DB_NAME = 'air-files';
const STORE = 'plans';

export const DRAFT_FILE_KEY = 'draft';
export const projectFileKey = (projectId: string) => `project:${projectId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const fileStore = {
  put: (key: string, file: Blob) => run('readwrite', (s) => s.put(file, key)).then(() => undefined),
  get: (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key)),
  remove: (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined),
  async copy(from: string, to: string) {
    const blob = await fileStore.get(from);
    if (blob) await fileStore.put(to, blob);
    else await fileStore.remove(to);
  },
};

/** Ошибки хранилища не должны ломать мастер: логируем и продолжаем без файла. */
export function logFileError(action: string, err: unknown) {
  console.error(`[fileStore] ${action} failed`, err);
}
