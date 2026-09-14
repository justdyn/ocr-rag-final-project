import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  readPreferredChatModel,
  writePreferredChatModel,
} from './chat-model-preference.ts'

function withSessionStorage(run: (store: Map<string, string>) => void) {
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
    run(store)
  } finally {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: original,
    })
  }
}

describe('chat-model-preference', () => {
  it('round-trips id and display name', () => {
    withSessionStorage(() => {
      writePreferredChatModel({ id: 'gpt-4o-mini', name: 'GPT-4o mini' })
      assert.deepEqual(readPreferredChatModel(), {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
      })
    })
  })

  it('falls back name to id when name missing', () => {
    withSessionStorage((store) => {
      store.set('docintel.chat.llm_model', JSON.stringify({ id: 'o4-mini' }))
      assert.deepEqual(readPreferredChatModel(), {
        id: 'o4-mini',
        name: 'o4-mini',
      })
    })
  })

  it('returns null for empty or corrupt storage', () => {
    withSessionStorage((store) => {
      assert.equal(readPreferredChatModel(), null)
      store.set('docintel.chat.llm_model', '{')
      assert.equal(readPreferredChatModel(), null)
    })
  })
})
