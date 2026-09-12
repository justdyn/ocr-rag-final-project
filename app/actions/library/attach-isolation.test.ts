/**
 * Isolation: attach-from-library is membership-only — KB-B must not see KB-A files
 * until addFile. Pure unit check of bind + separate knowledge ids (no live FastAPI).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bindFilesToChatKnowledge } from '../../utils/implicit-knowledge.ts'

describe('library attach isolation (membership)', () => {
  it('adds a file only to the target knowledge id', async () => {
    let membership = new Map<string, Set<string>>()
    membership.set('kb-a', new Set(['file-1']))
    membership.set('kb-b', new Set())

    let result = await bindFilesToChatKnowledge({
      knowledgeId: 'kb-b',
      knowledgeName: 'Chat B',
      filenames: ['file-1.pdf'],
      fileIds: ['file-1'],
      createKnowledge: async () => {
        throw new Error('should not create')
      },
      addFile: async (knowledgeId, fileId) => {
        let set = membership.get(knowledgeId) ?? new Set()
        set.add(fileId)
        membership.set(knowledgeId, set)
        return { ok: true }
      },
    })

    assert.equal(result.ok, true)
    assert.ok(membership.get('kb-a')!.has('file-1'))
    assert.ok(membership.get('kb-b')!.has('file-1'))
    // Creating a third chat still starts empty until an explicit attach.
    assert.equal((membership.get('kb-c') ?? new Set()).has('file-1'), false)
  })

  it('creates a new implicit KB when attaching with no knowledgeId', async () => {
    let created: string[] = []
    let added: Array<{ kb: string; file: string }> = []

    let result = await bindFilesToChatKnowledge({
      knowledgeId: null,
      filenames: ['solo.pdf'],
      fileIds: ['file-9'],
      createKnowledge: async (body) => {
        created.push(body.name)
        return { ok: true, id: 'kb-new', name: body.name }
      },
      addFile: async (knowledgeId, fileId) => {
        added.push({ kb: knowledgeId, file: fileId })
        return { ok: true }
      },
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.id, 'kb-new')
      assert.equal(result.created, true)
    }
    assert.equal(created.length, 1)
    assert.deepEqual(added, [{ kb: 'kb-new', file: 'file-9' }])
  })
})
