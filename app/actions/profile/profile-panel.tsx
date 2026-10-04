/**
 * Profile view panel — read-only identity.
 * Grayscale hex/css() shell skin per styleguide §3.5 (Account surfaces).
 * Edit lives in shell header trailing (profile-view-layout). No React hooks.
 */
import { css } from 'remix/ui'
import { routes } from '../../routes.ts'

const panelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  maxWidth: '560px',
  width: '100%',
  margin: '0 auto',
  padding: '0 24px',
})

const avatarStyle = css({
  width: '80px',
  height: '80px',
  borderRadius: '9999px',
  background: '#1a1a1a',
  color: '#fafafa',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '28px',
  fontWeight: 600,
  margin: '0 auto 16px',
})

const nameStyle = css({
  fontSize: '22px',
  fontWeight: 600,
  color: '#1a1a1a',
  margin: 0,
  textAlign: 'center',
})

const emailStyle = css({
  fontSize: '15px',
  color: '#737373',
  margin: '4px 0 0',
  textAlign: 'center',
})

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

export function ProfilePanel(handle: {
  props: {
    userName: string
    userEmail: string
    profileImageUrl?: string | null
  }
}) {
  const { userName, userEmail, profileImageUrl } = handle.props
  const initials = getInitials(userName)

  return () => (
    <div mix={panelStyle}>
      <div style={{ textAlign: 'center' }}>
        {profileImageUrl ? (
          <img
            src={routes.profile.avatar.href()}
            alt=""
            aria-hidden="true"
            mix={avatarStyle}
          />
        ) : (
          <div mix={avatarStyle}>{initials}</div>
        )}
        <h1 mix={nameStyle}>{userName}</h1>
        <p mix={emailStyle}>{userEmail}</p>
      </div>
    </div>
  )
}
