/**
 * Safe post-login redirect target — relative same-origin paths only (open-redirect guard).
 * Pure helper → app/utils/ (styleguide §2.1 last-resort for cross-layer pure code).
 */
export function safeReturnTo(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//')) return fallback
  if (raw.includes('\\')) return fallback
  return raw
}
