import { useCallback, useEffect, useRef, useState } from 'react'
import { useModalKeyboard } from '../../core/hooks/useModalKeyboard'
import { api } from '../../api/client'
import { HttpError } from '../../api/http'
import { Avatar } from '../ui/Avatar'
import { ProfileInlineEditor } from '../profile/ProfileInlineEditor'
import type { Id, ProfileResponse } from '../../api/types'

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

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
  const profileSaveFnRef = useRef<(() => Promise<void>) | null>(null)
  const profileHasChangesRef = useRef<(() => boolean) | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [, setFormUpdateTrigger] = useState(0) // Force re-render when form changes
  
  // Maintain local profile state to prevent reset during refetches
  // Initialize with profile prop, but preserve during refetches
  const [localProfile, setLocalProfile] = useState<ProfileResponse | null>(profile)
  const lastUserIdRef = useRef<Id | null>(userId)

  useEffect(() => {
    if (!open) {
      setPassword('')
      setNewPassword('')
      setPasswordError(null)
      setShowPassword(false)
      setAvatarError(null)
      // Reset local profile when modal closes
      setLocalProfile(null)
      lastUserIdRef.current = null
    }
  }, [open])

  // Update local profile when:
  // 1. Profile prop changes and is not null (server update)
  // 2. UserId changes (different user)
  // Never clear localProfile when profile becomes null during refetch
  useEffect(() => {
    
    // If userId changed, reset local profile
    if (userId !== lastUserIdRef.current) {
      lastUserIdRef.current = userId
      if (profile) {
        setLocalProfile(profile)
      } else {
        setLocalProfile(null)
      }
      return
    }
    
    // If profile prop is not null, update local profile (server update)
    if (profile) {
      setLocalProfile(current => {
        // If we don't have a local profile, use the server one
        if (!current) {
          return profile
        }
        // If userIds don't match, use server one (shouldn't happen, but safety check)
        if (current.userId !== profile.userId) {
          return profile
        }
        // Update with server data (hydration after save)
        return profile
      })
    }
    // If profile is null but we have localProfile, preserve it (refetch in progress)
    // This prevents clearing the form during refetches
  }, [profile, userId])

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
      // Optimistically update avatar URL - will be confirmed when profile refetches
      if (localProfile) {
        // Note: We don't have the full URL here, but the refetch will update it
        // For now, just trigger the refetch
      }
      onUpdated?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setAvatarError(message)
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleProfileSaveReady = useCallback((saveFn: () => Promise<void>, hasChanges: () => boolean) => {
    profileSaveFnRef.current = saveFn
    profileHasChangesRef.current = hasChanges
    // Trigger re-render to update button disabled state
    setFormUpdateTrigger(prev => prev + 1)
  }, [])

  const handleProfileSave = async () => {
    if (!profileSaveFnRef.current) {
      console.warn('[UserControlPanel] Save function not ready')
      setProfileSaveError('Save function not ready. Please refresh the page.')
      return
    }
    
    // Check if there are actually changes
    if (!profileHasChangesRef.current?.()) {
      console.warn('[UserControlPanel] No changes to save')
      return
    }
    
    setProfileSaving(true)
    setProfileSaveError(null)
    
    try {
      await profileSaveFnRef.current()
      
      // Trigger profile refresh to hydrate with new values
      onUpdated?.()
      
      // Wait a bit for the refresh to complete, then close modal
      // The profile will be updated via the refetch
      setTimeout(() => {
        setProfileSaving(false)
        onClose()
      }, 300)
    } catch (err) {
      console.error('[UserControlPanel] Failed to save profile:', err)
      setProfileSaving(false)
      
      // Handle different error types
      if (err instanceof HttpError) {
        if (err.status === 401) {
          setProfileSaveError('Session expired. Please refresh the page and try again.')
        } else {
          const errorMsg = typeof err.body === 'object' && err.body && 'error' in err.body
            ? String(err.body.error)
            : err.message || `Failed to save profile (${err.status}). Please try again.`
          setProfileSaveError(errorMsg)
        }
      } else if (err instanceof Error) {
        setProfileSaveError(err.message || 'Failed to save profile. Please try again.')
      } else {
        setProfileSaveError('Failed to save profile. Please try again.')
      }
      // Don't close modal on error - let user see the error and retry
    }
  }

  const hasProfileChanges = () => {
    return profileHasChangesRef.current?.() ?? false
  }

  const handleCancel = () => {
    // Reset form by updating profile prop (which will trigger form reset)
    if (localProfile) {
      // Force a re-render by updating the profile reference
      setLocalProfile({ ...localProfile })
    }
    onClose()
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
          {localProfile ? (
            <>
              <div className="u-stack" style={{ gap: 'var(--s-3)' }}>
                <div className="inlineField">
                  <div className="inlineField__labelRow">
                    <div className="inlineField__label">Avatar</div>
                  </div>
                  <div className="u-row u-gap-3" style={{ alignItems: 'center' }}>
                    <Avatar name={localProfile.name} size="md" src={localProfile.avatarUrl ?? null} profileId={String(userId)} />
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
                
                <ProfileInlineEditor userId={userId} profile={localProfile} onSaveReady={handleProfileSaveReady} />
                
                {profileSaveError && (
                  <div className="profile__error" style={{ padding: 'var(--s-2)', marginTop: 'var(--s-2)', fontSize: 'var(--fs-2)' }}>
                    {profileSaveError}
                  </div>
                )}
          
              </div>
            </>
          ) : (
            <div className="u-stack" style={{ gap: 'var(--s-2)', padding: 'var(--s-4)' }}>
              <div className="u-muted">Loading profile...</div>
            </div>
          )}
        
        </div>

        <div className="modal__actions">
          <button
            className="actionBtn actionBtn--nope"
            type="button"
            onClick={handleCancel}
            disabled={profileSaving}
          >
            Cancel
          </button>
          <button
            className="actionBtn actionBtn--primary"
            type="button"
            onClick={handleProfileSave}
            disabled={profileSaving || !hasProfileChanges()}
            style={{ position: 'relative', minWidth: '80px' }}
          >
            {profileSaving ? (
              <>
                <span style={{ opacity: 0 }}>Save</span>
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
                  Saving...
                </span>
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
