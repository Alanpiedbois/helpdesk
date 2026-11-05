/** Error carrying the HTTP status, so callers can react to 401, 404, 409... */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Thin fetch wrapper. Requests go to /api, proxied to NestJS by Vite (see vite.config.ts).
 * The session cookie is sent automatically: same origin, httpOnly, never touched by JS.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })

  if (!res.ok) {
    // NestJS errors look like { statusCode, message: string | string[] }.
    const data = await res.json().catch(() => null)
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new ApiError(res.status, message ?? res.statusText)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
