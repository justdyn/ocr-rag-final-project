/**
 * Chat composer: draft, multi-file attach, implicit KB bind (extracted to stay under 500 lines, §2.2).
 * Regular component (not clientEntry) — lives inside ChatShellMainPanel's hydrated tree.
 */
import { on, ref, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { COMPOSER_UPLOAD_CONCURRENCY, mapPool } from '../utils/async-pool.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import { newChatLocalId } from '../utils/chat-stream-client.ts'
import {
  asAttachmentStatus,
  isActiveAttachmentStatus,
  isImageAttachment,
  isUnpersistedUpload,
  previewUrlForFile,
  readyAttachmentFileIds,
  revokePreviewUrl,
  summarizeAttachments,
  type ComposerAttachment,
} from '../utils/composer-attachments.ts'
import {
  postAddKnowledgeFileJson,
  postCreateKnowledgeJson,
} from '../utils/composer-knowledge-client.ts'
import { ACCEPTED_UPLOAD_ACCEPT, formatFileError, validateClientUpload } from '../utils/file-errors.ts'
import {
  deleteLibraryFile,
  FILE_STATUS_POLL_MS,
  fetchFileStatus,
  postLibraryUpload,
} from '../utils/file-upload-client.ts'
import { bindFilesToChatKnowledge } from '../utils/implicit-knowledge.ts'
import { animatePress } from '../utils/motion.ts'
import { createProgressThrottle } from '../utils/upload-progress.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'
import { ComposerAttachmentStrip } from './chat-shell/composer-attachment-strip.tsx'
import {
  composerActionsStyle,
  composerFeedbackStyle,
  composerFormStyle,
  composerIconBtnStyle,
  composerInputStyle,
  composerInputWrapStyle,
  composerPillStyle,
  composerSectionStyle,
  sendButtonStyle,
} from './styles/chat-shell/composer-styles.ts'

export type ChatShellComposerProps = {
  authenticated: boolean
  knowledgeId: string | null
  knowledgeName: string | null
  streaming: boolean
  resetGeneration: number
  onSend: (query: string) => void
  onScopeReady: (knowledgeId: string, knowledgeName: string) => void
}

export function ChatShellComposer(handle: Handle<ChatShellComposerProps>) {
  let draft = ''
  let fileInputEl: HTMLInputElement | null = null
  let attachments: ComposerAttachment[] = []
  let progressById = new Map<string, number>()
  let abortUploadByLocalId = new Map<string, () => void>()
  let stripTick: (() => void) | null = null
  let addedFileIds = new Set<string>()
  let sessionKnowledgeId: string | null = handle.props.knowledgeId
  let sessionKnowledgeName: string | null = handle.props.knowledgeName
  let uploadNotice: { tone: 'error' | 'info'; text: string } | null = null
  let bindInFlight = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastReset = handle.props.resetGeneration
  // lastReset compared in render so New chat (resetGeneration++) clears attach state without remount.

  function bindStripTick(tick: (() => void) | null) {
    stripTick = tick
  }

  function progressOf(localId: string): number | null {
    if (!progressById.has(localId)) return null
    return progressById.get(localId) as number
  }

  function revokeAllPreviews() {
    for (let row of attachments) revokePreviewUrl(row.previewUrl)
  }

  function abortAllUploads() {
    for (let abort of abortUploadByLocalId.values()) abort()
    abortUploadByLocalId = new Map()
  }

  function dropLocalRow(localId: string) {
    let row = attachments.find((item) => item.localId === localId)
    if (row) revokePreviewUrl(row.previewUrl)
    attachments = attachments.filter((item) => item.localId !== localId)
    progressById.delete(localId)
    abortUploadByLocalId.delete(localId)
  }

  /** Unmount the unsent strip after send — do not DELETE; files stay on the chat KB. */
  function releaseDraftStrip() {
    revokeAllPreviews()
    attachments = []
    progressById = new Map()
    uploadNotice = null
  }

  function removeDraftAttachment(localId: string) {
    let row = attachments.find((item) => item.localId === localId)
    if (!row) return

    abortUploadByLocalId.get(localId)?.()
    abortUploadByLocalId.delete(localId)

    let fileId = row.fileId
    let abortOnly = isUnpersistedUpload(row)
    dropLocalRow(localId)
    handle.update()

    if (abortOnly || !fileId) return
    addedFileIds.delete(fileId)
    void deleteLibraryFile(fileId)
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  handle.signal.addEventListener('abort', () => {
    stopPoll()
    abortAllUploads()
    revokeAllPreviews()
  })

  function patchAttachment(localId: string, patch: Partial<ComposerAttachment>) {
    attachments = attachments.map((row) =>
      row.localId === localId ? { ...row, ...patch } : row,
    )
  }

  function startPoll() {
    if (pollTimer) return
    if (!attachments.some((row) => isActiveAttachmentStatus(row.status) && row.fileId)) {
      return
    }
    pollTimer = setInterval(() => {
      void pollActive()
    }, FILE_STATUS_POLL_MS)
  }

  async function pollActive() {
    let active = attachments.filter((row) => isActiveAttachmentStatus(row.status) && row.fileId)
    if (active.length === 0) {
      stopPoll()
      await maybeBindKnowledge()
      return
    }
    await Promise.all(
      active.map(async (row) => {
        let status = await fetchFileStatus(row.fileId!)
        if (!status) return
        patchAttachment(row.localId, {
          status: asAttachmentStatus(status.status),
          error: status.status === 'failed' ? formatFileError(status.error) : null,
        })
      }),
    )
    handle.update()
    if (!attachments.some((row) => isActiveAttachmentStatus(row.status))) {
      stopPoll()
      await maybeBindKnowledge()
    }
  }

  async function maybeBindKnowledge() {
    if (bindInFlight) return
    if (attachments.some((row) => isActiveAttachmentStatus(row.status))) return
    let readyIds = readyAttachmentFileIds(attachments).filter((id) => !addedFileIds.has(id))
    if (readyIds.length === 0) return

    bindInFlight = true
    let readyNames = attachments
      .filter((row) => row.status === 'ready')
      .map((row) => row.filename)
    let result = await bindFilesToChatKnowledge({
      knowledgeId: sessionKnowledgeId ?? handle.props.knowledgeId,
      knowledgeName: sessionKnowledgeName ?? handle.props.knowledgeName,
      filenames: readyNames,
      fileIds: readyIds,
      createKnowledge: async (body) => postCreateKnowledgeJson(body),
      addFile: postAddKnowledgeFileJson,
    })
    bindInFlight = false

    if (!result.ok) {
      uploadNotice = { tone: 'error', text: result.error }
      handle.update()
      return
    }

    for (let id of readyIds) addedFileIds.add(id)
    sessionKnowledgeId = result.id
    sessionKnowledgeName = result.name
    uploadNotice = {
      tone: 'info',
      text: result.created
        ? `Created “${result.name}” and attached ${readyIds.length === 1 ? 'the file' : `${readyIds.length} files`}. You can ask a question now.`
        : `Added ${readyIds.length === 1 ? 'the file' : `${readyIds.length} files`} to “${result.name}”.`,
    }
    handle.props.onScopeReady(result.id, result.name)
    handle.update()
  }

  async function uploadQueued(file: File, localId: string) {
    let report = createProgressThrottle((fraction) => {
      progressById.set(localId, fraction)
      stripTick?.()
    })
    let upload = postLibraryUpload(file, report)
    abortUploadByLocalId.set(localId, () => upload.abort())
    let result = await upload.done
    abortUploadByLocalId.delete(localId)
    if (!attachments.some((row) => row.localId === localId)) {
      if (result.ok) void deleteLibraryFile(result.file.id)
      return
    }
    if (!result.ok) {
      if (result.aborted) return
      patchAttachment(localId, { status: 'failed', error: result.error })
      handle.update()
      return
    }
    patchAttachment(localId, {
      fileId: result.file.id,
      status: asAttachmentStatus(result.file.status),
      error: null,
    })
    handle.update()
  }

  async function handleComposerFiles(files: File[]) {
    if (!handle.props.authenticated) {
      window.location.href = routes.login.index.href()
      return
    }
    if (files.length === 0) return
    uploadNotice = { tone: 'info', text: `Uploading ${files.length === 1 ? files[0]!.name : `${files.length} files`}…` }

    let queued: { file: File; localId: string }[] = []
    for (let file of files) {
      let localId = newChatLocalId('att')
      let rejection = validateClientUpload(file)
      attachments = [
        ...attachments,
        {
          localId,
          filename: file.name,
          fileId: null,
          status: rejection ? 'failed' : 'uploading',
          error: rejection,
          previewUrl: rejection ? null : previewUrlForFile(file),
          image: isImageAttachment(file),
        },
      ]
      if (!rejection) queued.push({ file, localId })
    }
    // Mount strip before XHR ticks so progress hits stripTick, not this textarea.
    await handle.update()

    // Cap in-flight POSTs; each row still tracks uploading/pending/processing/ready/failed.
    await mapPool(queued, COMPOSER_UPLOAD_CONCURRENCY, ({ file, localId }) =>
      uploadQueued(file, localId),
    )
    uploadNotice = {
      tone: 'info',
      text: summarizeAttachments(attachments) || 'Upload finished.',
    }
    handle.update()
    startPoll()
    await maybeBindKnowledge()
  }

  function resetComposer() {
    stopPoll()
    abortAllUploads()
    revokeAllPreviews()
    draft = ''
    attachments = []
    progressById = new Map()
    addedFileIds = new Set()
    sessionKnowledgeId = handle.props.knowledgeId
    sessionKnowledgeName = handle.props.knowledgeName
    uploadNotice = null
    bindInFlight = false
  }

  return () => {
    if (handle.props.resetGeneration !== lastReset) {
      lastReset = handle.props.resetGeneration
      resetComposer()
    }
    if (handle.props.knowledgeId && !sessionKnowledgeId) {
      sessionKnowledgeId = handle.props.knowledgeId
      sessionKnowledgeName = handle.props.knowledgeName
    }

    let uploading = attachments.some((row) => row.status === 'uploading')
    let attachPending = attachments.some((row) => isActiveAttachmentStatus(row.status))

    return (
      <section mix={composerSectionStyle} aria-label="Message composer">
        <input
          type="file"
          className="sr-only"
          tabIndex={-1}
          multiple
          accept={ACCEPTED_UPLOAD_ACCEPT}
          mix={[
            ref((node) => {
              fileInputEl = node as HTMLInputElement
            }),
            on('change', (event) => {
              let input = event.currentTarget
              let files = input.files ? Array.from(input.files) : []
              input.value = ''
              if (files.length > 0) void handleComposerFiles(files)
            }),
          ]}
        />
        <div mix={composerPillStyle}>
          {attachments.length > 0 ? (
            <ComposerAttachmentStrip
              attachments={attachments}
              progressOf={progressOf}
              bindTick={bindStripTick}
              onRemove={removeDraftAttachment}
            />
          ) : null}
          <form
            mix={[
              composerFormStyle,
              on('submit', (event) => {
                event.preventDefault()
                let query = draft.trim()
                if (!query) return
                draft = ''
                releaseDraftStrip()
                handle.update()
                handle.props.onSend(query)
              }),
            ]}
          >
            <button
              type="button"
              aria-label={SHELL_COPY.attachFile}
              disabled={uploading}
              mix={[
                composerIconBtnStyle,
                on('click', () => {
                  if (!handle.props.authenticated) {
                    window.location.href = routes.login.index.href()
                    return
                  }
                  fileInputEl?.click()
                }),
              ]}
            >
              <LucideIcon icon={SHELL_LUCIDE_ICON.attach} strokeWidth={1.75} />
            </button>
            <label mix={composerInputWrapStyle}>
              <span className="sr-only">Message</span>
              <textarea
                name="message"
                rows={1}
                disabled={handle.props.streaming}
                placeholder={SHELL_COPY.composerPlaceholder}
                value={draft}
                mix={[
                  composerInputStyle,
                  on('input', (event) => {
                    draft = event.currentTarget.value
                    handle.update()
                  }),
                  on('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      let query = draft.trim()
                      if (!query || handle.props.streaming || attachPending) return
                      draft = ''
                      releaseDraftStrip()
                      handle.update()
                      handle.props.onSend(query)
                    }
                  }),
                ]}
              />
            </label>
            <div mix={composerActionsStyle}>
              <button
                type="submit"
                aria-label="Send message"
                disabled={handle.props.streaming || draft.trim().length === 0 || attachPending}
                mix={[
                  sendButtonStyle,
                  on('click', (event) => {
                    animatePress(event.currentTarget)
                  }),
                ]}
              >
                <LucideIcon icon={SHELL_LUCIDE_ICON.send} strokeWidth={1.75} />
              </button>
            </div>
          </form>
        </div>
        {uploadNotice ? (
          <p
            mix={composerFeedbackStyle}
            role={uploadNotice.tone === 'error' ? 'alert' : 'status'}
          >
            {uploadNotice.text}
          </p>
        ) : null}
      </section>
    )
  }
}
