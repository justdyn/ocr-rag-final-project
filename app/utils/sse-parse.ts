/**
 * Pure SSE frame parser for chat streams (testable without a router).
 * Expects `event: <name>` + `data: <json>` blocks separated by blank lines.
 */

export type SseFrame = {
  event: string
  data: unknown
}

/**
 * Feed incremental text from a ReadableStream decoder.
 * Returns complete frames; leftover partial text stays in `buffer` (mutate in place via return).
 */
export function consumeSseBuffer(buffer: string): {
  frames: SseFrame[]
  rest: string
} {
  let frames: SseFrame[] = []
  let remaining = buffer

  while (true) {
    let sep = remaining.indexOf('\n\n')
    if (sep < 0) break
    let block = remaining.slice(0, sep)
    remaining = remaining.slice(sep + 2)
    let frame = parseSseBlock(block)
    if (frame) frames.push(frame)
  }

  return { frames, rest: remaining }
}

function parseSseBlock(block: string): SseFrame | null {
  let event = 'message'
  let dataLines: string[] = []

  for (let line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) return null
  let raw = dataLines.join('\n')
  try {
    return { event, data: JSON.parse(raw) as unknown }
  } catch {
    return { event, data: raw }
  }
}
