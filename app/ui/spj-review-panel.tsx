/**
 * SPJ Review panel — read-only lines table + confirm/download actions.
 * clientEntry pattern (LibraryPanel reference).
 */
import {
  clientEntry,
  on,
  type Handle,
  type SerializableProps,
  type SerializableValue,
} from 'remix/ui'

import { routes } from '../routes.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import {
  spjReviewRootStyle,
  spjReviewHeaderStyle,
  spjReviewTitleStyle,
  spjReviewActionsStyle,
  spjReviewConfirmStyle,
  spjReviewDownloadStyle,
  spjReviewTableStyle,
  spjReviewHeaderRowStyle,
  spjReviewRowStyle,
  spjReviewCellDescStyle,
  spjReviewDescStyle,
  spjReviewCellNumberStyle,
  spjReviewTotalStyle,
  spjReviewTotalValueStyle,
  spjReviewEmptyStyle,
  spjReviewNoticeStyle,
} from './styles/spj/spj-review-styles.ts'

export interface SpjLineItem {
  desc: string
  qty: number
  unit_price: number
  line_total: number
  confidence?: number
  [key: string]: SerializableValue
}

export interface SpjFields {
  vendor: string
  date: string
  currency: string
  lines: SpjLineItem[]
  confidence?: number
  below_threshold?: boolean
  [key: string]: SerializableValue
}

export interface SpjDraftSerializable extends SerializableProps {
  id: string
  knowledge_id: string
  fields: SpjFields
  document_total_computed: number
  confirmed: boolean
}

export interface SpjReviewPanelProps extends SerializableProps {
  initialDraft: SpjDraftSerializable
}

export const SpjReviewPanel = clientEntry(
  import.meta.url,
  function SpjReviewPanel(handle: Handle<SpjReviewPanelProps>) {
    let draft = handle.props.initialDraft
    let confirming = false
    let notice: string | null = null

    handle.signal.addEventListener('abort', () => {
      // cleanup if needed
    })

    async function handleConfirm() {
      if (draft.confirmed || confirming) return
      confirming = true
      notice = null
      handle.update()

      let res = await fetch(routes.spj.confirm.href({ draftId: draft.id }), {
        method: 'POST',
        credentials: 'same-origin',
      })

      if (!res.ok) {
        let errorJson = await res.json().catch(() => ({}))
        notice = (errorJson as { error?: string }).error ?? SHELL_COPY.spjReviewConfirmError
        confirming = false
        handle.update()
        return
      }

      let confirmedDraft = (await res.json()) as SpjDraftSerializable
      draft = confirmedDraft
      confirming = false
      handle.update()
    }

    function handleDownload() {
      if (!draft.confirmed) return
      window.location.href = routes.spj.exportDraft.href({ draftId: draft.id })
    }

    function formatCurrency(value: number, currency: string): string {
      try {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value)
      } catch {
        return `${currency} ${value.toLocaleString('id-ID')}`
      }
    }

    function renderLines() {
      let lines = draft.fields?.lines ?? []
      if (lines.length === 0) {
        return <p mix={spjReviewEmptyStyle}>{SHELL_COPY.spjReviewEmptyLines}</p>
      }

      return (
        <div mix={spjReviewTableStyle} role="table">
          <div mix={spjReviewHeaderRowStyle} role="row">
            <span role="columnheader">{SHELL_COPY.spjReviewColDesc}</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>{SHELL_COPY.spjReviewColQty}</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>{SHELL_COPY.spjReviewColUnitPrice}</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>{SHELL_COPY.spjReviewColLineTotal}</span>
          </div>
          {lines.map((line, idx) => (
            <div key={idx} mix={spjReviewRowStyle} role="row">
              <div mix={spjReviewCellDescStyle} role="cell">
                <p mix={spjReviewDescStyle}>{line.desc}</p>
              </div>
              <p mix={spjReviewCellNumberStyle} role="cell" style={{ textAlign: 'right' }}>
                {line.qty}
              </p>
              <p mix={spjReviewCellNumberStyle} role="cell" style={{ textAlign: 'right' }}>
                {formatCurrency(line.unit_price, draft.fields.currency)}
              </p>
              <p mix={spjReviewCellNumberStyle} role="cell" style={{ textAlign: 'right' }}>
                {formatCurrency(line.line_total, draft.fields.currency)}
              </p>
            </div>
          ))}
          <div mix={spjReviewTotalStyle}>
            <span>{SHELL_COPY.spjReviewTotalLabel}</span>
            <span mix={spjReviewTotalValueStyle}>
              {formatCurrency(draft.document_total_computed, draft.fields.currency)}
            </span>
          </div>
        </div>
      )
    }

    return () => {
      const belowThreshold = draft.fields?.below_threshold === true
      const showNotice = belowThreshold || notice

      return (
        <div mix={spjReviewRootStyle} data-spj-review-panel="">
          <div mix={spjReviewHeaderStyle}>
            <h1 mix={spjReviewTitleStyle}>{SHELL_COPY.spjReviewTitle}</h1>
            <div mix={spjReviewActionsStyle}>
              {!draft.confirmed ? (
                <button
                  type="button"
                  disabled={confirming || belowThreshold}
                  mix={[
                    spjReviewConfirmStyle,
                    on('click', () => {
                      void handleConfirm()
                    }),
                  ]}
                >
                  {confirming ? 'Confirming…' : SHELL_COPY.spjReviewConfirm}
                </button>
              ) : null}
              <a
                href={routes.spj.exportDraft.href({ draftId: draft.id })}
                data-disabled={!draft.confirmed ? 'true' : 'false'}
                mix={spjReviewDownloadStyle}
              >
                {SHELL_COPY.spjReviewDownload}
              </a>
            </div>
          </div>

          {showNotice ? (
            <p mix={spjReviewNoticeStyle}>
              {belowThreshold ? SHELL_COPY.spjReviewLowConfidence : notice}
            </p>
          ) : null}

          {renderLines()}
        </div>
      )
    }
  },
)