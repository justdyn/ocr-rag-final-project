/**
 * SPJ BFF (Phase B4+B5) — draft create/show/confirm JSON proxy + gated HTML
 * export passthrough + review UI. Totals/ownership stay upstream; no PATCH.
 */
import { createController } from 'remix/router'

import { FilesApiError } from '../../data/files.ts'
import {
  confirmSpjDraft,
  createSpjDraft,
  exportSpjDraft,
  getSpjDraft,
} from '../../data/spj.ts'
import { loadChatShellServerContext } from '../../data/shell-context.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'
import { ChatShellPage } from '../../ui/chat-shell-page.tsx'
import { SpjReviewPanel, type SpjDraftSerializable } from '../../ui/spj-review-panel.tsx'

function asErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof FilesApiError && error.status < 500) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  let message = error instanceof Error ? error.message : fallback
  return Response.json({ error: message }, { status: 502 })
}

export default createController(routes.spj, {
  actions: {
    async create({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        let draft = await createSpjDraft(auth, params.knowledgeId)
        return Response.json(draft)
      } catch (error) {
        return asErrorResponse(error, 'Draft create failed.')
      }
    },

    async show({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        let draft = await getSpjDraft(auth, params.draftId)
        return Response.json(draft)
      } catch (error) {
        return asErrorResponse(error, 'Draft lookup failed.')
      }
    },

    async confirm({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        let draft = await confirmSpjDraft(auth, params.draftId)
        return Response.json(draft)
      } catch (error) {
        return asErrorResponse(error, 'Draft confirm failed.')
      }
    },

    async exportDraft({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        let upstream = await exportSpjDraft(auth, params.draftId)
        if (!upstream.ok) {
          // Error bodies are tiny JSON (409 gate, 404 owner miss) — buffer and
          // pass status/body through untouched.
          let detail = await upstream.text()
          return new Response(detail, {
            status: upstream.status,
            headers: {
              'Content-Type':
                upstream.headers.get('Content-Type') ?? 'application/json',
            },
          })
        }
        // HTML attachment passthrough: stream upstream body + headers verbatim.
        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type':
              upstream.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
            'Content-Disposition':
              upstream.headers.get('Content-Disposition') ??
              `attachment; filename="spj-${params.draftId}.html"`,
          },
        })
      } catch (error) {
        return asErrorResponse(error, 'Draft export failed.')
      }
    },

    async review({ session, params, render }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let draft: Awaited<ReturnType<typeof getSpjDraft>>
      try {
        draft = await getSpjDraft(auth, params.draftId)
      } catch (error) {
        if (error instanceof FilesApiError && error.status === 404) {
          return new Response('Not Found', { status: 404 })
        }
        return asErrorResponse(error, 'Draft lookup failed.')
      }

      let shell = await loadChatShellServerContext(auth, {
        preferredKnowledgeId: draft.knowledge_id,
        hydrateChat: false,
      })

      let initialDraft: SpjDraftSerializable = {
        id: draft.id,
        knowledge_id: draft.knowledge_id,
        fields: draft.fields as SpjDraftSerializable['fields'],
        document_total_computed: draft.document_total_computed,
        confirmed: draft.confirmed,
      }

      return render(
        <ChatShellPage
          title="SPJ Review"
          authenticated
          activeNav="chat"
          activeKnowledgeId={shell.activeKnowledgeId}
          activeKnowledgeName={shell.activeKnowledgeName}
          chatKnowledgeId={shell.chatKnowledgeId}
          chatKnowledgeName={shell.chatKnowledgeName}
          activeConversationId={shell.activeConversationId}
          conversations={shell.conversations}
          userName={shell.userName}
          userEmail={shell.userEmail}
        >
          <SpjReviewPanel initialDraft={initialDraft} />
        </ChatShellPage>,
      )
    },
  },
})
