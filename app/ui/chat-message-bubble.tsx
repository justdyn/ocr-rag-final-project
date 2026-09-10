/**
 * One chat turn — ChatGPT-style conversation layout: right-aligned user pill,
 * flush assistant prose (no card), citations inline on assistant turns.
 */
import type { Handle } from 'remix/ui'

import { ChatCitationReveal } from './chat-citation-reveal.tsx'
import {
  segmentCitedContent,
  sourceByCitationId,
} from '../utils/chat-citations.ts'
import type { ChatMessage } from '../utils/chat-types.ts'
import { entranceFast, entranceUserBubble } from '../utils/motion.ts'
import {
  assistantPendingStyle,
  assistantProseStyle,
  assistantRowStyle,
  userPillStyle,
  userRowStyle,
  userTextStyle,
} from './styles/chat-shell/message-styles.ts'

export type ChatMessageBubbleProps = {
  message: ChatMessage
  /** Animate entrance once (new bubble / sentence boundary), not every token. */
  animateEntrance?: boolean
}

export function ChatMessageBubble(handle: Handle<ChatMessageBubbleProps>) {
  return () => {
    let { message, animateEntrance = false } = handle.props

    if (message.role === 'user') {
      return (
        <li mix={userRowStyle}>
          <div mix={[userPillStyle, animateEntrance ? entranceUserBubble() : undefined]}>
            <p mix={userTextStyle}>{message.content}</p>
          </div>
        </li>
      )
    }

    let segments = segmentCitedContent(message.content)

    return (
      <li mix={[assistantRowStyle, animateEntrance ? entranceFast() : undefined]}>
        <div mix={assistantProseStyle}>
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
          {!message.content ? (
            <span mix={assistantPendingStyle}>Thinking…</span>
          ) : null}
          {message.incomplete ? (
            <span className="sr-only"> (response incomplete)</span>
          ) : null}
        </div>
      </li>
    )
  }
}
