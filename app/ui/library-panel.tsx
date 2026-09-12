/**
 * Library main panel — list/search/upload/delete/attach (clientEntry).
 */
import {
  clientEntry,
  navigate,
  on,
  ref,
  type Handle,
  type SerializableProps,
} from 'remix/ui'

import { routes } from '../routes.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import {
  postAddKnowledgeFileJson,
  postCreateKnowledgeJson,
} from '../utils/composer-knowledge-client.ts'
import { formatFileError, validateClientUpload } from '../utils/file-errors.ts'
import type { FileRecord } from '../utils/file-types.ts'
import { isActiveStatus } from '../utils/file-types.ts'
import { bindFilesToChatKnowledge } from '../utils/implicit-knowledge.ts'
import { stashPendingChatKnowledge } from '../utils/library-attach.ts'
import {
  filterLibraryFiles,
  formatLibraryActivity,
  libraryFileKind,
} from '../utils/library-files.ts'
import {
  deleteLibraryFile,
  fetchFileStatus,
  FILE_STATUS_POLL_MS,
  postLibraryUpload,
} from '../utils/file-upload-client.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'
import {
  libraryActivityStyle,
  libraryEmptyStyle,
  libraryFileIconStyle,
  libraryFilenameStyle,
  libraryHeaderRowStyle,
  libraryHiddenInputStyle,
  libraryMenuItemStyle,
  libraryMenuStyle,
  libraryMoreButtonStyle,
  libraryNameCellStyle,
  libraryNewButtonStyle,
  libraryNoticeStyle,
  libraryRootStyle,
  libraryRowStyle,
  librarySearchInputStyle,
  librarySearchWrapStyle,
  libraryStatusStyle,
  libraryTabActiveStyle,
  libraryTableStyle,
  libraryTabsStyle,
  libraryTabStyle,
  libraryToolbarStyle,
} from './styles/library/library-styles.ts'

export interface LibraryPanelProps extends SerializableProps {
  initialFiles?: FileRecord[]
}

type LibraryTab = 'all' | 'images'

function kindLabel(kind: ReturnType<typeof libraryFileKind>): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'doc') return 'DOC'
  if (kind === 'image') return 'IMG'
  return 'FILE'
}

export const LibraryPanel = clientEntry(
  import.meta.url,
  function LibraryPanel(handle: Handle<LibraryPanelProps>) {
    let files: FileRecord[] = [...(handle.props.initialFiles ?? [])]
    let query = ''
    let tab: LibraryTab = 'all'
    let menuFileId: string | null = null
    let notice: string | null = null
    let uploading = false
    let fileInputEl: HTMLInputElement | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    handle.signal.addEventListener('abort', () => {
      if (pollTimer) clearInterval(pollTimer)
    })

    function visibleFiles(): FileRecord[] {
      return filterLibraryFiles(files, { query, tab })
    }

    function upsertFile(row: FileRecord) {
      let without = files.filter((f) => f.id !== row.id)
      files = [row, ...without].sort((a, b) => b.updated_at - a.updated_at)
    }

    function stopPoll() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    function startPoll() {
      stopPoll()
      pollTimer = setInterval(() => {
        void pollActive()
      }, FILE_STATUS_POLL_MS)
    }

    async function pollActive() {
      let active = files.filter((f) => isActiveStatus(f.status))
      if (active.length === 0) {
        stopPoll()
        return
      }
      await Promise.all(
        active.map(async (row) => {
          let status = await fetchFileStatus(row.id)
          if (!status) return
          upsertFile({
            ...row,
            status: status.status,
            extraction_method: status.extraction_method,
            updated_at: Math.floor(Date.now() / 1000),
            meta:
              status.error != null
                ? { ...(row.meta ?? {}), error: status.error }
                : row.meta,
          })
        }),
      )
      handle.update()
      if (!files.some((f) => isActiveStatus(f.status))) stopPoll()
    }

    async function handleUploadFiles(list: FileList | null) {
      if (!list || list.length === 0) return
      uploading = true
      notice = null
      handle.update()
      for (let file of Array.from(list)) {
        let rejection = validateClientUpload(file)
        if (rejection) {
          notice = rejection
          continue
        }
        let result = await postLibraryUpload(file).done
        if (!result.ok) {
          if (!result.aborted) notice = result.error
          continue
        }
        upsertFile(result.file)
      }
      uploading = false
      handle.update()
      if (files.some((f) => isActiveStatus(f.status))) startPoll()
      if (fileInputEl) fileInputEl.value = ''
    }

    async function onDelete(fileId: string) {
      if (typeof window !== 'undefined' && !window.confirm(SHELL_COPY.libraryDeleteConfirm)) {
        return
      }
      menuFileId = null
      let ok = (await deleteLibraryFile(fileId)).ok
      if (!ok) {
        notice = 'Could not delete file.'
        handle.update()
        return
      }
      files = files.filter((f) => f.id !== fileId)
      handle.update()
    }

    async function onAddToChat(file: FileRecord) {
      menuFileId = null
      if (file.status !== 'ready') {
        notice = 'Wait until the file finishes processing.'
        handle.update()
        return
      }
      let result = await bindFilesToChatKnowledge({
        knowledgeId: null,
        filenames: [file.filename],
        fileIds: [file.id],
        createKnowledge: async (body) => postCreateKnowledgeJson(body),
        addFile: postAddKnowledgeFileJson,
      })
      if (!result.ok) {
        notice = result.error
        handle.update()
        return
      }
      stashPendingChatKnowledge(result.id, result.name)
      notice = SHELL_COPY.libraryAttachOk
      handle.update()
      void navigate(routes.home.href())
    }

    function contentHref(fileId: string): string {
      return routes.files.content.href({ fileId })
    }

    function statusNote(file: FileRecord): string | null {
      if (file.status === 'ready') return null
      if (file.status === 'failed') {
        let err =
          file.meta && typeof file.meta.error === 'string' ? file.meta.error : null
        return formatFileError(err) ?? 'Processing failed'
      }
      if (isActiveStatus(file.status)) return 'Processing…'
      return file.status
    }

    return () => {
      let rows = visibleFiles()
      return (
        <div mix={libraryRootStyle} data-library-panel="">
          <div mix={libraryToolbarStyle}>
            <label mix={librarySearchWrapStyle}>
              <LucideIcon icon={SHELL_LUCIDE_ICON.search} size={16} strokeWidth={1.75} />
              <input
                type="search"
                name="library-search"
                placeholder={SHELL_COPY.librarySearchPlaceholder}
                value={query}
                aria-label={SHELL_COPY.librarySearchPlaceholder}
                mix={[
                  librarySearchInputStyle,
                  on('input', (event) => {
                    query = (event.currentTarget as HTMLInputElement).value
                    handle.update()
                  }),
                ]}
              />
            </label>
            <button
              type="button"
              disabled={uploading}
              mix={[
                libraryNewButtonStyle,
                on('click', () => fileInputEl?.click()),
              ]}
            >
              {SHELL_COPY.libraryNew}
            </button>
            <input
              type="file"
              multiple
              mix={[
                libraryHiddenInputStyle,
                ref((node) => {
                  fileInputEl = node as HTMLInputElement | null
                }),
                on('change', (event) => {
                  void handleUploadFiles((event.currentTarget as HTMLInputElement).files)
                }),
              ]}
            />
          </div>

          <div mix={libraryTabsStyle} role="tablist" aria-label="Library filters">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              mix={[
                libraryTabStyle,
                tab === 'all' ? libraryTabActiveStyle : undefined,
                on('click', () => {
                  tab = 'all'
                  handle.update()
                }),
              ]}
            >
              {SHELL_COPY.libraryTabAll}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'images'}
              mix={[
                libraryTabStyle,
                tab === 'images' ? libraryTabActiveStyle : undefined,
                on('click', () => {
                  tab = 'images'
                  handle.update()
                }),
              ]}
            >
              {SHELL_COPY.libraryTabImages}
            </button>
          </div>

          {notice ? <p mix={libraryNoticeStyle}>{notice}</p> : null}

          {rows.length === 0 ? (
            <p mix={libraryEmptyStyle}>{SHELL_COPY.libraryEmpty}</p>
          ) : (
            <div mix={libraryTableStyle}>
              <div mix={libraryHeaderRowStyle}>
                <span>{SHELL_COPY.libraryColName}</span>
                <span>{SHELL_COPY.libraryColActivity}</span>
                <span />
              </div>
              {rows.map((file) => {
                let kind = libraryFileKind(file)
                let note = statusNote(file)
                let open = menuFileId === file.id
                return (
                  <div
                    key={file.id}
                    data-library-row=""
                    mix={libraryRowStyle}
                  >
                    <div mix={libraryNameCellStyle}>
                      <span mix={libraryFileIconStyle} data-kind={kind}>
                        {kindLabel(kind)}
                      </span>
                      <div>
                        <p mix={libraryFilenameStyle}>{file.filename}</p>
                        {note ? <p mix={libraryStatusStyle}>{note}</p> : null}
                      </div>
                    </div>
                    <p mix={libraryActivityStyle}>
                      {formatLibraryActivity(file.updated_at)}
                    </p>
                    <button
                      type="button"
                      aria-label="File actions"
                      aria-expanded={open}
                      mix={[
                        libraryMoreButtonStyle,
                        on('click', (event) => {
                          event.stopPropagation()
                          menuFileId = open ? null : file.id
                          handle.update()
                        }),
                      ]}
                    >
                      <LucideIcon icon={SHELL_LUCIDE_ICON.more} size={16} strokeWidth={1.75} />
                    </button>
                    {open ? (
                      <div mix={libraryMenuStyle} role="menu">
                        <a
                          href={contentHref(file.id)}
                          target="_blank"
                          rel="noreferrer"
                          role="menuitem"
                          mix={libraryMenuItemStyle}
                        >
                          {SHELL_COPY.libraryPreview}
                        </a>
                        <a
                          href={contentHref(file.id)}
                          download={file.filename}
                          role="menuitem"
                          mix={libraryMenuItemStyle}
                        >
                          {SHELL_COPY.libraryDownload}
                        </a>
                        <button
                          type="button"
                          role="menuitem"
                          mix={[
                            libraryMenuItemStyle,
                            on('click', () => {
                              void onAddToChat(file)
                            }),
                          ]}
                        >
                          {SHELL_COPY.libraryAddToChat}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          data-danger="true"
                          mix={[
                            libraryMenuItemStyle,
                            on('click', () => {
                              void onDelete(file.id)
                            }),
                          ]}
                        >
                          {SHELL_COPY.libraryDelete}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }
  },
)
