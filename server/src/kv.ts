/**
 * Shared key-value storage for hosting on serverless functions (Vercel), where each request can land on a different
 * instance and the file system is read-only. Uses Upstash Redis over its REST API (no extra package).
 *
 * Off unless the host provides the store's URL and token (KV_REST_API_URL / KV_REST_API_TOKEN from the Vercel
 * Marketplace, or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Locally and in tests nothing changes: the
 * tracker and memory stay in server/runtime and conversations in memory.
 */
export interface Kv {
  get(key: string): Promise<string | null>
  mget(keys: string[]): Promise<Array<string | null>>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
}

/** Every key this app writes starts with this, so the store can be shared safely. */
export const KV_PREFIX = 'miniai:'

export function kvFromEnv(env: NodeJS.ProcessEnv = process.env): Kv | null {
  const url = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '')
  const token = (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  if (!url || !token) return null
  return upstashKv(url, token)
}

export function upstashKv(url: string, token: string): Kv {
  const call = async (command: Array<string | number>): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    })
    const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null
    // The message names the command and status only, never the token.
    if (!res.ok || !body || body.error) throw new Error(`Storage ${command[0]} failed (${res.status}${body?.error ? `: ${body.error}` : ''})`)
    return body.result ?? null
  }
  return {
    get: async (key) => (await call(['GET', KV_PREFIX + key])) as string | null,
    mget: async (keys) => (keys.length ? ((await call(['MGET', ...keys.map((k) => KV_PREFIX + k)])) as Array<string | null>) : []),
    set: async (key, value, ttlSeconds) => {
      await call(ttlSeconds ? ['SET', KV_PREFIX + key, value, 'EX', Math.max(1, Math.round(ttlSeconds))] : ['SET', KV_PREFIX + key, value])
    },
    del: async (key) => {
      await call(['DEL', KV_PREFIX + key])
    },
  }
}

let shared: Kv | null | undefined

/** The app's store, read from the environment once. Tests replace it with setSharedKv. */
export function sharedKv(): Kv | null {
  if (shared === undefined) shared = kvFromEnv()
  return shared
}

export function setSharedKv(kv: Kv | null) {
  shared = kv
}
