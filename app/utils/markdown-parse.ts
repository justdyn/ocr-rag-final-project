/**
 * Pure Markdown parse pipeline for chat assistant replies (mdast via
 * mdast-util-from-markdown + the GFM mdast extensions — the same layer
 * remark-parse/remark-gfm wrap, without the `unified` wrapper whose dep
 * `extend` is CommonJS and unsupported by the Remix 3 dev asset server).
 * Canonical content stays the raw Markdown string — this module only turns
 * it into an AST for app/ui/markdown-render.tsx. No ui/actions/server
 * imports (utils rule).
 */
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { Root } from 'mdast'

export function parseMarkdown(content: string): Root {
  return fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
}

/**
 * Close an unclosed fenced code block so a mid-stream parse doesn't swallow
 * the rest of the reply into one giant code block. Unmatched emphasis/tables
 * degrade to literal text in CommonMark, so the fence is the only corruption
 * risk worth compensating. The closer must use the opener's char and be at
 * least as long (CommonMark rule); fence-like lines inside an open block are
 * content, not closers.
 * ponytail: fence-only compensation; add table/list hold-back only if a
 * real stream shows those corrupting.
 */
export function completeStreamingMarkdown(content: string): string {
  let open: { char: string; len: number } | null = null
  for (let line of content.split('\n')) {
    let match = /^\s*(`{3,}|~{3,})/.exec(line)
    if (!match) continue
    let char = match[1]![0]!
    let len = match[1]!.length
    if (!open) {
      open = { char, len }
    } else if (char === open.char && len >= open.len) {
      open = null
    }
  }
  if (!open) return content
  return `${content}\n${open.char.repeat(open.len)}`
}

const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * Scheme allowlist for model-authored links (trust boundary: LLM output).
 * Relative URLs and bare fragments pass; `javascript:`/`data:`/`vbscript:` fail.
 */
export function isSafeUrl(url: string): boolean {
  let trimmed = url.trim()
  if (!trimmed) return false
  let scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(trimmed)
  if (!scheme) return true
  return SAFE_URL_SCHEMES.has(scheme[0].toLowerCase())
}
