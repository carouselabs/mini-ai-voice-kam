import { useEffect, useState } from 'react'

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : stored === 'true'
  } catch {
    return fallback
  }
}

/** A boolean remembered in this browser only. Falls back silently when storage is blocked. */
export function usePersistentBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => read(key, fallback))

  useEffect(() => {
    try {
      window.localStorage.setItem(key, String(value))
    } catch {
      // Storage can be unavailable (private mode, blocked site data). The UI still works.
    }
  }, [key, value])

  return [value, setValue] as const
}
