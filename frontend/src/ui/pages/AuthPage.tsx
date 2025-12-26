import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'

type Mode = 'login' | 'signup'

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function AuthPage() {
  const nav = useNavigate()
  const location = useLocation()
  const modeParam = new URLSearchParams(location.search).get('mode')
  const [mode, setMode] = useState<Mode>(modeParam === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (modeParam === 'login' || modeParam === 'signup') {
      setMode(modeParam)
    }
  }, [modeParam])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email || !password) {
      setMessage('Email and password required')
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      if (mode === 'login') {
        await api.auth.login({ email, password })
        setMessage('Logged in')
      } else {
        await api.auth.signup({ email, password })
        setMessage('Account created')
      }
      nav('/feed')
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, 'Auth failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="u-center" style={{ height: '100%', padding: '24px' }}>
      <div className="u-glass u-pad-6" style={{ borderRadius: 'var(--r-4)', maxWidth: 420, width: '100%' }}>
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
            <span className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="u-input"
            />
          </label>

          <label className="u-stack" style={{ gap: 6 }}>
            <span className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="u-input"
            />
          </label>

          <button className="actionBtn actionBtn--like" type="submit" disabled={loading}>
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
