import { run } from 'remix/ui'

run({
  async loadModule(moduleUrl, exportName) {
    let mod = await import(moduleUrl)
    return mod[exportName]
  },
  /**
   * Soft navigations (same-origin `<a>` clicks) reload the top document frame.
   * Fetch the destination HTML — SSR already appends `<!-- rmx:flush document -->`
   * so the runtime can swap `<head>`/`<body>` and rehydrate client entries.
   */
  async resolveFrame(src, signal, target) {
    let headers = new Headers({ accept: 'text/html' })
    if (target) headers.set('x-remix-target', target)
    let response = await fetch(src, { headers, signal })
    if (!response.ok) {
      throw new Error(`Frame load failed (${response.status}) for ${src}`)
    }
    return response.body ?? (await response.text())
  },
})
