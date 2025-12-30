import { useEffect, useRef, useState } from 'react'
import { useModalKeyboard } from '../../core/hooks/useModalKeyboard'
import { api } from '../../api/client'
import { Avatar } from '../ui/Avatar'
import { InlineField } from '../form/InlineField'
import { InlineChoiceChips } from '../form/InlineChoiceChips'
import type { Id, ProfileResponse } from '../../api/types'
// eslint-disable-next-line no-restricted-imports
import type { ApiProfilePatchBody } from '../../api/contracts'

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

const visibilityOptions: Array<{ value: string; label: string }> = [
  { value: 'visible', label: 'Public' },
  { value: 'hidden', label: 'Private' },
]

type Props = {
  open: boolean
  userId: Id
  profile: ProfileResponse | null
  onClose: () => void
  onUpdated?: () => void
}

export function UserControlPanel({ open, userId, profile, onClose, onUpdated }: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setPassword('')
      setNewPassword('')
      setPasswordError(null)
      setShowPassword(false)
      setAvatarError(null)
    }
  }, [open])

  useModalKeyboard(open, onClose)

  const validatePassword = (pwd: string): string | null => {
    if (!pwd) return 'Password is required'
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    return null
  }

  const handlePasswordChange = async () => {
    if (!password || !newPassword) {
      setPasswordError('Both current and new password are required')
      return
    }

    const error = validatePassword(newPassword)
    if (error) {
      setPasswordError(error)
      return
    }

    setPasswordError(null)
    setPasswordSubmitting(true)
    try {
      // TODO: Implement password change API endpoint
      // await api.auth.changePassword({ currentPassword: password, newPassword })
      setPasswordError('Password change is not yet implemented. Please contact support.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password'
      setPasswordError(message)
    } finally {
      setPasswordSubmitting(false)
    }
  }

  const handleAvatarPick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarUpload = async (file: File) => {
    setAvatarError(null)
    setAvatarBusy(true)
    try {
      const upload = await api.media.upload(file)
      await api.profileUpdate(userId, { avatarMediaId: upload.mediaId })
      onUpdated?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setAvatarError(message)
    } finally {
      setAvatarBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="User settings">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div style={{ fontSize: 'var(--fs-5)', fontWeight: 700 }}>Account Settings</div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
            Manage your account and profile
          </div>
        </div>

        <div className="modal__body">
          {profile && (
            <>
              <div className="u-stack" style={{ gap: 'var(--s-3)' }}>
                <div className="inlineField">
                  <div className="inlineField__labelRow">
                    <div className="inlineField__label">Avatar</div>
                  </div>
                  <div className="u-row u-gap-3" style={{ alignItems: 'center' }}>
                    <Avatar name={profile.name} size="md" src={profile.avatarUrl ?? null} />
                    <div className="u-stack" style={{ gap: 'var(--s-1)', flex: 1 }}>
                      <button
                        className="topBar__btn topBar__btn--primary"
                        type="button"
                        onClick={handleAvatarPick}
                        disabled={avatarBusy}
                      >
                        {avatarBusy ? 'Uploading...' : 'Change Avatar'}
                      </button>
                      <div className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
                        JPG, PNG, or WEBP. Max 10MB.
                      </div>
                      {avatarError && (
                        <div className="profile__error" style={{ fontSize: 'var(--fs-1)' }}>
                          {avatarError}
                        </div>
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      className="srOnly"
                      type="file"
                      accept={ACCEPTED_TYPES}
                      onChange={event => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        if (file) handleAvatarUpload(file)
                      }}
                    />
                  </div>
                </div>

                <InlineField
                  label="Username"
                  value={profile.name}
                  placeholder="Your display name"
                  onSave={async value => {
                    const patch: ApiProfilePatchBody = { displayName: value }
                    await api.profileUpdate(userId, patch)
                    onUpdated?.()
                  }}
                />

                <div className="inlineField">
                  <div className="inlineField__labelRow">
                    <div className="inlineField__label">Password</div>
                  </div>
                  <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="inlineField__input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Current password"
                        autoComplete="current-password"
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <input
                      className="inlineField__input"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => {
                        setNewPassword(e.target.value)
                        if (passwordError) setPasswordError(null)
                      }}
                      placeholder="New password"
                      autoComplete="new-password"
                    />
                    {passwordError && (
                      <div style={{ fontSize: 'var(--fs-1)', color: 'rgba(251,113,133,.9)' }}>
                        {passwordError}
                      </div>
                    )}
                    {newPassword && !passwordError && (
                      <div style={{ fontSize: 'var(--fs-1)', color: 'var(--muted)' }}>
                        {newPassword.length < 8
                          ? `At least ${8 - newPassword.length} more characters needed`
                          : 'Password looks good'}
                      </div>
                    )}
                    <button
                      className="topBar__btn"
                      type="button"
                      onClick={handlePasswordChange}
                      disabled={passwordSubmitting || !password || !newPassword}
                    >
                      {passwordSubmitting ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </div>

                <InlineChoiceChips
                  label="Profile Status"
                  value={profile.isVisible === false ? 'hidden' : 'visible'}
                  options={visibilityOptions}
                  onSave={async value => {
                    const isVisible = value !== 'hidden'
                    await api.profileUpdate(userId, { isVisible })
                    onUpdated?.()
                  }}
                  helper="Private profiles won't show up in suggestions."
                />
              </div>
            </>
          )}
        </div>

        <div className="modal__actions">
          <button className="actionBtn actionBtn--nope" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
