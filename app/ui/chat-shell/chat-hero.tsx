import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { heroHeadingStyle, heroStyle } from '../styles/chat-shell/main-styles.ts'

export function ChatHero() {
  return () => (
    <section mix={heroStyle} aria-labelledby="home-heading">
      <h1 id="home-heading" mix={heroHeadingStyle}>
        {SHELL_COPY.heroHeading}
      </h1>
    </section>
  )
}
