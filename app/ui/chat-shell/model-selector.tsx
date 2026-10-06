/**
 * Header generalist LLM picker — debounced search + lazy-loaded list (MS-7).
 * Nested inside chat-shell-main-panel clientEntry (closures OK; not a clientEntry).
 */
import { on, ref, type Handle } from 'remix/ui'

import { routes } from '../../routes.ts'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import { debounce } from '../../utils/debounce.ts'
import {
  modelDropdownStyle,
  modelListStyle,
  modelNameStyle,
  modelOptionStyle,
  modelSearchStyle,
  modelSelectorStyle,
  modelSelectorWrapStyle,
} from '../styles/chat-shell/main-styles.ts'
import { LucideIcon } from './lucide-icon.tsx'

export type ModelOption = { id: string; name: string }

export type ChatModelSelectorProps = {
  glassChrome?: boolean
  selectedModelId: string | null
  selectedModelLabel: string
  onSelect: (model: ModelOption) => void
  /** Fired when catalog reports server default and/or resolves a display name. */
  onCatalogHint?: (model: ModelOption) => void
  /** Lets the main panel hide the composer while the picker owns the viewport. */
  onOpenChange?: (open: boolean) => void
}

type ModelsApiPage = {
  items?: ModelOption[]
  next_offset?: number | null
  has_more?: boolean
  default_model?: string
}

export function ChatModelSelector(handle: Handle<ChatModelSelectorProps>) {
  let open = false
  let items: ModelOption[] = []
  let nextOffset: number | null = 0
  let hasMore = true
  let loading = false
  let loadError: string | null = null
  let listEl: HTMLElement | null = null
  let searchEl: HTMLInputElement | null = null
  let defaultModel: string | null = null
  let defaultAnnounced = false
  let activeQuery = ''
  let hydrated = false

  let runSearch = debounce((q: string) => {
    activeQuery = q
    items = []
    nextOffset = 0
    hasMore = true
    loadError = null
    handle.update()
    void loadMore()
  }, 250)

  handle.signal.addEventListener('abort', () => {
    runSearch.cancel()
  })

  function announceCatalogHints(batch: ModelOption[]) {
    if (!defaultAnnounced && defaultModel) {
      defaultAnnounced = true
      let named = batch.find((item) => item.id === defaultModel)
      handle.props.onCatalogHint?.({
        id: defaultModel,
        name: named?.name || defaultModel,
      })
    }
    let selectedId = handle.props.selectedModelId
    if (selectedId) {
      let named = batch.find((item) => item.id === selectedId)
      if (named) handle.props.onCatalogHint?.(named)
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return
    loading = true
    loadError = null
    handle.update()
    try {
      let params = new URLSearchParams()
      if (activeQuery.trim()) params.set('q', activeQuery.trim())
      params.set('offset', String(nextOffset ?? 0))
      params.set('limit', '40')
      let res = await fetch(`${routes.models.list.href()}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        let body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || `Models request failed (${res.status})`)
      }
      let page = (await res.json()) as ModelsApiPage
      if (typeof page.default_model === 'string' && page.default_model.trim()) {
        defaultModel = page.default_model.trim()
      }
      let batch = Array.isArray(page.items) ? page.items : []
      items = [...items, ...batch]
      hasMore = Boolean(page.has_more)
      nextOffset =
        typeof page.next_offset === 'number' ? page.next_offset : hasMore ? items.length : null
      announceCatalogHints(items)
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : 'Could not load models.'
      hasMore = false
    } finally {
      loading = false
      handle.update()
    }
  }

  // Prefetch after hydrate — sync loadMore/update in setup → scheduleUpdate not implemented.
  if (typeof window !== 'undefined' && !hydrated) {
    hydrated = true
    handle.queueTask(() => {
      void loadMore()
    })
  }

  function setOpen(next: boolean) {
    if (open === next) return
    open = next
    handle.props.onOpenChange?.(open)
    handle.update()
  }

  function close() {
    setOpen(false)
  }

  function toggle() {
    let next = !open
    setOpen(next)
    if (next && items.length === 0) {
      activeQuery = searchEl?.value ?? ''
      void loadMore()
    }
    if (next) {
      handle.queueTask(() => searchEl?.focus())
    }
  }

  function selectModel(model: ModelOption) {
    handle.props.onSelect(model)
    close()
  }

  function onListScroll() {
    if (!listEl || loading || !hasMore) return
    let remaining = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight
    if (remaining < 80) void loadMore()
  }

  return () => {
    let {
      glassChrome = false,
      selectedModelId,
      selectedModelLabel,
    } = handle.props
    let glass = glassChrome ? 'true' : undefined
    let label =
      selectedModelLabel.trim() ||
      defaultModel ||
      SHELL_COPY.modelSearchPlaceholder

    return (
      <div mix={modelSelectorWrapStyle} data-open={open ? 'true' : 'false'}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open ? 'true' : 'false'}
          aria-label={`Selected model: ${label}`}
          data-glass={glass}
          mix={[
            modelSelectorStyle,
            on('click', () => {
              toggle()
            }),
          ]}
        >
          <span mix={modelNameStyle}>{label}</span>
          <LucideIcon icon={SHELL_LUCIDE_ICON.chevron} size={16} strokeWidth={1.75} />
        </button>
        <div
          mix={modelDropdownStyle}
          data-open={open ? 'true' : 'false'}
          hidden={!open}
        >
          <input
            type="search"
            mix={[
              modelSearchStyle,
              ref((node) => {
                searchEl = node as HTMLInputElement | null
              }),
              on('input', (event) => {
                let value = (event.currentTarget as HTMLInputElement).value
                runSearch(value)
              }),
              on('keydown', (event) => {
                if ((event as KeyboardEvent).key === 'Escape') {
                  close()
                }
              }),
            ]}
            placeholder={SHELL_COPY.modelSearchPlaceholder}
            aria-label="Search models"
          />
          <div
            mix={[
              modelListStyle,
              ref((node) => {
                listEl = node as HTMLElement | null
              }),
              on('scroll', () => {
                onListScroll()
              }),
            ]}
            data-lenis-prevent=""
            role="listbox"
            aria-label="Available models"
          >
            {items.map((item) => {
              let selected = item.id === selectedModelId
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected ? 'true' : 'false'}
                  data-selected={selected ? 'true' : 'false'}
                  data-model-id={item.id}
                  mix={[
                    modelOptionStyle,
                    on('click', () => {
                      selectModel(item)
                    }),
                  ]}
                >
                  <span>{item.name}</span>
                  <span data-id="">{item.id}</span>
                </button>
              )
            })}
            {loading ? <div data-status="">Loading…</div> : null}
            {loadError ? (
              <div data-status="" role="alert">
                {loadError}
              </div>
            ) : null}
            {!loading && !loadError && items.length === 0 ? (
              <div data-status="">No models found</div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }
}
