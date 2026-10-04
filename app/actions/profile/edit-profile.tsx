/**
 * Profile edit panel — click-avatar upload + shell FormField name (styleguide §3.5).
 * Grayscale hex/css() shell skin. clientEntry — setup-scope variables only, no React hooks.
 */
import {
  clientEntry,
  on,
  ref,
  type Handle,
  type SerializableProps,
  css,
} from 'remix/ui'
import { routes } from '../../routes.ts'
import { animateButtonPending } from '../../utils/motion.ts'
import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import { LucideIcon } from '../../ui/chat-shell/lucide-icon.tsx'
import { FormField } from '../../ui/form-field.tsx'

const panelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '48px',
  maxWidth: '560px',
  margin: '0 auto',
  padding: '48px 24px',
})

const sectionStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
})

const avatarWrapStyle = css({
  position: 'relative',
  width: '80px',
  height: '80px',
  margin: '0 auto',
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
  margin: 0,
  border: 'none',
  padding: 0,
  overflow: 'hidden',
  cursor: 'pointer',
  transition: 'opacity 0.15s ease',
  '&:hover': { opacity: 0.85 },
  '&:focus-visible': { outline: '2px solid #1a1a1a', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
})

const avatarImgStyle = css({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

const spinnerStyle = css({
  width: '16px',
  height: '16px',
  border: '2px solid #e5e5e5',
  borderTopColor: '#1a1a1a',
  borderRadius: '9999px',
  flexShrink: 0,
})

const avatarSpinnerStyle = css({
  position: 'absolute',
  top: '50%',
  left: '50%',
  margin: '-8px 0 0 -8px',
})

const pencilBadgeStyle = css({
  position: 'absolute',
  bottom: '0',
  right: '0',
  width: '24px',
  height: '24px',
  borderRadius: '9999px',
  background: '#1a1a1a',
  color: '#fafafa',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
})

const hiddenFieldStyle = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  opacity: 0,
  overflow: 'hidden',
  border: 0,
  padding: 0,
  clipPath: 'inset(50%)',
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

const errorStyle = css({
  fontSize: '13px',
  color: '#dc2626',
  textAlign: 'center',
  margin: 0,
})

const buttonStyle = css({
  alignSelf: 'flex-start',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 600,
  color: '#fafafa',
  background: '#1a1a1a',
  border: 'none',
  borderRadius: '9999px',
  cursor: 'pointer',
  transition: 'opacity 0.15s ease, background-color 0.15s ease',
  '&:hover': { opacity: 0.85 },
  '&:active': { opacity: 1, backgroundColor: '#1a1a1a' },
  '&:focus-visible': { outline: '2px solid #1a1a1a', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
})

const cancelButtonStyle = css({
  alignSelf: 'flex-start',
  padding: '10px 0',
  fontSize: '14px',
  fontWeight: 500,
  color: '#737373',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'color 0.15s ease',
  '&:hover': { color: '#a3a3a3' },
  '&:focus-visible': { outline: '2px solid #737373', outlineOffset: '2px' },
})

const saveSpinnerStyle = css({
  width: '16px',
  height: '16px',
  border: '2px solid rgba(255, 255, 255, 0.35)',
  borderTopColor: '#ffffff',
  borderRadius: '9999px',
  flexShrink: 0,
})

const buttonRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
})

export interface EditProfilePanelProps extends SerializableProps {
  userName: string
  userEmail: string
  profileImageUrl?: string | null
  nameError?: string
  avatarError?: string
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

export const EditProfilePanel = clientEntry(
  import.meta.url,
  function EditProfilePanel(handle: Handle<EditProfilePanelProps>) {
    let avatarPending = false
    let namePending = false
    let avatarSpinnerControls: { stop(): void } | null = null
    let nameSpinnerControls: { stop(): void } | null = null
    let avatarInput: HTMLInputElement | null = null

    handle.signal.addEventListener('abort', () => {
      avatarSpinnerControls?.stop()
      nameSpinnerControls?.stop()
    })

    function handleAvatarSubmit(event: Event) {
      if (avatarPending) {
        event.preventDefault()
        return
      }
      avatarPending = true
      handle.update()
    }

    function handleNameSubmit(event: Event) {
      if (namePending) {
        event.preventDefault()
        return
      }
      namePending = true
      handle.update()
    }

    function openAvatarPicker() {
      if (!avatarPending) avatarInput?.click()
    }

    function handleAvatarChange(event: Event) {
      let input = event.target as HTMLInputElement
      if (input.files && input.files.length > 0) {
        input.form?.requestSubmit()
      }
    }

    function startAvatarSpinner(spinner: HTMLElement) {
      if (!avatarSpinnerControls) {
        avatarSpinnerControls = animateButtonPending(spinner)
      }
    }

    function startNameSpinner(spinner: HTMLElement) {
      if (!nameSpinnerControls) {
        nameSpinnerControls = animateButtonPending(spinner)
      }
    }

    function bindAvatarInput(node: Element) {
      avatarInput = node as HTMLInputElement | null
    }

    const { userName, userEmail, profileImageUrl, nameError, avatarError } = handle.props
    const initials = getInitials(userName)

    return () => (
      <div mix={panelStyle}>
        {/* Avatar + identity — click circle to change photo */}
        <div style={{ textAlign: 'center' }}>
          <div mix={avatarWrapStyle}>
            <button
              type="button"
              aria-label="Change photo"
              aria-busy={avatarPending || undefined}
              disabled={avatarPending}
              mix={[avatarStyle, on<HTMLButtonElement>('click', openAvatarPicker)]}
            >
              {profileImageUrl ? (
                <img
                  src={routes.profile.avatar.href()}
                  alt=""
                  aria-hidden="true"
                  mix={avatarImgStyle}
                />
              ) : (
                <span>{initials}</span>
              )}
            </button>
            {avatarPending && (
              <span mix={[spinnerStyle, avatarSpinnerStyle, ref(startAvatarSpinner)]} aria-hidden="true" />
            )}
            {!avatarPending && (
              <span mix={pencilBadgeStyle} aria-hidden="true">
                <LucideIcon icon={SHELL_LUCIDE_ICON.edit} size={12} strokeWidth={2} />
              </span>
            )}
          </div>
          {avatarError && (
            <p mix={errorStyle} role="alert">
              {avatarError}
            </p>
          )}
          <h1 mix={nameStyle}>{userName}</h1>
          <p mix={emailStyle}>{userEmail}</p>
        </div>

        {/* Hidden upload form — opened via avatar click */}
        <form
          method="post"
          action={routes.profile.uploadAvatar.href()}
          encType="multipart/form-data"
          mix={[sectionStyle, on<HTMLFormElement>('submit', handleAvatarSubmit)]}
        >
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            mix={[hiddenFieldStyle, ref(bindAvatarInput), on<HTMLInputElement, 'change'>('change', handleAvatarChange)]}
            aria-hidden="true"
            tabIndex={-1}
          />
        </form>

        {/* Name form */}
        <form
          method="post"
          action={routes.profile.updateName.href()}
          mix={[sectionStyle, on<HTMLFormElement>('submit', handleNameSubmit)]}
        >
          <FormField
            id="name"
            name="name"
            label="Display name"
            type="text"
            variant="shell"
            layout="stack"
            autocomplete="name"
            defaultValue={userName}
            error={nameError}
          />
          <div mix={buttonRowStyle}>
            <a href={routes.profile.index.href()} mix={cancelButtonStyle}>
              Cancel
            </a>
            <button type="submit" mix={buttonStyle} disabled={namePending}>
              {namePending && (
                <span mix={[saveSpinnerStyle, ref(startNameSpinner)]} aria-hidden="true" />
              )}
              Save
            </button>
          </div>
        </form>
      </div>
    )
  },
)
