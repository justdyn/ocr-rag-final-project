/**
 * Bounded parallel map. Used by the composer so multi-file upload does not
 * open unlimited SQLite writers at once (defense in depth vs single-writer).
 */
export const COMPOSER_UPLOAD_CONCURRENCY = 3

export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  let results: R[] = new Array(items.length)
  let next = 0
  let width = Math.min(Math.max(1, limit), items.length)

  async function worker() {
    while (true) {
      let index = next
      next += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index] as T, index)
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()))
  return results
}
