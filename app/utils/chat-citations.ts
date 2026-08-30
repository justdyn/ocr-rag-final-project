/**
 * Split assistant text on `[N]` citation markers for clickable rendering.
 * Citation ids are 1-based and must match the structured `sources` SSE event — not LLM-invented.
 */

import type { ChatSource } from './chat-types.ts'

export type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'citation'; id: number }

const CITATION_RE = /\[(\d+)\]/g

export function segmentCitedContent(content: string): ContentSegment[] {
  let segments: ContentSegment[] = []
  let last = 0
  CITATION_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CITATION_RE.exec(content)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: content.slice(last, match.index) })
    }
    segments.push({ type: 'citation', id: Number(match[1]) })
    last = match.index + match[0].length
  }
  if (last < content.length) {
    segments.push({ type: 'text', value: content.slice(last) })
  }
  return segments
}

export function sourceByCitationId(
  sources: ChatSource[],
  id: number,
): ChatSource | undefined {
  return sources.find((source) => source.id === id)
}

/** Display label for a citation source — filename when present, safe fallback otherwise. */
export function citationFileLabel(source: ChatSource): string {
  let name = typeof source.filename === 'string' ? source.filename.trim() : ''
  if (name) return name
  // Pre-fix persisted sources lack filename; avoid dumping raw UUIDs in the UI.
  return 'Attached file'
}

/** True when appending `delta` crosses a sentence/paragraph boundary (for entranceFast). */
export function crossedSentenceBoundary(before: string, delta: string): boolean {
  if (!delta) return false
  let combined = before + delta
  // Animate at paragraph breaks or end-of-sentence followed by space/newline.
  if (/\n/.test(delta)) return true
  let from = Math.max(0, before.length - 2)
  let window = combined.slice(from)
  return /[.!?][\s]/.test(window)
}
