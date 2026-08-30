/**
 * One chat bubble — citation-aware for assistant turns.
 */
import type { Handle } from 'remix/ui'

import { ChatCitationReveal } from './chat-citation-reveal.tsx'
import {
  segmentCitedContent,
  sourceByCitationId,
} from '../utils/chat-citations.ts'
import type { ChatMessage } from '../utils/chat-types.ts'
import { entranceFast } from '../utils/motion.ts'

export type ChatMessageBubbleProps = {
  message: ChatMessage
  /** Animate entrance once (new bubble / sentence boundary), not every token. */
  animateEntrance?: boolean
}

export function ChatMessageBubble(handle: Handle<ChatMessageBubbleProps>) {
  return () => {
    let { message, animateEntrance = false } = handle.props
    let isUser = message.role === 'user'
    let segments = isUser
      ? ([{ type: 'text' as const, value: message.content }] as const)
      : segmentCitedContent(message.content)

    return (
      <li
        mix={animateEntrance ? entranceFast() : undefined}
        className={`flex flex-col gap-2 rounded-lg border border-border p-4 ${
          isUser ? 'bg-surface-muted' : 'bg-surface'
        }`}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {isUser ? 'You' : 'Assistant'}
          {message.incomplete ? ' · incomplete' : ''}
        </span>
        <div className="whitespace-pre-wrap text-sm text-foreground">
          {segments.map((segment, index) => {
            if (segment.type === 'text') {
              return <span key={`t-${index}`}>{segment.value}</span>
            }
            return (
              <ChatCitationReveal
                key={`c-${index}-${segment.id}`}
                citationId={segment.id}
                source={sourceByCitationId(message.sources, segment.id)}
              />
            )
          })}
          {!message.content && !isUser ? (
            <span className="text-muted">Thinking…</span>
          ) : null}
        </div>
      </li>
    )
  }
}
