import { del, form, get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  login: form('login'),
  register: form('register'),
  logout: post('logout'),
  // Upload/status BFF for composer attach; GET index redirects (no library page).
  files: route('files', {
    index: get('/'),
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
