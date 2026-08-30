import { clientEntry, type Handle } from 'remix/ui'

import {
  createLenisInstance,
  destroyLenisInstance,
  resetLenisScroll,
} from './lenis-config.ts'

/**
 * App-wide Lenis bootstrap (styleguide §2.6 / §4.1).
 *
 * Must NOT wrap page `children` as clientEntry props: JSX trees with `mix={css(...)}`
 * serialize for hydration and drop mixin `type` functions, which throws
 * `descriptor.type is not a function` on the client. Lenis attaches to the document
 * via its default root; this entry only owns setup/teardown.
 */
export const LenisRoot = clientEntry(
  import.meta.url,
  function LenisRoot(_handle: Handle<Record<string, never>>) {
    _handle.queueTask((signal) => {
      let lenis = createLenisInstance()

      // Reset scroll on browser navigations so position does not leak between routes (§4.2).
      let onNavigate = () => {
        resetLenisScroll()
      }
      window.addEventListener('popstate', onNavigate)
      let navigation = (
        window as Window & {
          navigation?: EventTarget & {
            addEventListener: (type: string, listener: EventListener) => void
            removeEventListener: (type: string, listener: EventListener) => void
          }
        }
      ).navigation
      navigation?.addEventListener('navigate', onNavigate)

      signal.addEventListener('abort', () => {
        window.removeEventListener('popstate', onNavigate)
        navigation?.removeEventListener('navigate', onNavigate)
        destroyLenisInstance(lenis)
      })
    })

    // Invisible marker so the clientEntry still mounts; no children to serialize.
    return () => <div data-lenis-root="" hidden aria-hidden="true" />
  },
)
