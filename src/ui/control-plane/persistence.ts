export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function loadJson<T>(storage: StorageLike, key: string, fallback: T): T {
  const item = storage.getItem(key)
  if (!item) {
    return fallback
  }

  try {
    return JSON.parse(item) as T
  } catch {
    return fallback
  }
}

export function saveJson<T>(storage: StorageLike, key: string, value: T) {
  storage.setItem(key, JSON.stringify(value))
}
