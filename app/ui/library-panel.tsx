/**
 * Library main panel — server-paginated list/search/upload/delete/attach.
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
import type { FileListPage, FileRecord, LibraryFileType } from '../utils/file-types.ts'
import { isActiveStatus } from '../utils/file-types.ts'
import { bindFilesToChatKnowledge } from '../utils/implicit-knowledge.ts'
import { stashPendingChatKnowledge } from '../utils/library-attach.ts'
import { formatLibraryActivity, libraryFileKind } from '../utils/library-files.ts'
import { totalPages } from '../utils/library-pagination.ts'
import {
  deleteLibraryFile,
  fetchFileStatus,
  fetchLibraryFiles,
  FILE_STATUS_POLL_MS,
  postLibraryUpload,
} from '../utils/file-upload-client.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'
import { renderLibraryTableFooter } from './library/library-table-footer.tsx'
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
  initialPage?: FileListPage
}

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_LIMIT = 10

function kindLabel(kind: ReturnType<typeof libraryFileKind>): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'doc') return 'DOC'
  if (kind === 'image') return 'IMG'
  return 'FILE'
}

function emptyCopy(tab: LibraryFileType): string {
  if (tab === 'images') return SHELL_COPY.libraryEmptyImages
  if (tab === 'documents') return SHELL_COPY.libraryEmptyDocuments
  return SHELL_COPY.libraryEmpty
}

export const LibraryPanel = clientEntry(
  import.meta.url,
  function LibraryPanel(handle: Handle<LibraryPanelProps>) {
    let seed = handle.props.initialPage
    let items: FileRecord[] = [...(seed?.items ?? [])]
    let total = seed?.total ?? 0
    let page = seed?.page ?? 1
    let limit = seed?.limit ?? DEFAULT_LIMIT
    let query = ''
    let tab: LibraryFileType = 'all'
    let loading = false
    let menuFileId: string | null = null
    let notice: string | null = null
    let uploading = false
    let fileInputEl: HTMLInputElement | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let searchTimer: ReturnType<typeof setTimeout> | null = null
    let fetchSeq = 0

    handle.signal.addEventListener('abort', () => {
      if (pollTimer) clearInterval(pollTimer)
      if (searchTimer) clearTimeout(searchTimer)
    })

    function applyPage(next: FileListPage) {
      items = [...next.items]
      total = next.total
      page = next.page
      limit = next.limit
    }

    function upsertLocal(row: FileRecord) {
      let without = items.filter((f) => f.id !== row.id)
      items = [row, ...without].sort((a, b) => b.updated_at - a.updated_at)
    }

    async function reload(opts?: {
      page?: number
      limit?: number
      tab?: LibraryFileType
      query?: string
    }) {
      let nextPage = opts?.page ?? page
      let nextLimit = opts?.limit ?? limit
      let nextTab = opts?.tab ?? tab
      let nextQuery = opts?.query ?? query
      let seq = ++fetchSeq
      loading = true
      handle.update()
      let result = await fetchLibraryFiles({
        page: nextPage,
        limit: nextLimit,
        type: nextTab,
        q: nextQuery,
      })
      if (seq !== fetchSeq) return
      loading = false
      if (!result) {
        notice = 'Could not load library.'
        handle.update()
        return
      }
      // Clamp if delete emptied the current page.
      if (result.items.length === 0 && result.total > 0 && nextPage > 1) {
        page = totalPages(result.total, nextLimit)
        handle.update()
        await reload({ page, limit: nextLimit, tab: nextTab, query: nextQuery })
        return
      }
      applyPage(result)
      tab = nextTab
      query = nextQuery
      handle.update()
      if (items.some((f) => isActiveStatus(f.status))) startPoll()
      else stopPoll()
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
      let active = items.filter((f) => isActiveStatus(f.status))
      if (active.length === 0) {
        stopPoll()
        return
      }
      await Promise.all(
        active.map(async (row) => {
          let status = await fetchFileStatus(row.id)
          if (!status) return
          upsertLocal({
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
      if (!items.some((f) => isActiveStatus(f.status))) stopPoll()
    }

    async function handleUploadFiles(list: FileList | null) {
      if (!list || list.length === 0) return
      uploading = true
      notice = null
      handle.update()
      let uploaded = false
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
        uploaded = true
      }
      uploading = false
      handle.update()
      if (uploaded) {
        // Newest-first: land on page 1 of current filters.
        await reload({ page: 1 })
      }
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
      await reload()
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

    function setTab(next: LibraryFileType) {
      if (next === tab) return
      tab = next
      page = 1
      void reload({ page: 1, tab: next })
    }

    function onSearchInput(value: string) {
      query = value
      handle.update()
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        page = 1
        void reload({ page: 1, query: value })
      }, SEARCH_DEBOUNCE_MS)
    }

    if (items.some((f) => isActiveStatus(f.status))) startPoll()

    return () => {
      let showEmpty = !loading && items.length === 0
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
                    onSearchInput((event.currentTarget as HTMLInputElement).value)
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
            {(
              [
                ['all', SHELL_COPY.libraryTabAll],
                ['images', SHELL_COPY.libraryTabImages],
                ['documents', SHELL_COPY.libraryTabDocuments],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                mix={[
                  libraryTabStyle,
                  tab === id ? libraryTabActiveStyle : undefined,
                  on('click', () => {
                    setTab(id)
                  }),
                ]}
              >
                {label}
              </button>
            ))}
          </div>

          {notice ? <p mix={libraryNoticeStyle}>{notice}</p> : null}

          {showEmpty ? (
            <p mix={libraryEmptyStyle}>{emptyCopy(tab)}</p>
          ) : (
            <div mix={libraryTableStyle} role="table" aria-busy={loading ? 'true' : undefined}>
              <div mix={libraryHeaderRowStyle} role="row">
                <span role="columnheader">{SHELL_COPY.libraryColName}</span>
                <span role="columnheader">{SHELL_COPY.libraryColActivity}</span>
                <span role="columnheader" />
              </div>
              {loading && items.length === 0 ? (
                <p mix={libraryEmptyStyle}>{SHELL_COPY.libraryLoading}</p>
              ) : (
                items.map((file) => {
                  let kind = libraryFileKind(file)
                  let note = statusNote(file)
                  let open = menuFileId === file.id
                  return (
                    <div
                      key={file.id}
                      data-library-row=""
                      role="row"
                      mix={libraryRowStyle}
                    >
                      <div mix={libraryNameCellStyle} role="cell">
                        <span mix={libraryFileIconStyle} data-kind={kind}>
                          {kindLabel(kind)}
                        </span>
                        <div>
                          <p mix={libraryFilenameStyle}>{file.filename}</p>
                          {note ? <p mix={libraryStatusStyle}>{note}</p> : null}
                        </div>
                      </div>
                      <p mix={libraryActivityStyle} role="cell">
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
                })
              )}
              {renderLibraryTableFooter({
                page,
                limit,
                total,
                disabled: loading || uploading,
                onLimitChange: (nextLimit) => {
                  limit = nextLimit
                  page = 1
                  void reload({ page: 1, limit: nextLimit })
                },
                onPageChange: (nextPage) => {
                  page = nextPage
                  void reload({ page: nextPage })
                },
              })}
            </div>
          )}
        </div>
      )
    }
  },
)
