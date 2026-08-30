import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { postLibraryUpload } from './file-upload-client.ts'

type ProgressEventLike = { lengthComputable: boolean; loaded: number; total: number }

class FakeXHR {
  static last: FakeXHR | null = null
  static autoComplete = true
  upload = {
    onprogress: null as ((event: ProgressEventLike) => void) | null,
  }
  status = 0
  responseText = ''
  withCredentials = false
  headers: Record<string, string> = {}
  opened: { method: string; url: string } | null = null
  sent: FormData | null = null
  aborted = false
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    FakeXHR.last = this
  }

  open(method: string, url: string) {
    this.opened = { method, url }
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }

  abort() {
    this.aborted = true
    this.onabort?.()
  }

  send(body: FormData) {
    this.sent = body
    if (!FakeXHR.autoComplete) return
    this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 200 })
    this.upload.onprogress?.({ lengthComputable: true, loaded: 200, total: 200 })
    this.status = 201
    this.responseText = JSON.stringify({
      file: {
        id: 'file-1',
        filename: 'photo.png',
        status: 'pending',
        extraction_method: null,
        ocr_confidence: null,
        hash: null,
        meta: null,
        created_at: 1,
        updated_at: 1,
      },
    })
    this.onload?.()
  }
}

describe('postLibraryUpload', () => {
  let OriginalXHR: typeof XMLHttpRequest | undefined

  before(() => {
    OriginalXHR = globalThis.XMLHttpRequest
    globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest
    FakeXHR.autoComplete = true
  })

  after(() => {
    if (OriginalXHR) globalThis.XMLHttpRequest = OriginalXHR
    else delete (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest
  })

  it('reports XHR upload byte progress instead of jumping to done', async () => {
    FakeXHR.autoComplete = true
    let ticks: number[] = []
    let result = await postLibraryUpload(
      new File([Uint8Array.from([1, 2, 3])], 'photo.png', { type: 'image/png' }),
      (fraction) => ticks.push(fraction),
    ).done
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.file.status, 'pending')
    assert.deepEqual(ticks, [0.2, 1])
    assert.equal(FakeXHR.last?.opened?.method, 'POST')
    assert.match(FakeXHR.last?.opened?.url ?? '', /files\/upload/)
    assert.equal(FakeXHR.last?.headers.Accept, 'application/json')
  })

  it('abort() resolves as aborted without treating it as a network failure', async () => {
    FakeXHR.autoComplete = false
    let upload = postLibraryUpload(
      new File([Uint8Array.from([1, 2, 3])], 'slow.bin', { type: 'text/plain' }),
    )
    upload.abort()
    let result = await upload.done
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.aborted, true)
      assert.equal(result.error, 'aborted')
    }
    assert.equal(FakeXHR.last?.aborted, true)
  })
})
