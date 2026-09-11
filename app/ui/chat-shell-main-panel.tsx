/**
 * Main chat column — hero, thread, SSE send (app/ui/ clientEntry, §3.5).
 * Composer attach/implicit-KB lives in chat-shell-composer.tsx (§2.2).
 */
import { clientEntry, ref, type Handle, type SerializableProps } from 'remix/ui'

import { routes } from '../routes.ts'
import { ChatMessageBubble } from './chat-message-bubble.tsx'
import { ChatHero } from './chat-shell/chat-hero.tsx'
import { LegalFooter } from './chat-shell/legal-footer.tsx'
import { ShellMainHeader } from './chat-shell/main-header.tsx'
import { ChatShellComposer } from './chat-shell-composer.tsx'
import {
  chatColumnStyle,
  chatScrollRegionStyle,
  chatThreadHiddenStyle,
  chatThreadStyle,
  composerDockStyle,
  emptyStageHiddenStyle,
  emptyStageStyle,
  mainStyle,
  scopePromptBodyStyle,
  scopePromptStyle,
  scopePromptTitleStyle,
  shellAlertStyle,
} from './styles/chat-shell/main-styles.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { chatShellScopeKey } from '../utils/chat-shell-scope.ts'
import { shellChatHref } from '../utils/chat-shell-urls.ts'
import { animateScrollBottom } from '../utils/motion.ts'
import {
  chatErrorBannerCopy,
  cloneInitialMessages,
  newChatLocalId,
  runKnowledgeChatStream,
  type ChatStreamMutableState,
} from '../utils/chat-stream-client.ts'
import type { ChatMessage, ChatStreamError } from '../utils/chat-types.ts'
import type { SentAttachment } from '../utils/composer-attachments.ts'
import {
  conversationTitleFromQuery,
  dispatchConversationUpsert,
  NEW_CHAT_EVENT,
} from '../utils/new-chat.ts'

export interface ChatShellMainPanelProps extends SerializableProps {
  authenticated?: boolean
  activeKnowledgeId?: string | null
  activeKnowledgeName?: string | null
  initialConversationId?: string | null
  initialMessages?: ChatMessage[]
}

export const ChatShellMainPanel = clientEntry(
  import.meta.url,
  function ChatShellMainPanel(handle: Handle<ChatShellMainPanelProps>) {
    let authenticated = handle.props.authenticated ?? false

    let knowledgeId: string | null = handle.props.activeKnowledgeId ?? null
    let knowledgeName: string | null = handle.props.activeKnowledgeName ?? null
    let conversationId: string | null = handle.props.initialConversationId ?? null
    let messages: ChatMessage[] = cloneInitialMessages(handle.props.initialMessages ?? [])
    // Soft-nav reuses this clientEntry and only patches handle.props. Track the last
    // *props* scope we applied — never bump this for client-only advances (attach /
    // first message), or the next render would clobber them with stale SSR props.
    let appliedFromPropsKey = chatShellScopeKey(knowledgeId, conversationId)

    let streaming = false
    let streamError: ChatStreamError | null = null
    let showScopePrompt = false
    let animateLocalIds = new Set<string>()
    let listEl: HTMLElement | null = null
    let abortController: AbortController | null = null
    let composerReset = 0

    handle.signal.addEventListener('abort', () => {
      abortController?.abort()
    })

    if (typeof window !== 'undefined') {
      let onNewChat = () => resetToNewChat()
      window.addEventListener(NEW_CHAT_EVENT, onNewChat)
      handle.signal.addEventListener('abort', () => {
        window.removeEventListener(NEW_CHAT_EVENT, onNewChat)
      })
    }

    function scrollToBottom() {
      handle.queueTask(() => {
        if (listEl) animateScrollBottom(listEl)
      })
    }

    function applyServerScope(props: ChatShellMainPanelProps) {
      abortController?.abort()
      abortController = null
      streaming = false
      streamError = null
      showScopePrompt = false
      knowledgeId = props.activeKnowledgeId ?? null
      knowledgeName = props.activeKnowledgeName ?? null
      conversationId = props.initialConversationId ?? null
      messages = cloneInitialMessages(props.initialMessages ?? [])
      appliedFromPropsKey = chatShellScopeKey(knowledgeId, conversationId)
      composerReset += 1
      // The full-bleed chat region owns scroll now (root Lenis no longer resets
      // document scroll for us) — a soft-nav into another conversation starts pinned low.
      if (messages.length > 0) scrollToBottom()
    }

    function resetToNewChat() {
      abortController?.abort()
      abortController = null
      streaming = false
      knowledgeId = null
      knowledgeName = null
      conversationId = null
      messages = []
      streamError = null
      showScopePrompt = false
      // Acknowledge current props so this clear is not undone by stale SSR props
      // before soft-nav to `/` delivers empty ones.
      appliedFromPropsKey = chatShellScopeKey(
        handle.props.activeKnowledgeId,
        handle.props.initialConversationId,
      )
      composerReset += 1
      handle.update()
    }

    function onScopeReady(id: string, name: string) {
      knowledgeId = id
      knowledgeName = name
      showScopePrompt = false
      handle.update()
      window.history.replaceState(null, '', shellChatHref(id, conversationId))
    }

    async function sendQuery(query: string, sent: SentAttachment[]) {
      if (!query || streaming) return

      if (!authenticated) {
        window.location.href = routes.login.index.href()
        return
      }

      // Attach path is the only way to get a knowledgeId (implicit auto-KB).
      if (!knowledgeId) {
        showScopePrompt = true
        handle.update()
        return
      }

      streamError = null
      showScopePrompt = false
      streaming = true

      // Optimistic snapshot: file_id/filename only — server metadata (MIME,
      // extraction, excerpt) fills in after reload/soft-nav re-apply.
      let attachments = sent.map((row) => ({
        file_id: row.fileId,
        filename: row.filename,
        content_type: null,
        extraction_method: null,
        ocr_confidence: null,
        text_excerpt: null,
      }))
      let userMsg: ChatMessage = {
        localId: newChatLocalId('user'),
        role: 'user',
        content: query,
        sources: [],
        attachments: attachments.length > 0 ? attachments : undefined,
      }
      let assistantMsg: ChatMessage = {
        localId: newChatLocalId('asst'),
        role: 'assistant',
        content: '',
        sources: [],
      }
      animateLocalIds.add(userMsg.localId)
      animateLocalIds.add(assistantMsg.localId)
      messages = [...messages, userMsg, assistantMsg]
      handle.update()
      scrollToBottom()

      abortController?.abort()
      abortController = new AbortController()

      let priorConversationId = conversationId
      let upsertedConversationId: string | null = null
      let state: ChatStreamMutableState = {
        messages,
        conversationId,
        streamError: null,
        animateLocalIds,
      }

      function maybeUpsertConversation() {
        if (
          !knowledgeId ||
          !state.conversationId ||
          upsertedConversationId === state.conversationId
        ) {
          return
        }
        if (priorConversationId && priorConversationId === state.conversationId) {
          return
        }
        upsertedConversationId = state.conversationId
        let now = Math.floor(Date.now() / 1000)
        dispatchConversationUpsert({
          knowledgeId,
          conversation: {
            id: state.conversationId,
            title: conversationTitleFromQuery(query),
            created_at: now,
            updated_at: now,
          },
        })
      }

      try {
        await runKnowledgeChatStream({
          knowledgeId,
          query,
          conversationId,
          attachmentFileIds: sent.map((row) => row.fileId),
          state,
          assistantLocalId: assistantMsg.localId,
          signal: abortController.signal,
          onUpdate: () => {
            messages = state.messages
            conversationId = state.conversationId
            streamError = state.streamError
            maybeUpsertConversation()
            // Pin conversation into the URL as soon as SSE reveals it (sources),
            // not only after `done` — F5 during "Thinking…" must still hydrate.
            if (knowledgeId && state.conversationId) {
              window.history.replaceState(
                null,
                '',
                shellChatHref(knowledgeId, state.conversationId),
              )
            }
            handle.update()
            scrollToBottom()
          },
        })
        messages = state.messages
        conversationId = state.conversationId
        streamError = state.streamError
        maybeUpsertConversation()
        if (knowledgeId && conversationId) {
          window.history.replaceState(null, '', shellChatHref(knowledgeId, conversationId))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          streaming = false
          handle.update()
          return
        }
        streamError = {
          code: 'network',
          detail: 'Could not reach the chat service. Check your connection.',
        }
      }

      streaming = false
      handle.update()
      scrollToBottom()
    }

    return () => {
      // Props update on soft-nav without setup re-running (Remix clientEntry reuse).
      let propScopeKey = chatShellScopeKey(
        handle.props.activeKnowledgeId,
        handle.props.initialConversationId,
      )
      if (propScopeKey !== appliedFromPropsKey) {
        applyServerScope(handle.props)
      }

      let inChatMode =
        authenticated &&
        (messages.length > 0 || Boolean(knowledgeId && conversationId))
      let banner = streamError ? chatErrorBannerCopy(streamError) : null
      // Empty stage = no thread yet. Keep the same DOM hosts either way —
      // swapping trees (composer parent, fragment vs <main>) double-mounts
      // nested clientEntry on F5 / soft-nav (handoff §6).
      let showEmptyStage = !inChatMode

      let composer = (
        <ChatShellComposer
          authenticated={authenticated}
          knowledgeId={knowledgeId}
          knowledgeName={knowledgeName}
          streaming={streaming}
          resetGeneration={composerReset}
          onSend={(query, sent) => {
            void sendQuery(query, sent)
          }}
          onScopeReady={onScopeReady}
        />
      )

      return (
        <div mix={mainStyle}>
          <ShellMainHeader
            authenticated={authenticated}
            knowledgeName={knowledgeName}
          />
          <div
            mix={[
              chatScrollRegionStyle,
              ref((node) => {
                listEl = node as HTMLElement
              }),
            ]}
            data-empty={showEmptyStage ? 'true' : 'false'}
            // Nested scroller opts out of the root Lenis hijack (§4.3).
            data-lenis-prevent=""
          >
            <div mix={chatColumnStyle}>
              <div
                mix={showEmptyStage ? emptyStageStyle : emptyStageHiddenStyle}
                aria-hidden={showEmptyStage ? undefined : 'true'}
              >
                {/* Always mount hero — hide via parent data/CSS when in-thread.
                    Scope prompt is overlay content, not a chrome swap. */}
                <div
                  mix={showScopePrompt ? emptyStageHiddenStyle : undefined}
                  aria-hidden={showScopePrompt ? 'true' : undefined}
                >
                  <ChatHero />
                </div>
                {showScopePrompt ? (
                  <div mix={scopePromptStyle} role="dialog" aria-labelledby="scope-prompt-title">
                    <h2 id="scope-prompt-title" mix={scopePromptTitleStyle}>
                      {SHELL_COPY.scopePromptTitle}
                    </h2>
                    <p mix={scopePromptBodyStyle}>{SHELL_COPY.scopePromptBody}</p>
                  </div>
                ) : null}
              </div>
              {banner ? (
                <div mix={shellAlertStyle} role="alert">
                  <strong>{banner.title}</strong>
                  <div>{banner.body}</div>
                </div>
              ) : null}
              <ul
                mix={
                  showEmptyStage
                    ? [chatThreadStyle, chatThreadHiddenStyle]
                    : chatThreadStyle
                }
                aria-live="polite"
                aria-hidden={showEmptyStage ? 'true' : undefined}
              >
                {messages.map((message) => {
                  let shouldAnimate = animateLocalIds.has(message.localId)
                  if (shouldAnimate) animateLocalIds.delete(message.localId)
                  return (
                    <ChatMessageBubble
                      key={message.localId}
                      message={message}
                      animateEntrance={shouldAnimate}
                    />
                  )
                })}
              </ul>
            </div>
          </div>
          <div mix={composerDockStyle}>
            <div mix={chatColumnStyle}>{composer}</div>
            <LegalFooter />
          </div>
        </div>
      )
    }
  },
)
