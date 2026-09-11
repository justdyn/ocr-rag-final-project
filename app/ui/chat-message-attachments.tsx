/**
 * Sent-message attachment row + click-to-detail modal (one per user bubble).
 * Thumbs sit inside the pill above the text; the lightbox mirrors
 * composer-attachment-preview.tsx — always-rendered popover="auto" (UA
 * display:none when closed, so the never-conditionally-unmount rule holds).
 */
import { on, ref, type Handle } from 'remix/ui'
import { lockScrollOnToggle } from 'remix/ui/scroll-lock'

import { routes } from '../routes.ts'
import { attachmentIsImage, type ChatAttachment } from '../utils/chat-types.ts'
import { SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'
import {
  composerPreviewBackdropStyle,
  composerPreviewBodyStyle,
  composerPreviewCloseStyle,
  composerPreviewHeaderStyle,
  composerPreviewImgStyle,
  composerPreviewPanelStyle,
  composerPreviewTitleStyle,
  composerThumbIconWrapStyle,
  composerThumbImgStyle,
  composerThumbOpenStyle,
} from './styles/chat-shell/composer-styles.ts'
import {
  messageMetaCardStyle,
  messageMetaExcerptStyle,
  messageMetaLabelStyle,
  messageMetaRowStyle,
  messageMetaRowsStyle,
  messageMetaValueStyle,
  messageThumbStyle,
  userAttachmentRowStyle,
} from './styles/chat-shell/message-styles.ts'

export type ChatMessageAttachmentsProps = {
  attachments: ChatAttachment[]
}

export function ChatMessageAttachments(handle: Handle<ChatMessageAttachmentsProps>) {
  let openAttachment: ChatAttachment | null = null
  let dialogEl: HTMLDivElement | null = null
  let shown = false

  function hide() {
    dialogEl?.hidePopover()
  }

  return () => {
    // Popover shown-state is driven by the thumb click + UA toggle events;
    // render only mirrors content and aria-label. Opening from a queued task
    // loses the popover="auto" light-dismiss race against the opening click.
    let row =
      handle.props.attachments.length > 0 ? (
        <ul mix={userAttachmentRowStyle} aria-label="Attached files">
          {handle.props.attachments.map((att) => (
            <li key={att.file_id} mix={messageThumbStyle}>
              <button
                type="button"
                aria-label={`Preview ${att.filename}`}
                mix={[
                  composerThumbOpenStyle,
                  on('click', () => {
                    openAttachment = att
                    handle.update()
                    if (!dialogEl) return
                    // Show synchronously in this click turn; the panel content
                    // (and the close button to focus) arrives with the rerender.
                    dialogEl.showPopover()
                    shown = true
                    handle.queueTask(() => {
                      let closeBtn = dialogEl?.querySelector('[data-preview-close]')
                      if (closeBtn instanceof HTMLElement) closeBtn.focus()
                    })
                  }),
                ]}
              >
                {attachmentIsImage(att) ? (
                  <img
                    src={routes.files.content.href({ fileId: att.file_id })}
                    alt={att.filename}
                    mix={composerThumbImgStyle}
                  />
                ) : (
                  <span mix={composerThumbIconWrapStyle}>
                    <LucideIcon icon={SHELL_LUCIDE_ICON.file} size={20} strokeWidth={1.75} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null

    return (
      <>
        {row}
        <div
          popover="auto"
          role="dialog"
          aria-label={
            openAttachment ? `Preview ${openAttachment.filename}` : 'Attachment preview'
          }
          mix={[
            composerPreviewBackdropStyle,
            lockScrollOnToggle(),
            ref((node) => {
              dialogEl = node as HTMLDivElement
            }),
            on('toggle', (event) => {
              if ((event as Event & { newState: string }).newState !== 'closed') return
              shown = false
              openAttachment = null
              handle.update()
            }),
            on('click', (event) => {
              if (event.target === event.currentTarget) hide()
            }),
          ]}
        >
          {openAttachment ? (
            <div mix={composerPreviewPanelStyle}>
              <div mix={composerPreviewHeaderStyle}>
                <span mix={composerPreviewTitleStyle}>{openAttachment.filename}</span>
                <button
                  type="button"
                  data-preview-close=""
                  aria-label="Close preview"
                  mix={[composerPreviewCloseStyle, on('click', hide)]}
                >
                  <LucideIcon icon={SHELL_LUCIDE_ICON.remove} size={14} strokeWidth={2.25} />
                </button>
              </div>
              <div mix={composerPreviewBodyStyle}>
                {attachmentIsImage(openAttachment) ? (
                  <img
                    src={routes.files.content.href({ fileId: openAttachment.file_id })}
                    alt={openAttachment.filename}
                    mix={composerPreviewImgStyle}
                  />
                ) : (
                  <div mix={messageMetaCardStyle} data-lenis-prevent="">
                    <dl mix={messageMetaRowsStyle}>
                      <div mix={messageMetaRowStyle}>
                        <dt mix={messageMetaLabelStyle}>Filename</dt>
                        <dd mix={messageMetaValueStyle}>{openAttachment.filename}</dd>
                      </div>
                      <div mix={messageMetaRowStyle}>
                        <dt mix={messageMetaLabelStyle}>Extraction method</dt>
                        <dd mix={messageMetaValueStyle}>
                          {openAttachment.extraction_method ?? '—'}
                        </dd>
                      </div>
                      <div mix={messageMetaRowStyle}>
                        <dt mix={messageMetaLabelStyle}>OCR confidence</dt>
                        <dd mix={messageMetaValueStyle}>
                          {typeof openAttachment.ocr_confidence === 'number'
                            ? `${Math.round(openAttachment.ocr_confidence)}%`
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                    <div>
                      <span mix={messageMetaLabelStyle}>Extracted text</span>
                      <pre mix={messageMetaExcerptStyle}>
                        {openAttachment.text_excerpt ?? '—'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </>
    )
  }
}