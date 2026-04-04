import { useState, useEffect } from 'react'
import { getAdminSubmissions, reviewSubmission, getUsers, toggleAdmin, addAdmin } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function AdminPage() {
  const { user, logout } = useAuth()

  // Submissions state
  const [submissions, setSubmissions] = useState([])
  const [filter, setFilter]           = useState('')
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [selected, setSelected]       = useState(null)
  const [readingValue, setReadingValue] = useState('')
  const [notes, setNotes]             = useState('')
  const [saving, setSaving]           = useState(false)

  // Image lightbox state
  const [lightboxUrl, setLightboxUrl] = useState(null)

  // Admin management state
  const [tab, setTab]           = useState('submissions')  // 'submissions' | 'admins'
  const [users, setUsers]       = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [togglingId, setTogglingId]     = useState(null)
  const [newAdminEmail, setNewAdminEmail]     = useState('')
  const [addingAdmin, setAddingAdmin]         = useState(false)
  const [addAdminSuccess, setAddAdminSuccess] = useState('')

  const [error, setError] = useState('')

  useEffect(() => { fetchSubmissions() }, [filter])

  async function fetchSubmissions() {
    setLoadingSubs(true)
    try {
      const { data } = await getAdminSubmissions(filter)
      setSubmissions(data)
    } catch {
      setError('Failed to load submissions.')
    } finally {
      setLoadingSubs(false)
    }
  }

  async function fetchUsers() {
    setLoadingUsers(true)
    try {
      const { data } = await getUsers()
      setUsers(data)
    } catch {
      setError('Failed to load users.')
    } finally {
      setLoadingUsers(false)
    }
  }

  function handleTabChange(t) {
    setTab(t)
    setError('')
    if (t === 'admins' && users.length === 0) fetchUsers()
  }

  async function handleAddAdmin(e) {
    e.preventDefault()
    setError('')
    setAddAdminSuccess('')
    setAddingAdmin(true)
    try {
      const { data } = await addAdmin(newAdminEmail)
      setAddAdminSuccess(data.detail)
      setNewAdminEmail('')
      fetchUsers()   // refresh the list
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add admin.')
    } finally {
      setAddingAdmin(false)
    }
  }

  async function handleToggleAdmin(userId) {
    setTogglingId(userId)
    try {
      const { data } = await toggleAdmin(userId)
      setUsers(prev => prev.map(u => u.id === userId ? data : u))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update admin status.')
    } finally {
      setTogglingId(null)
    }
  }

  function openReview(submission) {
    setSelected(submission)
    setReadingValue(submission.reading_value || '')
    setNotes(submission.notes || '')
    setError('')
  }

  function closeModal() { setSelected(null); setError('') }

  async function handleReview(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await reviewSubmission(selected.id, { reading_value: readingValue, notes, status: 'reviewed' })
      closeModal()
      fetchSubmissions()
    } catch {
      setError('Failed to save review.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>🔧 Gas Reading Admin</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>{user?.email}</span>
          <button className="link-btn" onClick={logout}>Logout</button>
        </div>
      </div>

      {/* Main tab switcher */}
      <div className="filter-tabs" style={{ marginBottom: '1.5rem' }}>
        <button className={`tab-btn ${tab === 'submissions' ? 'active' : ''}`} onClick={() => handleTabChange('submissions')}>
          📸 Submissions
        </button>
        <button className={`tab-btn ${tab === 'admins' ? 'active' : ''}`} onClick={() => handleTabChange('admins')}>
          👤 Manage Admins
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── SUBMISSIONS TAB ── */}
      {tab === 'submissions' && (
        <>
          <div className="filter-tabs">
            {[['', 'All'], ['pending', 'Pending'], ['reviewed', 'Reviewed']].map(([val, label]) => (
              <button key={val} className={`tab-btn ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          {loadingSubs ? (
            <p className="loading-text">Loading…</p>
          ) : submissions.length === 0 ? (
            <p className="loading-text">No submissions found.</p>
          ) : (
            <div className="table-wrapper">
              <table className="submissions-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Block</th><th>Flat</th><th>Email</th>
                    <th>Image</th><th>Status</th><th>Reading</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id} className={s.status === 'pending' ? 'row-pending' : ''}>
                      <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
                      <td>{s.block}</td>
                      <td>{s.flat}</td>
                      <td>{s.email}</td>
                      <td>
                        {/* Thumbnail — click to open lightbox */}
                        <img
                          src={s.image_url}
                          alt="meter"
                          className="thumb-img"
                          onClick={() => setLightboxUrl(s.image_url)}
                          title="Click to enlarge"
                        />
                      </td>
                      <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                      <td>{s.reading_value || '—'}</td>
                      <td>
                        <button className="review-btn" onClick={() => openReview(s)}>
                          {s.status === 'pending' ? 'Review' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── MANAGE ADMINS TAB ── */}
      {tab === 'admins' && (
        <div style={{ maxWidth: '700px' }}>
          {/* Add Admin Form */}
          <div className="card card-wide" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginBottom: '0.25rem' }}>➕ Add Admin</h2>
            <p className="subtitle">Grant admin access by email — works even before they log in for the first time.</p>

            {addAdminSuccess && <div className="success-box" style={{ marginBottom: '0.75rem' }}>{addAdminSuccess}</div>}

            <form onSubmit={handleAddAdmin} style={{ flexDirection: 'row', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="reviewer@example.com"
                  value={newAdminEmail}
                  onChange={e => { setNewAdminEmail(e.target.value); setAddAdminSuccess('') }}
                  required
                />
              </div>
              <button type="submit" disabled={addingAdmin} style={{ whiteSpace: 'nowrap', marginBottom: '0' }}>
                {addingAdmin ? 'Adding…' : 'Grant Admin'}
              </button>
            </form>
          </div>

          {/* Users Table */}
          <div className="card card-wide">
            <h2 style={{ marginBottom: '1rem' }}>👤 All Users</h2>
            {loadingUsers ? (
              <p className="loading-text">Loading users…</p>
            ) : (
              <table className="submissions-table">
                <thead>
                  <tr><th>Email</th><th>Block</th><th>Flat</th><th>Role</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.block_number || '—'}</td>
                      <td>{u.flat_number || '—'}</td>
                      <td>
                        <span className={`badge ${u.is_admin ? 'badge-reviewed' : 'badge-pending'}`}>
                          {u.is_admin ? 'Admin' : 'Resident'}
                        </span>
                      </td>
                      <td>
                        {u.email === user?.email ? (
                          <span style={{ fontSize: '0.8rem', color: '#718096' }}>You</span>
                        ) : (
                          <button
                            className="review-btn"
                            onClick={() => handleToggleAdmin(u.id)}
                            disabled={togglingId === u.id}
                          >
                            {togglingId === u.id ? '…' : u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── IMAGE LIGHTBOX ── */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <div className="lightbox" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
            <img src={lightboxUrl} alt="Meter reading" className="lightbox-img" />
          </div>
        </div>
      )}

      {/* ── REVIEW MODAL ── */}
      {selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Review Submission</h2>
            <p className="subtitle">Block {selected.block} · Flat {selected.flat} · {selected.email}</p>

            <img
              src={selected.image_url}
              alt="Meter"
              className="modal-img"
              style={{ cursor: 'zoom-in' }}
              onClick={() => setLightboxUrl(selected.image_url)}
              title="Click to enlarge"
            />
            <p style={{ fontSize: '0.75rem', color: '#718096', textAlign: 'center', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
              Click image to enlarge
            </p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleReview}>
              <label>Reading Value (units)</label>
              <input type="text" placeholder="e.g. 847.3" value={readingValue} onChange={e => setReadingValue(e.target.value)} required autoFocus />
              <label>Notes (optional)</label>
              <textarea placeholder="Any comments…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              <div className="modal-actions">
                <button type="button" className="link-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Mark as Reviewed'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
