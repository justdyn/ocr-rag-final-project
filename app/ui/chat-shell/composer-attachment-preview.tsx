/**
 * Draft attachment preview lightbox. Native popover="auto" gives top-layer
 * stacking, Escape + outside-click light dismiss; scroll-lock rides along.
 * Composer owns open/close state — this component only mirrors it to the DOM.
 */
import { on, ref, type Handle } from 'remix/ui'
import { lockScrollOnToggle } from 'remix/ui/scroll-lock'

import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import type { AttachmentPreview } from '../../utils/composer-attachments.ts'
import { LucideIcon } from './lucide-icon.tsx'
import {
  composerPreviewBackdropStyle,
  composerPreviewBodyStyle,
  composerPreviewCloseStyle,
  composerPreviewFrameStyle,
  composerPreviewHeaderStyle,
  composerPreviewImgStyle,
  composerPreviewPanelStyle,
  composerPreviewTitleStyle,
} from '../styles/chat-shell/composer-styles.ts'

export type ComposerAttachmentPreviewProps = {
  preview: AttachmentPreview | null
  onClose: () => void
}

export function ComposerAttachmentPreview(handle: Handle<ComposerAttachmentPreviewProps>) {
  let dialogEl: HTMLDivElement | null = null
  let shown = false

  function hide() {
    dialogEl?.hidePopover()
  }

  return () => {
    let preview = handle.props.preview
    // Opening is done synchronously by the composer's openPreview in the strip
    // click turn (a queued show loses the popover="auto" light-dismiss race).
    // This gate only hides when the composer clears the preview state.
    let want = preview != null
    if (!want && shown && dialogEl) {
      shown = false
      handle.queueTask(() => {
        dialogEl?.hidePopover()
      })
    }

    return (
      <div
        id="composer-attachment-preview"
        popover="auto"
        role="dialog"
        aria-label={preview ? `Preview ${preview.filename}` : 'Attachment preview'}
        mix={[
          composerPreviewBackdropStyle,
          lockScrollOnToggle(),
          ref((node) => {
            dialogEl = node as HTMLDivElement
          }),
          on('toggle', (event) => {
            if ((event as Event & { newState: string }).newState === 'closed') {
              shown = false
              handle.props.onClose()
            } else {
              shown = true
            }
          }),
          on('click', (event) => {
            if (event.target === event.currentTarget) hide()
          }),
        ]}
      >
        {preview ? (
          <div mix={composerPreviewPanelStyle}>
            <div mix={composerPreviewHeaderStyle}>
              <span mix={composerPreviewTitleStyle}>{preview.filename}</span>
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
              {preview.kind === 'image' ? (
                <img src={preview.url} alt={preview.filename} mix={composerPreviewImgStyle} />
              ) : (
                <iframe
                  src={preview.url}
                  title={preview.filename}
                  mix={composerPreviewFrameStyle}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
