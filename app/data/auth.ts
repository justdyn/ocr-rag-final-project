/**
 * Auth API client + response types for the FastAPI `/api/auth/*` surface.
 * Co-located in data/ with the backend boundary (not a separate /types tree).
 */
import { backendFetch } from './backend.ts'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
  profile_image_url: string | null
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: AuthUser
}

export type AuthApiError = {
  status: number
  detail: string
}

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthApiError }

async function readDetail(response: Response): Promise<string> {
  try {
    let body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return 'Validation failed'
    return response.statusText || 'Request failed'
  } catch {
    return response.statusText || 'Request failed'
  }
}

export async function registerUser(input: {
  email: string
  password: string
  name: string
}): Promise<AuthResult<AuthUser>> {
  let response = await backendFetch('/api/auth/register', {
    method: 'POST',
    body: input,
  })

  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, detail: await readDetail(response) },
    }
  }

  return { ok: true, data: (await response.json()) as AuthUser }
}

export async function loginUser(input: {
  email: string
  password: string
}): Promise<AuthResult<TokenResponse>> {
  let response = await backendFetch('/api/auth/login', {
    method: 'POST',
    body: input,
  })

  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, detail: await readDetail(response) },
    }
  }

  return { ok: true, data: (await response.json()) as TokenResponse }
}

export async function fetchCurrentUser(
  accessToken: string,
): Promise<AuthResult<AuthUser>> {
  let response = await backendFetch('/api/auth/me', {
    method: 'GET',
    accessToken,
  })

  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, detail: await readDetail(response) },
    }
  }

  return { ok: true, data: (await response.json()) as AuthUser }
}

/** Backend logout is a stateless 204 acknowledgment; BFF still clears the cookie. */
export async function logoutUser(): Promise<void> {
  try {
    await backendFetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // Network failures must not block clearing the local session cookie.
  }
}

export async function updateProfileName(
  accessToken: string,
  name: string,
): Promise<AuthResult<AuthUser>> {
  let response = await backendFetch('/api/profile', {
    method: 'PATCH',
    body: { name: name.trim() },
    accessToken,
  })

  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, detail: await readDetail(response) },
    }
  }

  return { ok: true, data: (await response.json()) as AuthUser }
}

export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthResult<void>> {
  let response = await backendFetch('/api/profile/password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
    accessToken,
  })

  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, detail: await readDetail(response) },
    }
  }

  return { ok: true, data: undefined }
}

export async function uploadAvatar(
  accessToken: string,
  formData: FormData,
): Promise<AuthResult<AuthUser>> {
  let response = await backendFetch('/api/profile/avatar', {
    method: 'POST',
    body: formData,
    accessToken,
  })

  console.log('[uploadAvatar] response.status:', response.status, 'response.ok:', response.ok)
  if (!response.ok) {
    let detail = await readDetail(response)
    console.log('[uploadAvatar] error detail:', detail)
    return {
      ok: false,
      error: { status: response.status, detail },
    }
  }

  return { ok: true, data: (await response.json()) as AuthUser }
}

export async function getAvatar(
  accessToken: string,
): Promise<AuthResult<Response>> {
  let response = await backendFetch('/api/profile/avatar', {
    method: 'GET',
    accessToken,
  })

  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, detail: await readDetail(response) },
    }
  }

  return { ok: true, data: response }
}
