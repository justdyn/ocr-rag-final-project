/**
 * Citation chip + expandCollapse source reveal (styleguide §5.2 expandCollapse reuse).
 */
import { on, ref, type Handle } from 'remix/ui'

import type { ChatSource } from '../utils/chat-types.ts'
import { citationFileLabel } from '../utils/chat-citations.ts'
import { animateExpandCollapse } from '../utils/motion.ts'

export type ChatCitationRevealProps = {
  citationId: number
  source: ChatSource | undefined
}

export function ChatCitationReveal(handle: Handle<ChatCitationRevealProps>) {
  let open = false
  let panelEl: HTMLElement | null = null

  function setOpen(next: boolean) {
    open = next
    handle.update()
    handle.queueTask(() => {
      if (panelEl) animateExpandCollapse(panelEl, next)
    })
  }

  return () => {
    let { citationId, source } = handle.props
    let label = `[${citationId}]`
    let fileLabel = source ? citationFileLabel(source) : null

    return (
      <span className="inline-flex flex-col align-baseline">
        <button
          type="button"
          className="mx-0.5 inline rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-expanded={open}
          title={
            source
              ? `Source ${citationId}: ${fileLabel}`
              : `Unknown source ${citationId}`
          }
          mix={on('click', () => {
            setOpen(!open)
          })}
        >
          {label}
        </button>
        <span
          mix={ref((node) => {
            panelEl = node as HTMLElement
            if (!open) {
              panelEl.hidden = true
              panelEl.style.opacity = '0'
            }
          })}
          className="my-2 block w-full max-w-prose rounded-lg border border-border bg-surface-muted p-3 text-left"
          hidden
          role="region"
          aria-label={`Citation ${citationId} details`}
        >
          {source ? (
            <>
              <p className="mb-2 text-xs text-muted">
                {fileLabel}
                {source.extraction_method
                  ? ` · ${source.extraction_method}`
                  : ''}
                {typeof source.rrf_score === 'number'
                  ? ` · RRF ${source.rrf_score.toFixed(3)}`
                  : ''}
              </p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{source.text}</p>
            </>
          ) : (
            <p className="text-sm text-muted">
              No structured source for {label}. Citations come from the SSE{' '}
              <code className="text-xs">sources</code> event, not from model text alone.
            </p>
          )}
        </span>
      </span>
    )
  }
}
