import 'server-only'
import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'

/** Thrown anywhere in a handler; `route()` turns it into `{ detail }` + status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (m: string) => new ApiError(400, m)
export const unauthorized = (m = 'Invalid token') => new ApiError(401, m)
export const forbidden = (m = 'Insufficient permissions') => new ApiError(403, m)
export const notFound = (m: string) => new ApiError(404, m)

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>

/**
 * Wraps a route handler: JSON-serialises plain return values, maps errors to the
 * `{ detail }` body the frontend already reads, never leaks internals on 500s.
 *
 * Each route file must still `export const dynamic = 'force-dynamic'`.
 */
export function route<C = unknown>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await handler(req, ctx)
      return out instanceof Response ? out : NextResponse.json(out ?? null)
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ detail: err.message }, { status: err.status })
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ detail: formatZod(err) }, { status: 400 })
      }
      console.error('Unhandled API error:', err)
      return NextResponse.json({ detail: 'Internal server error' }, { status: 500 })
    }
  }
}

/** JSON response that shared caches (Vercel CDN) may keep briefly. For rarely-changing public reads. */
export function cached(data: unknown, seconds = 30): Response {
  return NextResponse.json(data, {
    headers: { 'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}` },
  })
}

export function formatZod(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
}

export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw badRequest('Request body must be valid JSON')
  }
  return schema.parse(body)
}

/** Like parseJson, but a request with no body at all is treated as `{}` (for actions whose options are all optional). */
export async function parseJsonOptional<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text()
  if (!text.trim()) return schema.parse({})
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw badRequest('Request body must be valid JSON')
  }
  return schema.parse(body)
}

export function parseQuery<S extends z.ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return schema.parse(params)
}
