import { createRouter, type MiddlewareContext } from 'remix/router'
import { formData } from 'remix/middleware/form-data'
import { session } from 'remix/middleware/session'
import { staticFiles } from 'remix/middleware/static'

import controller from './actions/controller.tsx'
import filesController from './actions/files/controller.tsx'
import knowledgeController from './actions/knowledge/controller.tsx'
import knowledgeChatStreamController from './actions/knowledge/chat-stream/controller.tsx'
import loginController from './actions/login/controller.tsx'
import registerController from './actions/register/controller.tsx'
import { render } from './middleware/render.tsx'
import { sessionCookie, sessionStorage } from './middleware/session.ts'
import { routes } from './routes.ts'

type AppContext = MiddlewareContext<
  [
    ReturnType<typeof formData>,
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
    formData(),
    session(sessionCookie, sessionStorage),
    render(),
  ],
})

router.map(routes, controller)
router.map(routes.login, loginController)
router.map(routes.register, registerController)
router.map(routes.files, filesController)
router.map(routes.knowledge, knowledgeController)
router.map(routes.knowledge.chatStream, knowledgeChatStreamController)
