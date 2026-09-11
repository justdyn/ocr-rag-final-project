/**
 * mdast → Remix renderer for assistant replies (reusable message body).
 * Security posture: raw HTML (`html`, `definition`, `image`, footnote) nodes
 * are dropped — never injected — and link hrefs pass an http/mailto/relative
 * scheme allowlist. Citation markers [N] inside plain text (never inlineCode)
 * are delegated to `renderCitation`; the chat bubble maps them to
 * ChatCitationReveal with the structured `sources` event.
 * Not a clientEntry — stateless subtree of ChatMessageBubble's clientEntry.
 */
import type { Handle, RemixNode } from 'remix/ui'
import type {
  PhrasingContent,
  Root,
  RootContent,
  TableRow,
} from 'mdast'

import { segmentCitedContent } from '../utils/chat-citations.ts'
import {
  completeStreamingMarkdown,
  isSafeUrl,
  parseMarkdown,
} from '../utils/markdown-parse.ts'
import {
  mdBlockquoteStyle,
  mdCodeBlockStyle,
  mdHeadingStyle,
  mdHrStyle,
  mdInlineCodeStyle,
  mdLinkStyle,
  mdListStyle,
  mdListItemStyle,
  mdParagraphStyle,
  mdSubHeadingStyle,
  mdTableStyle,
  mdTableWrapStyle,
  mdTdStyle,
  mdThStyle,
} from './styles/chat-shell/message-styles.ts'

export type MarkdownRenderProps = {
  /** Canonical Markdown source (ChatMessage.content). */
  content: string
  /** Stable key base — the message localId, so chips survive token frames. */
  keyPrefix: string
  /** Citation sink; omitted → [N] renders as literal text. */
  renderCitation?: (id: number, key: string) => RemixNode
}

export function MarkdownRender(handle: Handle<MarkdownRenderProps>) {
  // Setup-scope parse cache: identical content (token frames that changed
  // nothing, soft-nav re-applies) reuses the last tree. ponytail: full
  // re-parse per changed content (~1ms/KB); add rAF throttle or settled-prefix
  // block cache only if long replies measurably jank.
  let parsed: { content: string; root: Root } | null = null

  return () => {
    let { content, keyPrefix, renderCitation } = handle.props
    if (!parsed || parsed.content !== content) {
      parsed = { content, root: parseMarkdown(completeStreamingMarkdown(content)) }
    }
    return <>{renderBlocks(parsed.root.children, keyPrefix, renderCitation)}</>
  }
}

type CitationSink = MarkdownRenderProps['renderCitation']

function renderText(
  value: string,
  keyBase: string,
  renderCitation?: CitationSink,
): RemixNode[] {
  return segmentCitedContent(value).map((segment, index) => {
    if (segment.type === 'text') {
      return <span key={`${keyBase}-t${index}`}>{segment.value}</span>
    }
    return renderCitation
      ? renderCitation(segment.id, `${keyBase}-c${index}-${segment.id}`)
      : (`[${segment.id}]` as RemixNode)
  })
}

function renderPhrasing(
  nodes: PhrasingContent[],
  keyBase: string,
  renderCitation?: CitationSink,
): RemixNode[] {
  return nodes.flatMap((node, index): RemixNode | RemixNode[] | null => {
    let key = `${keyBase}-${index}`
    switch (node.type) {
      case 'text':
        return renderText(node.value, key, renderCitation)
      case 'emphasis':
        return <em key={key}>{renderPhrasing(node.children, key, renderCitation)}</em>
      case 'strong':
        return <strong key={key}>{renderPhrasing(node.children, key, renderCitation)}</strong>
      case 'delete':
        return <s key={key}>{renderPhrasing(node.children, key, renderCitation)}</s>
      case 'inlineCode':
        return <code key={key} mix={mdInlineCodeStyle}>{node.value}</code>
      case 'link':
        // Unsafe scheme → degrade to its text content, never an anchor.
        return isSafeUrl(node.url) ? (
          <a key={key} href={node.url} mix={mdLinkStyle}>
            {renderPhrasing(node.children, key, renderCitation)}
          </a>
        ) : (
          renderPhrasing(node.children, key, renderCitation)
        )
      case 'break':
        return <br key={key} />
      default:
        // html, image, footnote/reference nodes are dropped (§9 security).
        return null
    }
  })
}

function renderRow(
  row: TableRow,
  cellTag: 'th' | 'td',
  keyBase: string,
  renderCitation?: CitationSink,
): RemixNode {
  let CellTag = cellTag
  let cellStyle = cellTag === 'th' ? mdThStyle : mdTdStyle
  return (
    <tr key={keyBase}>
      {row.children.map((cell, index) => (
        <CellTag key={`${keyBase}-d${index}`} mix={cellStyle}>
          {renderPhrasing(cell.children, `${keyBase}-d${index}`, renderCitation)}
        </CellTag>
      ))}
    </tr>
  )
}

function renderListItem(
  children: RootContent[],
  keyBase: string,
  renderCitation?: CitationSink,
): RemixNode {
  // Tight-list look: paragraph children flatten into the <li>; nested
  // lists/quotes/code recurse as blocks after the inline run.
  let inline: RemixNode[] = []
  let blocks: RemixNode[] = []
  for (let child of children) {
    if (child.type === 'paragraph') {
      inline.push(...renderPhrasing(child.children, `${keyBase}-p`, renderCitation))
    } else {
      blocks.push(renderBlocks([child], keyBase, renderCitation))
    }
  }
  return (
    <li key={keyBase} mix={mdListItemStyle}>
      {inline}
      {blocks}
    </li>
  )
}

function renderBlocks(
  nodes: RootContent[],
  keyBase: string,
  renderCitation?: CitationSink,
): RemixNode[] {
  return nodes.flatMap((node, index): RemixNode | null => {
    let key = `${keyBase}-b${index}`
    switch (node.type) {
      case 'paragraph':
        return <p key={key} mix={mdParagraphStyle}>{renderPhrasing(node.children, key, renderCitation)}</p>
      case 'heading': {
        let Tag = `h${node.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
        let style = node.depth <= 2 ? mdHeadingStyle : mdSubHeadingStyle
        return <Tag key={key} mix={style}>{renderPhrasing(node.children, key, renderCitation)}</Tag>
      }
      case 'list': {
        let Tag = node.ordered ? ('ol' as const) : ('ul' as const)
        return (
          <Tag key={key} mix={mdListStyle}>
            {node.children.map((item, itemIndex) =>
              renderListItem(item.children, `${key}-i${itemIndex}`, renderCitation),
            )}
          </Tag>
        )
      }
      case 'blockquote':
        return <blockquote key={key} mix={mdBlockquoteStyle}>{renderBlocks(node.children, key, renderCitation)}</blockquote>
      case 'code':
        return (
          <pre key={key} mix={mdCodeBlockStyle}>
            <code>{node.value}</code>
          </pre>
        )
      case 'table': {
        let [head, ...body] = node.children
        return (
          <div key={key} mix={mdTableWrapStyle}>
            <table mix={mdTableStyle}>
              {head ? <thead>{renderRow(head, 'th', `${key}-h`, renderCitation)}</thead> : null}
              {body.length ? (
                <tbody>
                  {body.map((row, rowIndex) =>
                    renderRow(row, 'td', `${key}-r${rowIndex}`, renderCitation),
                  )}
                </tbody>
              ) : null}
            </table>
          </div>
        )
      }
      case 'thematicBreak':
        return <hr key={key} mix={mdHrStyle} />
      default:
        // html, definition, image, footnoteDefinition are dropped (§9 security).
        return null
    }
  })
}
