import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { HttpError } from '../../api/http'
import { emitAuthChange } from '../../core/auth/authEvents'
import { useSession } from '../../core/auth/useSession'

type Mode = 'login' | 'signup'

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}

const validateEmail = (email: string): string | null => {
  if (!email.trim()) return 'Email is required'
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) return 'Please enter a valid email address'
  return null
}

const validatePassword = (password: string, isSignup: boolean): string | null => {
  if (!password) return 'Password is required'
  if (isSignup && password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  return null
}

const DEBUG = Boolean(import.meta.env?.DEV)

export function AuthPage() {
  const nav = useNavigate()
  const location = useLocation()
  const session = useSession()
  const modeParam = new URLSearchParams(location.search).get('mode')
  const [mode, setMode] = useState<Mode>(modeParam === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    if (modeParam === 'login' || modeParam === 'signup') {
      setMode(modeParam)
    }
  }, [modeParam])

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (value) {
      const error = validateEmail(value)
      setEmailError(error)
    } else {
      setEmailError(null)
    }
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    if (value) {
      const error = validatePassword(value, mode === 'signup')
      setPasswordError(error)
    } else {
      setPasswordError(null)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const emailErr = validateEmail(email)
    const passwordErr = validatePassword(password, mode === 'signup')

    setEmailError(emailErr)
    setPasswordError(passwordErr)

    if (emailErr || passwordErr) {
      setMessage('Please fix the errors above')
      return
    }

    setLoading(true)
    setMessage(null)
    if (DEBUG) console.debug('[auth] submit', { mode, email, rememberMe })
    try {
      if (mode === 'login') {
        const res = await api.auth.login({ email: email.trim(), password, rememberMe })
        if (DEBUG) console.debug('[auth] login:success', { userId: res.userId })
        setMessage('Logged in')
      } else {
        const res = await api.auth.signup({ email: email.trim(), password, rememberMe })
        if (DEBUG) console.debug('[auth] signup:success', { userId: res.userId })
        setMessage('Account created')
      }

      // Emit auth change to trigger session refetch
      emitAuthChange()

      // Wait for session to be ready before navigating
      // This makes login deterministic and prevents race conditions
      session.refetch()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Session fetch timeout. Please try again.'))
        }, 5000) // 5 second timeout

        const checkSession = () => {
          if (session.error) {
            clearTimeout(timeout)
            reject(session.error)
            return
          }
          if (!session.loading && session.data?.userId) {
            clearTimeout(timeout)
            resolve()
          } else {
            setTimeout(checkSession, 50)
          }
        }
        checkSession()
      })

      const redirectParam = new URLSearchParams(location.search).get('redirect')
      const redirectTo = redirectParam ? decodeURIComponent(redirectParam) : '/feed'
      if (DEBUG) console.debug('[auth] navigate', { redirectTo })
      nav(redirectTo)
    } catch (err: unknown) {
      if (DEBUG) {
        const status = err instanceof HttpError ? err.status : undefined
        console.debug(
          '[auth] submit:error',
          { status, message: getErrorMessage(err, 'Auth failed') },
          err
        )
      }
      setMessage(getErrorMessage(err, 'Auth failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="u-center" style={{ height: '100%', padding: '24px' }}>
      <div
        className="u-glass u-pad-6"
        style={{ borderRadius: 'var(--r-4)', maxWidth: 420, width: '100%' }}
      >
        <div className="u-stack">
          <div style={{ fontSize: 'var(--fs-5)', fontWeight: 700 }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
            {mode === 'login' ? 'Login to continue.' : 'Signup to personalize your feed.'}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="u-stack u-mt-4">
          <label className="u-stack" style={{ gap: 6 }}>
            <span className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={e => handleEmailChange(e.target.value)}
              onBlur={() => {
                const error = validateEmail(email)
                setEmailError(error)
              }}
              autoComplete="email"
              className="u-input"
              style={{ borderColor: emailError ? 'rgba(251,113,133,.65)' : undefined }}
            />
            {emailError && (
              <div style={{ fontSize: 'var(--fs-1)', color: 'rgba(251,113,133,.9)' }}>
                {emailError}
              </div>
            )}
          </label>

          <label className="u-stack" style={{ gap: 6 }}>
            <span className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
              Password
            </span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => handlePasswordChange(e.target.value)}
                onBlur={() => {
                  const error = validatePassword(password, mode === 'signup')
                  setPasswordError(error)
                }}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="u-input"
                style={{
                  borderColor: passwordError ? 'rgba(251,113,133,.65)' : undefined,
                  paddingRight: '40px',
                }}
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
            {passwordError && (
              <div style={{ fontSize: 'var(--fs-1)', color: 'rgba(251,113,133,.9)' }}>
                {passwordError}
              </div>
            )}
            {mode === 'signup' && !passwordError && password && (
              <div style={{ fontSize: 'var(--fs-1)', color: 'var(--muted)' }}>
                {password.length < 8
                  ? `At least ${8 - password.length} more characters needed`
                  : 'Password looks good'}
              </div>
            )}
          </label>

          {mode === 'login' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: 'var(--fs-2)',
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span className="u-muted">Remember me</span>
            </label>
          )}

          <button
            className="actionBtn actionBtn--like"
            type="submit"
            disabled={loading || !!emailError || !!passwordError}
          >
            {loading ? 'Working...' : mode === 'login' ? 'Login' : 'Sign up'}
          </button>
        </form>

        {message && (
          <div className="u-muted u-mt-4" style={{ fontSize: 'var(--fs-2)' }}>
            {message}
          </div>
        )}

        <div className="u-row-between u-mt-6">
          <button
            className="actionBtn actionBtn--nope"
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </button>
          <button className="actionBtn" type="button" onClick={() => nav('/feed')}>
            Continue as guest
          </button>
        </div>
      </div>
    </div>
  )
}
