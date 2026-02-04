const DB_NAME = 'Cosmologist'
const DB_VERSION = 1
const STORE_SOURCES = 'projectSources'

function getIndexedDB(): IDBFactory | null {
  if (typeof indexedDB !== 'undefined') return indexedDB
  return null
}

let memoryStore = new Map<string, any>()

function openDB(): Promise<IDBDatabase> {
  const idb = getIndexedDB()
  if (!idb) return Promise.reject(new Error('indexedDB not available'))
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SOURCES)) {
        db.createObjectStore(STORE_SOURCES)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T = any>(storeName: string, key: string): Promise<T | undefined> {
  const idb = getIndexedDB()
  if (!idb) return memoryStore.get(`${storeName}:${key}`)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export async function idbSet(storeName: string, key: string, value: any): Promise<void> {
  const idb = getIndexedDB()
  if (!idb) {
    memoryStore.set(`${storeName}:${key}`, value)
    return
  }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDel(storeName: string, key: string): Promise<void> {
  const idb = getIndexedDB()
  if (!idb) {
    memoryStore.delete(`${storeName}:${key}`)
    return
  }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbClear(storeName: string): Promise<void> {
  const idb = getIndexedDB()
  if (!idb) {
    Array.from(memoryStore.keys()).forEach((k) => {
      if (k.startsWith(`${storeName}:`)) memoryStore.delete(k)
    })
    return
  }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export { STORE_SOURCES }
