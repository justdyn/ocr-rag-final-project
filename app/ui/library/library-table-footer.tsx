/**
 * Library data-table footer — rows-per-page + page buttons (render helper).
 */
import { on } from 'remix/ui'

import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { pageRange, showingRange, totalPages } from '../../utils/library-pagination.ts'
import {
  libraryFooterControlsStyle,
  libraryFooterMetaStyle,
  libraryFooterStyle,
  libraryPageButtonActiveStyle,
  libraryPageButtonStyle,
  libraryPageEllipsisStyle,
  libraryPaginationStyle,
  libraryRowsPerPageStyle,
  librarySelectStyle,
} from '../styles/library/library-styles.ts'

export const LIBRARY_PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const

export type LibraryTableFooterProps = {
  page: number
  limit: number
  total: number
  disabled?: boolean
  onLimitChange: (limit: number) => void
  onPageChange: (page: number) => void
}

export function renderLibraryTableFooter(props: LibraryTableFooterProps) {
  let pages = totalPages(props.total, props.limit)
  let range = showingRange(props.page, props.limit, props.total)
  let tokens = pageRange(props.page, pages)
  let atStart = props.page <= 1
  let atEnd = props.page >= pages

  return (
    <div mix={libraryFooterStyle} data-library-footer="">
      <p mix={libraryFooterMetaStyle}>
        {props.total === 0
          ? 'Showing 0 of 0'
          : `Showing ${range.start}-${range.end} of ${props.total}`}
      </p>
      <div mix={libraryFooterControlsStyle}>
        <label mix={libraryRowsPerPageStyle}>
          <span>{SHELL_COPY.libraryRowsPerPage}</span>
          <select
            aria-label={SHELL_COPY.libraryRowsPerPage}
            value={String(props.limit)}
            disabled={props.disabled}
            mix={[
              librarySelectStyle,
              on('change', (event) => {
                let next = Number((event.currentTarget as HTMLSelectElement).value)
                if (!Number.isFinite(next)) return
                props.onLimitChange(next)
              }),
            ]}
          >
            {LIBRARY_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div mix={libraryPaginationStyle} role="navigation" aria-label="Pagination">
          <button
            type="button"
            disabled={props.disabled || atStart}
            aria-label={SHELL_COPY.libraryPrev}
            mix={[
              libraryPageButtonStyle,
              on('click', () => {
                if (atStart) return
                props.onPageChange(props.page - 1)
              }),
            ]}
          >
            ‹ <span data-library-page-label="">{SHELL_COPY.libraryPrev}</span>
          </button>
          {tokens.map((token, index) =>
            token === 'ellipsis' ? (
              <span key={`e-${index}`} mix={libraryPageEllipsisStyle} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={token}
                type="button"
                disabled={props.disabled}
                aria-label={`Page ${token}`}
                aria-current={token === props.page ? 'page' : undefined}
                mix={[
                  libraryPageButtonStyle,
                  token === props.page ? libraryPageButtonActiveStyle : undefined,
                  on('click', () => {
                    props.onPageChange(token)
                  }),
                ]}
              >
                {token}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={props.disabled || atEnd}
            aria-label={SHELL_COPY.libraryNext}
            mix={[
              libraryPageButtonStyle,
              on('click', () => {
                if (atEnd) return
                props.onPageChange(props.page + 1)
              }),
            ]}
          >
            <span data-library-page-label="">{SHELL_COPY.libraryNext}</span> ›
          </button>
        </div>
      </div>
    </div>
  )
}
