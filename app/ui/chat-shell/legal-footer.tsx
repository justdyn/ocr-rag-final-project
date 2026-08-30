import { legalFooterStyle, legalLinkStyle } from '../styles/chat-shell/main-styles.ts'

export function LegalFooter() {
  return () => (
    <footer mix={legalFooterStyle}>
      <p>
        Remix is a tool for AI. By using it, you agree to our{' '}
        <a href="#" mix={legalLinkStyle}>
          Terms
        </a>{' '}
        &amp;{' '}
        <a href="#" mix={legalLinkStyle}>
          Privacy Policy
        </a>
        . Tools may be reviewed and used to improve our AI models.{' '}
        <a href="#" mix={legalLinkStyle}>
          Learn more
        </a>
      </p>
    </footer>
  )
}
