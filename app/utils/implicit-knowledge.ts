export const AUTO_KNOWLEDGE_META = { is_auto_created: true as const }

export function autoChatKnowledgeName(
  filenames: string[],
  now: () => Date = () => new Date(),
): string {
  let named = filenames.filter((name) => name.trim().length > 0)
  if (named.length === 1) return `Chat — ${named[0]}`
  let stamp = now().toISOString().slice(0, 16).replace('T', ' ')
  return `Chat — ${stamp}`
}

export type KnowledgeWriteResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string }

export type AddFileResult = { ok: true } | { ok: false; error: string }

export async function bindFilesToChatKnowledge(input: {
  knowledgeId: string | null
  knowledgeName?: string | null
  filenames: string[]
  fileIds: string[]
  createKnowledge: (body: {
    name: string
    meta: Record<string, unknown>
  }) => Promise<KnowledgeWriteResult>
  addFile: (knowledgeId: string, fileId: string) => Promise<AddFileResult>
  now?: () => Date
}): Promise<
  | { ok: true; id: string; name: string; created: boolean }
  | { ok: false; error: string }
> {
  if (input.fileIds.length === 0) {
    return { ok: false, error: 'No processed files to add.' }
  }

  let id = input.knowledgeId
  let name = input.knowledgeName?.trim() || ''
  let created = false

  if (!id) {
    let createdKb = await input.createKnowledge({
      name: autoChatKnowledgeName(input.filenames, input.now),
      meta: { ...AUTO_KNOWLEDGE_META },
    })
    if (!createdKb.ok) return createdKb
    id = createdKb.id
    name = createdKb.name
    created = true
  }

  for (let fileId of input.fileIds) {
    let added = await input.addFile(id, fileId)
    if (!added.ok) return added
  }

  return { ok: true, id, name: name || 'Knowledge base', created }
}
