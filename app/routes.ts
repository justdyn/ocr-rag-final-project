import { del, form, get, patch, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  // Conversation identity — path param is canonical (not ?conversation=).
  chat: route('chat', {
    show: get(':conversationId'),
    rename: patch(':conversationId'),
  }),
  // Generalist LLM catalog proxy (auth; server LLM_* key).
  models: route({
    list: get('/models'),
  }),
  login: form('login'),
  register: form('register'),
  logout: post('logout'),
  // Owner file browser (hybrid Library) — RAG still chat-KB-scoped.
  library: route({
    index: get('/library'),
  }),
  // Upload/status/list BFF; GET index redirects to Library.
  files: route('files', {
    index: get('/'),
    list: get('list'),
    upload: post('upload'),
    status: get(':fileId/status'),
    // SPJ fields JSON (Phase A3 proxy; ownership + 404 enforced upstream).
    fields: get(':fileId/fields'),
    // Raw blob proxy for attachment thumbnails/modals (ownership enforced upstream).
    content: get(':fileId/content'),
    destroy: del(':fileId'),
  }),
  // SPJ draft BFF (Phase B4+B5): create/show/confirm JSON proxy + gated export
  // passthrough + review UI; ownership/409 stay upstream. No PATCH.
  spj: route('spj', {
    create: post('knowledge/:knowledgeId/draft'),
    show: get('drafts/:draftId'),
    confirm: post('drafts/:draftId/confirm'),
    exportDraft: get('drafts/:draftId/export'),
    review: get('drafts/:draftId/review'),
  }),
  // Create/addFile/chat BFF for implicit per-chat KB; GET index/show redirect (no management UI).
  knowledge: route('knowledge', {
    index: get('/'),
    create: post('create'),
    show: get(':knowledgeId'),
    addFile: post(':knowledgeId/files'),
    chatStream: route({
      completions: post(':knowledgeId/chat'),
    }),
  }),
})
