/**
 * Help panel — static FAQ sections inside chat shell chrome.
 * Grayscale hex/css() shell skin per styleguide §3.5 (Account surfaces).
 * Single-column, generous whitespace, no search.
 */
import { css } from 'remix/ui'

const panelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '40px',
  maxWidth: '720px',
  margin: '0 auto',
  padding: '32px 24px',
})

const sectionStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
})

const headingStyle = css({
  fontSize: '14px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#525252',
  margin: 0,
})

const titleStyle = css({
  fontSize: '20px',
  fontWeight: 600,
  color: '#1a1a1a',
  margin: 0,
})

const questionStyle = css({
  fontSize: '16px',
  fontWeight: 500,
  color: '#1a1a1a',
  margin: 0,
  cursor: 'default',
})

const answerStyle = css({
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#525252',
  margin: 0,
})

const dividerStyle = css({
  height: '1px',
  background: '#e5e5e5',
})

const faqItemStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  paddingBottom: '24px',
  borderBottom: '1px solid #f0f0f0',
})

const lastFaqItemStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  paddingBottom: '0',
  borderBottom: 'none',
})

const faq: Array<{ q: string; a: string }> = [
  {
    q: 'How do I upload a document?',
    a: 'Open the chat composer, click the attach button (paperclip icon), and select a PDF or image file. The file will be processed automatically — text is extracted directly from PDFs, and OCR runs on images. Once ready, you can ask questions about its contents.',
  },
  {
    q: 'What file types are supported?',
    a: 'PDF documents and common image formats (PNG, JPEG, WebP, TIFF). Scanned PDFs are treated as images and processed with OCR. Maximum file size is 50 MB per file.',
  },
  {
    q: 'How does retrieval work?',
    a: 'DocIntel uses hybrid retrieval: BM25 keyword search fused with dense vector search via weighted Reciprocal Rank Fusion (RRF, c=60). Results are cited inline so you can verify sources. The cosine rerank score is shown for diagnostics only — it does not re-sort the fused results.',
  },
  {
    q: 'Can I chat without attaching a knowledge base?',
    a: 'Yes. On the empty chat landing, the composer accepts a file attachment which auto-creates a per-chat knowledge base. You can also create a knowledge base explicitly from the sidebar and attach files to it for reuse across conversations.',
  },
  {
    q: 'What are SPJ accountability letters?',
    a: 'SPJ (Surat Pertanggungjawaban) is a thesis-domain document type for campus accountability letters. DocIntel extracts structured fields (vendor, date, line items) at ingest. Drafts can be reviewed, confirmed, and exported as HTML. Confidence gating applies — fields below the threshold are flagged for manual review before confirmation.',
  },
  {
    q: 'How is my data stored?',
    a: 'Uploaded files and extracted text are stored on the server. Vector embeddings live in Chroma (local). No data leaves your deployment unless you configure an external LLM provider. API keys are stored as DB overrides (never in .env) and are never exposed to the browser — only a 4-character suffix is shown in admin settings.',
  },
  {
    q: 'How do I change my password?',
    a: 'Go to Profile from the account menu (top-right avatar). Enter your current password and a new one (minimum 8 characters). The change takes effect immediately.',
  },
  {
    q: 'Where can I report issues or request features?',
    a: 'This is a final-year Sistem Informasi project. For academic-related inquiries, contact the project advisor. For technical issues with the deployed instance, check the repository issue tracker.',
  },
]

export function HelpPanel() {
  return () => (
    <div mix={panelStyle}>
      <section mix={sectionStyle}>
        <h2 mix={headingStyle}>DocIntel Help</h2>
        <h1 mix={titleStyle}>Frequently Asked Questions</h1>
      </section>

      {faq.map((item, idx) => (
        <section
          key={idx}
          mix={idx === faq.length - 1 ? lastFaqItemStyle : faqItemStyle}
        >
          <h3 mix={questionStyle}>{item.q}</h3>
          <p mix={answerStyle}>{item.a}</p>
        </section>
      ))}
    </div>
  )
}