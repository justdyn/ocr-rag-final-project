import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AUTO_KNOWLEDGE_META,
  autoChatKnowledgeName,
  bindFilesToChatKnowledge,
} from './implicit-knowledge.ts'
import {
  isActiveAttachmentStatus,
  isTerminalAttachmentStatus,
  readyAttachmentFileIds,
  summarizeAttachments,
  type ComposerAttachment,
} from './composer-attachments.ts'
import { isSamePath } from './new-chat.ts'

describe('autoChatKnowledgeName', () => {
  it('uses the filename for a single attachment', () => {
    assert.equal(autoChatKnowledgeName(['notes.pdf']), 'Chat — notes.pdf')
  })

  it('uses an ISO date/time stamp when multiple files are attached', () => {
    assert.equal(
      autoChatKnowledgeName(['a.pdf', 'b.pdf'], () => new Date('2026-08-25T05:51:00.000Z')),
      'Chat — 2026-08-25 05:51',
    )
  })
})

describe('bindFilesToChatKnowledge', () => {
  it('creates an implicit KB with is_auto_created meta when none is selected', async () => {
    let created: Array<{ name: string; meta: Record<string, unknown> }> = []
    let added: string[] = []
    let result = await bindFilesToChatKnowledge({
      knowledgeId: null,
      filenames: ['notes.pdf'],
      fileIds: ['file-1'],
      createKnowledge: async (body) => {
        created.push(body)
        return { ok: true, id: 'kb-new', name: body.name }
      },
      addFile: async (_knowledgeId, fileId) => {
        added.push(fileId)
        return { ok: true }
      },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.created, true)
    assert.equal(result.id, 'kb-new')
    assert.equal(created[0]?.name, 'Chat — notes.pdf')
    assert.deepEqual(created[0]?.meta, { ...AUTO_KNOWLEDGE_META })
    assert.deepEqual(added, ['file-1'])
  })

  it('reuses an existing knowledge id and only adds files', async () => {
    let createCalls = 0
    let added: string[] = []
    let result = await bindFilesToChatKnowledge({
      knowledgeId: 'kb-existing',
      knowledgeName: 'Policies',
      filenames: ['a.pdf', 'b.pdf'],
      fileIds: ['file-1', 'file-2'],
      createKnowledge: async () => {
        createCalls += 1
        return { ok: true, id: 'nope', name: 'nope' }
      },
      addFile: async (_knowledgeId, fileId) => {
        added.push(fileId)
        return { ok: true }
      },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.created, false)
    assert.equal(result.id, 'kb-existing')
    assert.equal(result.name, 'Policies')
    assert.equal(createCalls, 0)
    assert.deepEqual(added, ['file-1', 'file-2'])
  })
})

describe('composer attachment helpers', () => {
  it('treats ready/failed as terminal and uploading/pending/processing as active', () => {
    assert.equal(isTerminalAttachmentStatus('ready'), true)
    assert.equal(isTerminalAttachmentStatus('failed'), true)
    assert.equal(isActiveAttachmentStatus('uploading'), true)
    assert.equal(isActiveAttachmentStatus('ready'), false)
  })

  it('summarizes per-file status and ready ids', () => {
    let rows: ComposerAttachment[] = [
      {
        localId: '1',
        filename: 'a.pdf',
        fileId: 'fa',
        status: 'ready',
        error: null,
      },
      {
        localId: '2',
        filename: 'b.pdf',
        fileId: null,
        status: 'failed',
        error: 'too large',
      },
    ]
    assert.equal(readyAttachmentFileIds(rows).join(','), 'fa')
    assert.match(summarizeAttachments(rows), /a\.pdf: ready/)
    assert.match(summarizeAttachments(rows), /b\.pdf: failed/)
  })
})

describe('isSamePath', () => {
  it('treats home with and without search as the same document path', () => {
    assert.equal(
      isSamePath('http://localhost/', 'http://localhost/?knowledge=kb-1&conversation=c-1'),
      true,
    )
    assert.equal(isSamePath('http://localhost/files', 'http://localhost/'), false)
  })
})
