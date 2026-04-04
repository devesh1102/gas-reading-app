import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupProfile } from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * First-time only screen.
 * The user just verified their OTP but is_profile_complete=false,
 * so we ask for their block and flat number before they can upload.
 *
 * On success the backend issues fresh tokens with is_profile_complete=true.
 * We update auth state and redirect to the upload page.
 */
export default function SetupPage() {
  const { updateUser } = useAuth()
  const navigate = useNavigate()

  const [flat, setFlat]     = useState('')
  const [block, setBlock]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await setupProfile(flat, block)
      // Store the new tokens with updated claims
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      updateUser({ flat_number: flat, block_number: block, is_profile_complete: true })
      navigate('/upload')
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <h1>📍 Setup Your Profile</h1>
        <p className="subtitle">We need your block and flat number to record your readings.</p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>Block Number</label>
          <input
            type="text"
            placeholder="e.g. A, B, C"
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            required
            autoFocus
          />
          <label>Flat Number</label>
          <input
            type="text"
            placeholder="e.g. 101, 202"
            value={flat}
            onChange={(e) => setFlat(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
