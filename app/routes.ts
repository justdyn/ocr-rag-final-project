import { del, form, get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  // Conversation identity — path param is canonical (not ?conversation=).
  chat: route('chat', {
    show: get(':conversationId'),
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
    // Raw blob proxy for attachment thumbnails/modals (ownership enforced upstream).
    content: get(':fileId/content'),
    destroy: del(':fileId'),
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
