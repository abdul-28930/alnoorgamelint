import type { SupabaseClient } from '@supabase/supabase-js'

type Result = { data?: unknown; error?: unknown; count?: number | null }
type Resolver = Result | ((calls: Call[]) => Result)
export interface Call { method: string; args: unknown[] }

/**
 * Minimal chainable stand-in for the Supabase client. `tables[name]` / `rpcs[name]` give the result of
 * awaiting any query on that table / rpc (a function receives the recorded chain, so tests can branch on it).
 */
export function fakeDb(config: { tables?: Record<string, Resolver>; rpcs?: Record<string, Resolver> } = {}) {
  const log: { table?: string; rpc?: string; calls: Call[] }[] = []

  const builder = (entry: { calls: Call[] }, resolve: () => Result): unknown =>
    new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const r = resolve()
          return (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: null, ...r }).then(ok)
        }
        return (...args: unknown[]) => {
          entry.calls.push({ method: prop, args })
          return builder(entry, resolve)
        }
      },
    })

  const db = {
    from(table: string) {
      const entry = { table, calls: [] as Call[] }
      log.push(entry)
      const r = config.tables?.[table] ?? {}
      return builder(entry, () => (typeof r === 'function' ? r(entry.calls) : r))
    },
    rpc(name: string, args: unknown) {
      const entry = { rpc: name, calls: [{ method: 'rpc', args: [args] }] as Call[] }
      log.push(entry)
      const r = config.rpcs?.[name] ?? {}
      return builder(entry, () => (typeof r === 'function' ? r(entry.calls) : r))
    },
  }
  return { db: db as unknown as SupabaseClient, log }
}

export const rpcArgs = (log: ReturnType<typeof fakeDb>['log'], name: string) =>
  log.find((e) => e.rpc === name)?.calls[0].args[0] as Record<string, unknown> | undefined
