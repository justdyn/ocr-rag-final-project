/**
 * Server-only FastAPI base URL + fetch helper.
 * Lives in data/ as the persistence/API boundary (styleguide §2.1) — never import from clientEntry modules.
 */

const DEFAULT_BACKEND_API_URL = 'http://127.0.0.1:8000'

export function getBackendApiUrl(): string {
  let raw = process.env.BACKEND_API_URL?.trim()
  if (!raw) return DEFAULT_BACKEND_API_URL
  return raw.replace(/\/$/, '')
}

export type BackendFetchOptions = {
  method?: string
  /** JSON-serializable object, or FormData for multipart uploads (no Content-Type set). */
  body?: unknown
  /** When set, sent as `Authorization: Bearer <token>`. Never log or echo this. */
  accessToken?: string
  /** Override Accept (default application/json). Use text/event-stream for SSE proxies. */
  accept?: string
  signal?: AbortSignal
}

export async function backendFetch(
  path: string,
  options: BackendFetchOptions = {},
): Promise<Response> {
  let url = `${getBackendApiUrl()}${path.startsWith('/') ? path : `/${path}`}`
  let headers = new Headers({
    Accept: options.accept ?? 'application/json',
  })
  let body: BodyInit | undefined

  if (options.body instanceof FormData) {
    // Let fetch set multipart boundary — do not set Content-Type manually.
    body = options.body
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  if (options.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`)
  }

  return fetch(url, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body,
    signal: options.signal,
  })
}
