import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestOTP, verifyOTP } from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * Two-step login flow:
 * Step 1 — user enters email → we POST to /auth/request-otp/
 * Step 2 — user enters 8-character OTP → we POST to /auth/verify-otp/
 *           backend returns JWT tokens + profile status flags
 *           we store tokens and redirect accordingly
 */
export default function LoginPage() {
  const { login } = useAuth()
  const navigate   = useNavigate()

  const [step, setStep]     = useState(1)   // 1 = email, 2 = OTP
  const [email, setEmail]   = useState('')
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function handleRequestOTP(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await requestOTP(email)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send OTP. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await verifyOTP(email, code)
      login(data)
      if (!data.is_profile_complete) navigate('/setup')
      else if (data.is_admin)        navigate('/admin')
      else                           navigate('/upload')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired OTP.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <h1>🔥 Gas Reading App</h1>
        <p className="subtitle">
          {step === 1 ? 'Enter your email to receive a one-time password' : `Enter the OTP sent to ${email}`}
        </p>

        {error && <div className="error-box">{error}</div>}

        {step === 1 ? (
          <form onSubmit={handleRequestOTP}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP}>
            <input
              type="text"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              required
              autoFocus
              style={{ letterSpacing: '4px', textAlign: 'center' }}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
            <button type="button" className="link-btn" onClick={() => { setStep(1); setCode(''); setError('') }}>
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
