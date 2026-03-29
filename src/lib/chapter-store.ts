import type { ChapterChunk } from './chapter-split'

const DB_NAME = 'novel-cefr-storage'
const DB_VERSION = 1
const STORE_NAME = 'chapters'

type StoredChapterRecord = {
  reportId: string
  chapters: ChapterChunk[]
}

function openChapterDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'reportId' })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open chapter storage.'))
    }
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available.'))
  }

  return openChapterDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)

    transaction.oncomplete = () => {
      database.close()
    }

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Chapter storage transaction failed.'))
      database.close()
    }

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Chapter storage transaction was aborted.'))
      database.close()
    }

    action(store, resolve, reject)
  }))
}

export function saveStoredChapters(reportId: string, chapters: ChapterChunk[]): Promise<void> {
  return withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({ reportId, chapters } satisfies StoredChapterRecord)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to save chapters.'))
    }
  })
}

export function loadStoredChapters(reportId: string): Promise<ChapterChunk[] | null> {
  return withStore<ChapterChunk[] | null>('readonly', (store, resolve, reject) => {
    const request = store.get(reportId)

    request.onsuccess = () => {
      const result = request.result as StoredChapterRecord | undefined
      resolve(result?.chapters ?? null)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to load chapters.'))
    }
  })
}

export function deleteStoredChapters(reportId: string): Promise<void> {
  return withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(reportId)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to delete chapters.'))
    }
  })
}