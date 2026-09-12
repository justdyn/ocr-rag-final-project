import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  stashPendingChatKnowledge,
  takePendingChatKnowledge,
} from './library-attach.ts'

describe('library-attach pending scope', () => {
  it('round-trips stash then take once', () => {
    let store = new Map<string, string>()
    let original = globalThis.sessionStorage
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v)
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
      },
    })
    try {
      stashPendingChatKnowledge('kb-1', 'Chat — report.pdf')
      assert.deepEqual(takePendingChatKnowledge(), {
        id: 'kb-1',
        name: 'Chat — report.pdf',
      })
      assert.equal(takePendingChatKnowledge(), null)
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: original,
      })
    }
  })
})
