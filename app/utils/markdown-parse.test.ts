/**
 * Unit tests for the Markdown parse pipeline (markdown-parse.ts).
 * Pure utils — no DOM shim needed.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  completeStreamingMarkdown,
  isSafeUrl,
  parseMarkdown,
} from './markdown-parse.ts'

function types(content: string): string[] {
  return parseMarkdown(content).children.map((node) => node.type)
}

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, lists, code, tables, quotes, links', () => {
    assert.deepEqual(types('# Title\n\nBody text.\n'), ['heading', 'paragraph'])
    assert.deepEqual(types('- a\n- b\n'), ['list'])
    assert.deepEqual(types('```js\nlet x = 1\n```\n'), ['code'])
    assert.deepEqual(types('| a | b |\n| - | - |\n| 1 | 2 |\n'), ['table'])
    assert.deepEqual(types('> quoted\n'), ['blockquote'])
    assert.deepEqual(types('---\n'), ['thematicBreak'])
  })

  it('keeps [N] citation markers as literal text nodes (Option B segmentation)', () => {
    let root = parseMarkdown('Answer [1] and [2].')
    let paragraph = root.children[0]!
    assert.equal(paragraph.type, 'paragraph')
    // remark keeps bare [1] as plain text — inlineCode stays untouched too.
    assert.match(JSON.stringify(root), /\[1\]/)
  })

  it('keeps citations inside inline code literal', () => {
    let inline = JSON.stringify(parseMarkdown('use `[1]` verbatim').children)
    assert.match(inline, /inlineCode/)
  })

  it('keeps raw HTML as inline text inside a paragraph (renderer decides)', () => {
    let root = parseMarkdown('before <script>alert(1)</script> after')
    let types_ = root.children.map((node) => node.type)
    assert.ok(types_.includes('paragraph'), `html is inline text within paragraph: ${types_}`)
  })
})

describe('completeStreamingMarkdown', () => {
  it('closes an unclosed ``` fence', () => {
    let out = completeStreamingMarkdown('para\n\n```js\nlet x = 1')
    assert.equal(out, 'para\n\n```js\nlet x = 1\n```')
    assert.deepEqual(types(out), ['paragraph', 'code'])
  })

  it('closes with matching char and length (~~~ opener)', () => {
    assert.equal(completeStreamingMarkdown('~~~\nraw'), '~~~\nraw\n~~~')
  })

  it('leaves balanced content untouched', () => {
    let src = '```js\nlet x = 1\n```\n\ndone'
    assert.equal(completeStreamingMarkdown(src), src)
  })

  it('treats fence-like lines inside an open block as content', () => {
    let out = completeStreamingMarkdown('```\nnot a closer: ~~\n``')
    assert.ok(out.endsWith('\n```'), `appends a real closer, got: ${out}`)
  })

  it('handles fence markers still streaming (no trailing newline)', () => {
    let out = completeStreamingMarkdown('text\n\n```py')
    assert.equal(out, 'text\n\n```py\n```')
    assert.deepEqual(types(out), ['paragraph', 'code'])
  })
})

describe('isSafeUrl', () => {
  it('allows http(s), mailto, relative paths and fragments', () => {
    for (let url of ['https://x.y/a', 'http://x.y', 'mailto:a@b.c', '/files/f/content', '#ref', 'img.png', './rel']) {
      assert.equal(isSafeUrl(url), true, url)
    }
  })

  it('rejects dangerous and exotic schemes', () => {
    for (let url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'vbscript:x', 'javascript:']) {
      assert.equal(isSafeUrl(url), false, url)
    }
    assert.equal(isSafeUrl(''), false)
  })
})
