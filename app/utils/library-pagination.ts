/**
 * Pure pagination helpers for Library data-table footer.
 */

export type PageToken = number | 'ellipsis'

/** Inclusive showing range for "Showing {start}-{end} of {total}". */
export function showingRange(
  page: number,
  limit: number,
  total: number,
): { start: number; end: number } {
  if (total <= 0) return { start: 0, end: 0 }
  let safePage = Math.max(1, page)
  let safeLimit = Math.max(1, limit)
  let start = (safePage - 1) * safeLimit + 1
  let end = Math.min(total, safePage * safeLimit)
  if (start > total) {
    start = Math.max(1, total - safeLimit + 1)
    end = total
  }
  return { start, end }
}

export function totalPages(total: number, limit: number): number {
  if (total <= 0) return 1
  return Math.max(1, Math.ceil(total / Math.max(1, limit)))
}

/**
 * Compact page tokens with ellipsis (shadcn-style): 1 … 4 5 6 … 10
 */
export function pageRange(current: number, pages: number): PageToken[] {
  let total = Math.max(1, pages)
  let cur = Math.min(Math.max(1, current), total)
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  let tokens: PageToken[] = [1]
  let left = Math.max(2, cur - 1)
  let right = Math.min(total - 1, cur + 1)

  if (cur <= 3) {
    left = 2
    right = 4
  } else if (cur >= total - 2) {
    left = total - 3
    right = total - 1
  }

  if (left > 2) tokens.push('ellipsis')
  for (let p = left; p <= right; p++) tokens.push(p)
  if (right < total - 1) tokens.push('ellipsis')
  tokens.push(total)
  return tokens
}
