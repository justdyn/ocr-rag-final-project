/**
 * Settings Admin LLM Config — thin JSON proxy to FastAPI /api/admin/llm-config.
 * Never hydrates plaintext keys into HTML or logs (styleguide §3.5, FR-14).
 * Controllers stay thin: parse, call backend, return Response (styleguide §2.4).
 */
import { createController } from 'remix/router'

import { backendFetch } from '../../../data/backend.ts'
import { requireAuthFromSession } from '../../../middleware/require-auth.ts'
import { routes } from '../../../routes.ts'

// Response shape matches FastAPI LlmConfigResponse
type LlmConfigResponse = {
  configured: boolean
  key_suffix: string | null
  base_url: string | null
  default_model: string | null
  source: 'db' | 'env'
  updated_at: number | null
}

// Request shape for PUT — all fields optional; empty string = clear override
type LlmConfigPutRequest = {
  api_key?: string
  base_url?: string
  model?: string
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export default createController(routes.settings.admin.llmConfig, {
  actions: {
    async get({ session }) {
      let auth = requireAuthFromSession(session)
      if (auth instanceof Response) return auth

      let response = await backendFetch('/api/admin/llm-config', {
        method: 'GET',
        accessToken: auth,
      })

      if (!response.ok) {
        // Non-admin gets 404 from FastAPI — pass through
        return Response.json(
          { error: 'Not found' },
          { status: response.status },
        )
      }

      let body = (await response.json()) as LlmConfigResponse
      // Never log the full response — key_suffix is already masked
      return Response.json(body)
    },

    async put({ request, session }) {
      let auth = requireAuthFromSession(session)
      if (auth instanceof Response) return auth

      let body = (await readJsonBody(request)) as LlmConfigPutRequest | null
      if (!body) {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      // Forward only provided fields; undefined = omit (preserve existing)
      // Empty string = clear override (FastAPI handles this)
      let payload: LlmConfigPutRequest = {}
      if (body.api_key !== undefined) payload.api_key = body.api_key
      if (body.base_url !== undefined) payload.base_url = body.base_url
      if (body.model !== undefined) payload.model = body.model

      let response = await backendFetch('/api/admin/llm-config', {
        method: 'PUT',
        body: payload,
        accessToken: auth,
      })

      if (!response.ok) {
        // 404 for non-admin, 422 for validation errors — pass through
        let detail = 'Request failed'
        try {
          let errBody = await response.json()
          detail = errBody.detail ?? errBody.error ?? detail
        } catch {
          // ignore
        }
        return Response.json({ error: detail }, { status: response.status })
      }

      let result = (await response.json()) as LlmConfigResponse
      // Never log the full response
      return Response.json(result)
    },
  },
})