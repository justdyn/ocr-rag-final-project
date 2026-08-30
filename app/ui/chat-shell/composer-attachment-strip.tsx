/**
 * In-pill attachment thumbnails. Owns progress re-renders so the composer
 * textarea is not updated on every XHR tick (Remix setup-scope isolation).
 * Hover-delete is draft-only — this strip is never used in conversation history.
 */
import { on, type Handle } from 'remix/ui'

import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import {
  isActiveAttachmentStatus,
  type ComposerAttachment,
} from '../../utils/composer-attachments.ts'
import { LucideIcon } from './lucide-icon.tsx'
import { CircularProgress } from './circular-progress.tsx'
import {
  composerAttachStripStyle,
  composerThumbIconWrapStyle,
  composerThumbImgStyle,
  composerThumbOverlayStyle,
  composerThumbRemoveStyle,
  composerThumbStyle,
} from '../styles/chat-shell/composer-styles.ts'

export type AttachmentProgress = number | null

export type ComposerAttachmentStripProps = {
  attachments: ComposerAttachment[]
  progressOf: (localId: string) => AttachmentProgress
  bindTick: (tick: (() => void) | null) => void
  onRemove: (localId: string) => void
}

function thumbLabel(row: ComposerAttachment): string {
  if (row.status === 'failed') {
    return `${row.filename}: failed${row.error ? ` (${row.error})` : ''}`
  }
  if (row.status === 'ready') return `${row.filename}: ready`
  if (row.status === 'processing') return `${row.filename}: processing`
  if (row.status === 'uploading') return `${row.filename}: uploading`
  return `${row.filename}: pending`
}

export function ComposerAttachmentStrip(handle: Handle<ComposerAttachmentStripProps>) {
  handle.props.bindTick(() => handle.update())
  handle.signal.addEventListener('abort', () => {
    handle.props.bindTick(null)
  })

  return () => {
    let rows = handle.props.attachments
    if (rows.length === 0) return null

    return (
      <ul mix={composerAttachStripStyle} role="list" aria-label="Attached files">
        {rows.map((row) => {
          let progress = handle.props.progressOf(row.localId)
          let showRing = isActiveAttachmentStatus(row.status)
          let indeterminate = row.status !== 'uploading' || progress == null
          let fraction = progress ?? 0
          let percent = Math.round(fraction * 100)
          return (
            <li
              key={row.localId}
              mix={composerThumbStyle}
              data-failed={row.status === 'failed' ? 'true' : 'false'}
              title={thumbLabel(row)}
              data-filename={row.filename}
            >
              <span className="sr-only">{thumbLabel(row)}</span>
              {row.image && row.previewUrl ? (
                <img src={row.previewUrl} alt="" mix={composerThumbImgStyle} />
              ) : (
                <span mix={composerThumbIconWrapStyle} aria-hidden="true">
                  <LucideIcon icon={SHELL_LUCIDE_ICON.file} size={22} strokeWidth={1.75} />
                </span>
              )}
              {showRing ? (
                <div
                  mix={composerThumbOverlayStyle}
                  role="progressbar"
                  data-progress={indeterminate ? 'indeterminate' : String(percent)}
                  aria-label={thumbLabel(row)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={indeterminate ? undefined : percent}
                >
                  <CircularProgress fraction={fraction} indeterminate={indeterminate} />
                </div>
              ) : null}
              <button
                type="button"
                data-thumb-remove=""
                aria-label={`Remove ${row.filename}`}
                mix={[
                  composerThumbRemoveStyle,
                  on('click', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    handle.props.onRemove(row.localId)
                  }),
                ]}
              >
                <LucideIcon icon={SHELL_LUCIDE_ICON.remove} size={12} strokeWidth={2.25} />
              </button>
            </li>
          )
        })}
      </ul>
    )
  }
}
