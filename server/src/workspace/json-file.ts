import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sharedKv } from '../kv.ts'

/** Seller workspace files (tracker, memory) live here; git-ignored. Tests point MINI_AI_RUNTIME_DIR elsewhere. */
export function runtimeDir(): string {
  // An empty value (a blank line copied from .env.example) means "use the default", not the current folder.
  return process.env.MINI_AI_RUNTIME_DIR?.trim() || fileURLToPath(new URL('../../runtime/', import.meta.url))
}

/* ---------- Hosted mode: the same documents in shared storage (see kv.ts) ---------- */

const WORKSPACE_FILES = ['tracker.json', 'seller-memory.json'] as const
const kvKey = (name: string) => `workspace:${name}`
/** The documents as of the start of this request, loaded by hydrateWorkspace. */
const docs = new Map<string, unknown>()
const pending = new Set<Promise<void>>()

/**
 * Hosted mode only: loads the tracker and memory documents before a request runs, because the code that uses them
 * is synchronous and a request may land on an instance that has never seen them.
 */
export async function hydrateWorkspace(): Promise<void> {
  const kv = sharedKv()
  if (!kv) return
  const values = await kv.mget(WORKSPACE_FILES.map(kvKey))
  WORKSPACE_FILES.forEach((name, i) => {
    const raw = values[i]
    if (raw) docs.set(name, JSON.parse(raw))
    else docs.delete(name)
  })
}

/** Hosted mode only: waits until every change made by this request is saved. */
export async function flushWorkspace(): Promise<void> {
  while (pending.size) await Promise.all(pending)
}

/** A JSON document on disk (written atomically: temp file + rename), or in shared storage when hosted. */
export class JsonFile<T> {
  private name: string
  private file: string
  private fallback: () => T

  constructor(name: string, fallback: () => T) {
    this.name = name
    this.file = path.join(runtimeDir(), name)
    this.fallback = fallback
  }

  read(): T {
    if (sharedKv()) return docs.has(this.name) ? (structuredClone(docs.get(this.name)) as T) : this.fallback()
    if (!existsSync(this.file)) return this.fallback()
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as T
    } catch {
      console.error(`Could not read ${path.basename(this.file)}; starting empty.`)
      return this.fallback()
    }
  }

  write(value: T) {
    const kv = sharedKv()
    if (kv) {
      docs.set(this.name, structuredClone(value))
      const saving = kv.set(kvKey(this.name), JSON.stringify(value)).catch((error: unknown) => {
        console.error(`Could not save ${this.name}:`, error instanceof Error ? error.message : error)
      })
      pending.add(saving)
      void saving.finally(() => pending.delete(saving))
      return
    }
    mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`)
    renameSync(temp, this.file)
  }
}
