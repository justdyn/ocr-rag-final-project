import { createRouter, type MiddlewareContext } from 'remix/router'
import { session } from 'remix/middleware/session'
import { staticFiles } from 'remix/middleware/static'

import { uploadFormData } from './middleware/form-data.ts'

import controller from './actions/controller.tsx'
import chatController from './actions/chat/controller.tsx'
import filesController from './actions/files/controller.tsx'
import libraryController from './actions/library/controller.tsx'
import knowledgeController from './actions/knowledge/controller.tsx'
import knowledgeChatStreamController from './actions/knowledge/chat-stream/controller.tsx'
import loginController from './actions/login/controller.tsx'
import modelsController from './actions/models/controller.tsx'
import registerController from './actions/register/controller.tsx'
import spjController from './actions/spj/controller.tsx'
import { render } from './middleware/render.tsx'
import { sessionCookie, sessionStorage } from './middleware/session.ts'
import { routes } from './routes.ts'

type AppContext = MiddlewareContext<
  [
    ReturnType<typeof uploadFormData>,
    ReturnType<typeof session>,
    ReturnType<typeof render>,
  ]
>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export const router = createRouter<AppContext>({
  middleware: [
    staticFiles('./public', { index: false }),
    uploadFormData(),
    session(sessionCookie, sessionStorage),
    render(),
  ],
})

router.map(routes, controller)
router.map(routes.chat, chatController)
router.map(routes.models, modelsController)
router.map(routes.login, loginController)
router.map(routes.register, registerController)
router.map(routes.files, filesController)
router.map(routes.library, libraryController)
router.map(routes.knowledge, knowledgeController)
router.map(routes.knowledge.chatStream, knowledgeChatStreamController)
router.map(routes.spj, spjController)
