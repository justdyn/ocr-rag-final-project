/**
 * Main chat column — hero, thread, SSE send (app/ui/ clientEntry, §3.5).
 * Composer attach/implicit-KB lives in chat-shell-composer.tsx (§2.2).
 * Viewport follow / ↓ / generating dots: .docs/prd-chat-viewport.md.
 */
import { clientEntry, ref, type Handle, type SerializableProps } from 'remix/ui'

import { routes } from '../routes.ts'
import { ChatDockControls } from './chat-dock-controls.tsx'
import { ChatMessageBubble } from './chat-message-bubble.tsx'
import { ChatHero } from './chat-shell/chat-hero.tsx'
import { ShellMainHeader } from './chat-shell/main-header.tsx'
import {
  ChatModelSelector,
  type ModelOption,
} from './chat-shell/model-selector.tsx'
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
import {
  readPreferredChatModel,
  writePreferredChatModel,
} from '../utils/chat-model-preference.ts'
import { chatShellScopeKey } from '../utils/chat-shell-scope.ts'
import { shellChatHref } from '../utils/chat-shell-urls.ts'
import {
  createFollowScrollScheduler,
  isNearBottom,
  shouldEvaluateScroll,
} from '../utils/chat-scroll.ts'
import {
  animateGeneratingDots,
  animateScrollBottom,
  animateScrollFab,
} from '../utils/motion.ts'
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
import { takePendingChatKnowledge } from '../utils/library-attach.ts'

export interface ChatShellMainPanelProps extends SerializableProps {
  authenticated?: boolean
  activeKnowledgeId?: string | null
  activeKnowledgeName?: string | null
  initialConversationId?: string | null
  /** Hydrated generalist model id for an open thread. */
  initialLlmModel?: string | null
  initialMessages?: ChatMessage[]
}

export const ChatShellMainPanel = clientEntry(
  import.meta.url,
  function ChatShellMainPanel(handle: Handle<ChatShellMainPanelProps>) {
    let authenticated = handle.props.authenticated ?? false

    let knowledgeId: string | null = handle.props.activeKnowledgeId ?? null
    let knowledgeName: string | null = handle.props.activeKnowledgeName ?? null
    let conversationId: string | null = handle.props.initialConversationId ?? null
    let preferred = readPreferredChatModel()
    let selectedModelId: string | null =
      handle.props.initialLlmModel?.trim() || preferred?.id || null
    let selectedModelLabel: string =
      handle.props.initialLlmModel?.trim() || preferred?.name || ''
    let modelPickerOpen = false
    let messages: ChatMessage[] = cloneInitialMessages(handle.props.initialMessages ?? [])
    // Soft-nav reuses this clientEntry and only patches handle.props. Track the last
    // *props* scope we applied — never bump this for client-only advances (attach /
    // first message), or the next render would clobber them with stale SSR props.
    let appliedFromPropsKey = chatShellScopeKey(knowledgeId, conversationId)

    // Library "Add to chat" stashes scope then soft-navs home — apply once on mount.
    let pendingScope = takePendingChatKnowledge()
    if (pendingScope && !knowledgeId) {
      knowledgeId = pendingScope.id
      knowledgeName = pendingScope.name
      appliedFromPropsKey = chatShellScopeKey(
        handle.props.activeKnowledgeId,
        handle.props.initialConversationId,
      )
    }

    let streaming = false
    let streamError: ChatStreamError | null = null
    let showScopePrompt = false
    let animateLocalIds = new Set<string>()
    let listEl: HTMLElement | null = null
    let scrollFabEl: HTMLElement | null = null
    let generatingEl: HTMLElement | null = null
    let generatingDots: HTMLElement[] = []
    let abortController: AbortController | null = null
    let composerReset = 0
    let shouldAutoFollow = true
    let showScrollFab = false
    let boundScrollNode: HTMLElement | null = null
    let lastScrollTop: number | null = null

    let followScroll = createFollowScrollScheduler({
      getEl: () => listEl,
      shouldFollow: () => shouldAutoFollow,
      scrollToBottom: animateScrollBottom,
    })

    handle.signal.addEventListener('abort', () => {
      abortController?.abort()
      followScroll.cancel()
      if (boundScrollNode) {
        boundScrollNode.removeEventListener('scroll', onListScroll)
        boundScrollNode = null
      }
    })

    if (typeof window !== 'undefined') {
      let onNewChat = () => resetToNewChat()
      window.addEventListener(NEW_CHAT_EVENT, onNewChat)
      handle.signal.addEventListener('abort', () => {
        window.removeEventListener(NEW_CHAT_EVENT, onNewChat)
      })
    }

    function syncScrollFab(visible: boolean) {
      if (showScrollFab === visible) return
      showScrollFab = visible
      handle.update()
      handle.queueTask(() => {
        if (scrollFabEl) animateScrollFab(scrollFabEl, visible)
      })
    }

    function onListScroll() {
      if (!listEl) return
      let top = listEl.scrollTop
      // Our follow tween fires scroll events too, and lands short of the bottom
      // when content grew mid-tween — skip ours, always honor user scroll-up.
      let evaluate = shouldEvaluateScroll({
        top,
        lastTop: lastScrollTop,
        isProgrammaticScroll: followScroll.isProgrammaticScroll(),
      })
      lastScrollTop = top
      if (!evaluate) return
      let near = isNearBottom(listEl)
      shouldAutoFollow = near
      syncScrollFab(!near && messages.length > 0)
    }

    function bindListScroll(node: HTMLElement) {
      listEl = node
      if (boundScrollNode === node) return
      if (boundScrollNode) {
        boundScrollNode.removeEventListener('scroll', onListScroll)
      }
      boundScrollNode = node
      lastScrollTop = node.scrollTop
      node.addEventListener('scroll', onListScroll, { passive: true })
    }

    function requestFollowScroll() {
      handle.queueTask(() => followScroll.schedule())
    }

    function jumpToBottom() {
      shouldAutoFollow = true
      syncScrollFab(false)
      handle.queueTask(() => followScroll.followNow())
    }

    function syncGeneratingIndicator(active: boolean) {
      handle.queueTask(() => {
        if (generatingEl) {
          generatingEl.dataset.visible = active ? 'true' : 'false'
        }
        animateGeneratingDots(generatingDots, active)
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
      let fromThread = props.initialLlmModel?.trim() || null
      if (fromThread) {
        selectedModelId = fromThread
        selectedModelLabel = fromThread
      } else {
        let keep = readPreferredChatModel()
        selectedModelId = keep?.id || selectedModelId
        selectedModelLabel = keep?.name || selectedModelLabel
      }
      messages = cloneInitialMessages(props.initialMessages ?? [])
      appliedFromPropsKey = chatShellScopeKey(knowledgeId, conversationId)
      composerReset += 1
      shouldAutoFollow = true
      syncScrollFab(false)
      syncGeneratingIndicator(false)
      if (messages.length > 0) requestFollowScroll()
    }

    function resetToNewChat() {
      abortController?.abort()
      abortController = null
      streaming = false
      knowledgeId = null
      knowledgeName = null
      conversationId = null
      // Keep latest selected model on New chat / empty `/` (MS-8).
      let keep = readPreferredChatModel()
      if (keep) {
        selectedModelId = keep.id
        selectedModelLabel = keep.name
      }
      messages = []
      streamError = null
      showScopePrompt = false
      shouldAutoFollow = true
      syncScrollFab(false)
      syncGeneratingIndicator(false)
      appliedFromPropsKey = chatShellScopeKey(
        handle.props.activeKnowledgeId,
        handle.props.initialConversationId,
      )
      composerReset += 1
      handle.update()
    }

    function onModelSelect(model: ModelOption) {
      selectedModelId = model.id
      selectedModelLabel = model.name
      writePreferredChatModel(model)
      handle.update()
      if (!conversationId) return
      void fetch(routes.chat.rename.href({ conversationId }), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ llm_model: model.id }),
      }).catch(() => {
        /* selection still applies to next send even if PATCH fails */
      })
    }

    function onCatalogHint(model: ModelOption) {
      let id = model.id.trim()
      if (!id) return
      if (!selectedModelId) {
        selectedModelId = id
        selectedModelLabel = model.name.trim() || id
        writePreferredChatModel({ id: selectedModelId, name: selectedModelLabel })
        handle.update()
        return
      }
      if (selectedModelId === id) {
        let name = model.name.trim() || id
        if (name !== selectedModelLabel) {
          selectedModelLabel = name
          writePreferredChatModel({ id, name })
          handle.update()
        }
      }
    }

    function onModelPickerOpenChange(open: boolean) {
      if (modelPickerOpen === open) return
      modelPickerOpen = open
      handle.update()
    }

    function onScopeReady(id: string, name: string) {
      knowledgeId = id
      knowledgeName = name
      showScopePrompt = false
      handle.update()
      window.history.replaceState(
        null,
        '',
        conversationId ? shellChatHref(conversationId) : routes.home.href(),
      )
    }

    async function sendQuery(query: string, sent: SentAttachment[]) {
      if (!query || streaming) return

      if (!authenticated) {
        window.location.href = routes.login.index.href()
        return
      }

      if (!knowledgeId) {
        showScopePrompt = true
        handle.update()
        return
      }

      streamError = null
      showScopePrompt = false
      streaming = true
      shouldAutoFollow = true
      syncScrollFab(false)
      syncGeneratingIndicator(true)

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
      requestFollowScroll()

      abortController?.abort()
      abortController = new AbortController()

      let priorConversationId = conversationId
      let upsertedConversationId: string | null = null
      let lastUpsertedTitle: string | null = null
      let state: ChatStreamMutableState = {
        messages,
        conversationId,
        conversationTitle: null,
        streamError: null,
        animateLocalIds,
      }

      function maybeUpsertConversation() {
        if (!knowledgeId || !state.conversationId) {
          return
        }
        let isNewThread =
          !priorConversationId || priorConversationId !== state.conversationId
        if (!isNewThread && state.conversationTitle == null) {
          return
        }
        let title = state.conversationTitle ?? conversationTitleFromQuery(query)
        if (
          upsertedConversationId === state.conversationId &&
          lastUpsertedTitle === title
        ) {
          return
        }
        upsertedConversationId = state.conversationId
        lastUpsertedTitle = title
        let now = Math.floor(Date.now() / 1000)
        dispatchConversationUpsert({
          knowledgeId,
          conversation: {
            id: state.conversationId,
            title,
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
          model: selectedModelId,
          attachmentFileIds: sent.map((row) => row.fileId),
          state,
          assistantLocalId: assistantMsg.localId,
          signal: abortController.signal,
          onUpdate: () => {
            messages = state.messages
            conversationId = state.conversationId
            streamError = state.streamError
            maybeUpsertConversation()
            if (state.conversationId) {
              window.history.replaceState(
                null,
                '',
                shellChatHref(state.conversationId),
              )
            }
            handle.update()
            requestFollowScroll()
          },
        })
        messages = state.messages
        conversationId = state.conversationId
        streamError = state.streamError
        maybeUpsertConversation()
        if (conversationId) {
          window.history.replaceState(null, '', shellChatHref(conversationId))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          streaming = false
          syncGeneratingIndicator(false)
          handle.update()
          return
        }
        streamError = {
          code: 'network',
          detail: 'Could not reach the chat service. Check your connection.',
        }
      }

      streaming = false
      syncGeneratingIndicator(false)
      handle.update()
      requestFollowScroll()
    }

    return () => {
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
        <div
          mix={mainStyle}
          data-model-picker-open={modelPickerOpen ? 'true' : 'false'}
        >
          <ShellMainHeader
            authenticated={authenticated}
            glassChrome
            modelControl={
              authenticated ? (
                <ChatModelSelector
                  glassChrome
                  selectedModelId={selectedModelId}
                  selectedModelLabel={selectedModelLabel}
                  onSelect={onModelSelect}
                  onCatalogHint={onCatalogHint}
                  onOpenChange={onModelPickerOpenChange}
                />
              ) : undefined
            }
          />
          <div
            mix={[
              chatScrollRegionStyle,
              ref((node) => {
                if (node) bindListScroll(node as HTMLElement)
              }),
            ]}
            data-empty={showEmptyStage ? 'true' : 'false'}
            data-lenis-prevent=""
          >
            <div mix={chatColumnStyle}>
              <div
                mix={showEmptyStage ? emptyStageStyle : emptyStageHiddenStyle}
                aria-hidden={showEmptyStage ? undefined : 'true'}
              >
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
          <div
            mix={composerDockStyle}
            data-composer-dock=""
            data-empty={showEmptyStage ? 'true' : 'false'}
            aria-hidden={modelPickerOpen ? 'true' : undefined}
          >
            <div mix={chatColumnStyle}>
              <ChatDockControls
                showScrollFab={showScrollFab}
                streaming={streaming}
                empty={showEmptyStage}
                onJumpToBottom={jumpToBottom}
                onScrollFabRef={(el) => {
                  scrollFabEl = el
                }}
                onGeneratingRef={(el) => {
                  generatingEl = el
                }}
                onDotRef={(index, el) => {
                  if (el) generatingDots[index] = el
                }}
              />
              {composer}
            </div>
          </div>
        </div>
      )
    }
  },
)
