/**
 * Profile route — account profile page (name, password).
 * Controllers stay thin: parse, call data/UI, return Response (styleguide §2.4).
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { minLength, maxLength } from 'remix/data-schema/checks'
import type { RemixNode } from 'remix/ui'

import { updateProfileName, changePassword, fetchCurrentUser, uploadAvatar, getAvatar } from '../../data/auth.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import {
  loadChatShellServerContext,
  type ChatShellServerContext,
} from '../../data/shell-context.ts'
import { routes } from '../../routes.ts'
import { AppShellPage } from '../../ui/app-shell-page.tsx'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { ProfilePanel } from './profile-panel.tsx'
import { EditProfilePanel } from './edit-profile.tsx'

const nameSchema = f.object({
  name: f.field(s.string().pipe(minLength(1), maxLength(255))),
})

const passwordSchema = f.object({
  current_password: f.field(s.string().pipe(minLength(1), maxLength(128))),
  new_password: f.field(s.string().pipe(minLength(8), maxLength(128))),
})

function profilePage(shell: ChatShellServerContext, panel: RemixNode) {
  return (
    <AppShellPage
      title="Profile"
      pageTitle={SHELL_COPY.profile}
      authenticated
      activeNav="profile"
      activeKnowledgeId={shell.activeKnowledgeId}
      activeConversationId={shell.activeConversationId}
      conversations={shell.conversations}
      userName={shell.userName}
      userEmail={shell.userEmail}
      userRole={shell.userRole}
      userProfileImageUrl={shell.userProfileImageUrl}
      trailingActionHref={routes.profile.edit.href()}
      trailingActionLabel="Edit"
      trailingActionIcon="edit"
      contentAlign="center"
    >
      {panel}
    </AppShellPage>
  )
}

function editProfilePage(shell: ChatShellServerContext, panel: RemixNode) {
  return (
    <AppShellPage
      title="Edit Profile"
      pageTitle={SHELL_COPY.profile}
      authenticated
      activeNav="profile"
      activeKnowledgeId={shell.activeKnowledgeId}
      activeConversationId={shell.activeConversationId}
      conversations={shell.conversations}
      userName={shell.userName}
      userEmail={shell.userEmail}
      userRole={shell.userRole}
      userProfileImageUrl={shell.userProfileImageUrl}
    >
      {panel}
    </AppShellPage>
  )
}

export default createController(routes.profile, {
  actions: {
    async index({ session, render }) {
      let auth = requireAuthFromSession(session, routes.profile.index.href())
      if (auth instanceof Response) return auth

      let shell = await loadChatShellServerContext(auth, { hydrateChat: false })
      let me = await fetchCurrentUser(auth)

      return render(
        profilePage(
          shell,
          <ProfilePanel
            userName={me.ok ? me.data.name : shell.userName}
            userEmail={me.ok ? me.data.email : shell.userEmail}
            profileImageUrl={me.ok ? me.data.profile_image_url : null}
          />,
        ),
      )
    },

    async edit({ request, session, render }) {
      let auth = requireAuthFromSession(session, routes.profile.index.href())
      if (auth instanceof Response) return auth

      let url = new URL(request.url)
      let avatarError = url.searchParams.get('avatarError') || undefined

      let shell = await loadChatShellServerContext(auth, { hydrateChat: false })
      let me = await fetchCurrentUser(auth)

      return render(
        editProfilePage(
          shell,
          <EditProfilePanel
            userName={me.ok ? me.data.name : shell.userName}
            userEmail={me.ok ? me.data.email : shell.userEmail}
            profileImageUrl={me.ok ? me.data.profile_image_url : null}
            avatarError={avatarError}
          />,
        ),
      )
    },

    async updateName({ get, session, render }) {
      let auth = requireAuthFromSession(session, routes.profile.index.href())
      if (auth instanceof Response) return auth

      let formData = get(FormData)
      let parsed = s.parseSafe(nameSchema, formData)
      if (!parsed.success) {
        let shell = await loadChatShellServerContext(auth, { hydrateChat: false })
        let me = await fetchCurrentUser(auth)
        return render(
          editProfilePage(
            shell,
            <EditProfilePanel
              userName={me.ok ? me.data.name : shell.userName}
              userEmail={me.ok ? me.data.email : shell.userEmail}
              profileImageUrl={me.ok ? me.data.profile_image_url : null}
              nameError="Name must be 1-255 characters."
            />,
          ),
          { status: 400 },
        )
      }

      let result = await updateProfileName(auth, parsed.value.name)
      if (!result.ok) {
        let shell = await loadChatShellServerContext(auth, { hydrateChat: false })
        let me = await fetchCurrentUser(auth)
        return render(
          editProfilePage(
            shell,
            <EditProfilePanel
              userName={me.ok ? me.data.name : shell.userName}
              userEmail={me.ok ? me.data.email : shell.userEmail}
              profileImageUrl={me.ok ? me.data.profile_image_url : null}
              nameError={result.error.detail}
            />,
          ),
          { status: result.error.status },
        )
      }

      return redirect(routes.profile.index.href(), 303)
    },

    // Legacy HTML POST — no UI posts here anymore (password lives in Settings modal).
    // Errors return JSON; EditProfilePanel no longer renders password fields.
    async updatePassword({ get, session }) {
      let auth = requireAuthFromSession(session, routes.profile.index.href())
      if (auth instanceof Response) return auth

      let formData = get(FormData)
      let parsed = s.parseSafe(passwordSchema, formData)
      if (!parsed.success) {
        return Response.json(
          { error: 'Current password and new password (8-128 chars) are required.' },
          { status: 400 },
        )
      }

      let result = await changePassword(
        auth,
        parsed.value.current_password,
        parsed.value.new_password,
      )
      if (!result.ok) {
        return Response.json({ error: result.error.detail }, { status: result.error.status })
      }

      return redirect(routes.profile.index.href(), 303)
    },

    async avatar({ session, render }) {
      let auth = requireAuthFromSession(session, routes.profile.index.href())
      if (auth instanceof Response) return auth

      let result = await getAvatar(auth)
      if (!result.ok) {
        return new Response(null, { status: result.error.status })
      }
      // Stream the avatar response from backend
      return new Response(result.data.body, {
        status: 200,
        headers: {
          'Content-Type': result.data.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    },

    async uploadAvatar({ get, session, render }) {
      let auth = requireAuthFromSession(session, routes.profile.index.href())
      if (auth instanceof Response) return auth

      let formData = get(FormData)
      let result = await uploadAvatar(auth, formData)
      if (!result.ok) {
        // Redirect back to edit page with error in query param
        let base = routes.profile.edit.href()
        let redirectUrl = `${base}?avatarError=${encodeURIComponent(result.error.detail)}`
        return redirect(redirectUrl, 303)
      }

      // Success - redirect to edit page to show updated avatar
      return redirect(routes.profile.edit.href(), 303)
    },
  },
})
