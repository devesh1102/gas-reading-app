import { useState, useEffect, useMemo } from 'react'
import { getAdminSubmissions, reviewSubmission, getUsers, toggleAdmin, addAdmin } from '../services/api'
import { useAuth } from '../context/AuthContext'

// ── Sort helpers ──────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'submitted_at', label: 'Date' },
  { key: 'block',        label: 'Block' },
  { key: 'flat',         label: 'Flat' },
  { key: 'email',        label: 'Email' },
  { key: 'status',       label: 'Status' },
  { key: 'reading_value',label: 'Reading' },
]

function SortIcon({ column, sortConfig }) {
  if (sortConfig.column !== column) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>
  return <span style={{ marginLeft: 4 }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
}

function sortData(data, { column, direction }) {
  return [...data].sort((a, b) => {
    let aVal = a[column] ?? ''
    let bVal = b[column] ?? ''
    if (column === 'submitted_at') {
      aVal = new Date(aVal)
      bVal = new Date(bVal)
    } else {
      aVal = String(aVal).toLowerCase()
      bVal = String(bVal).toLowerCase()
    }
    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, logout } = useAuth()

  // Submissions state
  const [submissions, setSubmissions]     = useState([])
  const [statusFilter, setStatusFilter]   = useState('')
  const [loadingSubs, setLoadingSubs]     = useState(true)
  const [selected, setSelected]           = useState(null)
  const [readingValue, setReadingValue]   = useState('')
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)

  // Sort state — default: newest first
  const [sortConfig, setSortConfig] = useState({ column: 'submitted_at', direction: 'desc' })

  // Filter panel state
  const [showFilters, setShowFilters]   = useState(false)
  const [filterEmail, setFilterEmail]   = useState('')
  const [filterBlock, setFilterBlock]   = useState('')
  const [filterFlat, setFilterFlat]     = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')

  // Image lightbox
  const [lightboxUrl, setLightboxUrl] = useState(null)

  // Admin management state
  const [tab, setTab]                       = useState('submissions')
  const [users, setUsers]                   = useState([])
  const [loadingUsers, setLoadingUsers]     = useState(false)
  const [togglingId, setTogglingId]         = useState(null)
  const [newAdminEmail, setNewAdminEmail]   = useState('')
  const [addingAdmin, setAddingAdmin]       = useState(false)
  const [addAdminSuccess, setAddAdminSuccess] = useState('')

  const [error, setError] = useState('')

  useEffect(() => { fetchSubmissions() }, [statusFilter])

  async function fetchSubmissions() {
    setLoadingSubs(true)
    try {
      const { data } = await getAdminSubmissions(statusFilter)
      setSubmissions(data)
    } catch {
      setError('Failed to load submissions.')
    } finally {
      setLoadingSubs(false)
    }
  }

  // ── Sort handler ────────────────────────────────────────────────────────────
  function handleSort(column) {
    setSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    )
  }

  // ── Active filter count (for badge on filter button) ───────────────────────
  const activeFilterCount = [filterEmail, filterBlock, filterFlat, filterDateFrom, filterDateTo]
    .filter(Boolean).length

  function clearFilters() {
    setFilterEmail('')
    setFilterBlock('')
    setFilterFlat('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  // ── Derived: sorted + filtered submissions ─────────────────────────────────
  const displayedSubmissions = useMemo(() => {
    let result = submissions

    if (filterEmail)    result = result.filter(s => s.email?.toLowerCase().includes(filterEmail.toLowerCase()))
    if (filterBlock)    result = result.filter(s => String(s.block).toLowerCase().includes(filterBlock.toLowerCase()))
    if (filterFlat)     result = result.filter(s => String(s.flat).toLowerCase().includes(filterFlat.toLowerCase()))
    if (filterDateFrom) result = result.filter(s => new Date(s.submitted_at) >= new Date(filterDateFrom))
    if (filterDateTo)   result = result.filter(s => new Date(s.submitted_at) <= new Date(filterDateTo + 'T23:59:59'))

    return sortData(result, sortConfig)
  }, [submissions, sortConfig, filterEmail, filterBlock, filterFlat, filterDateFrom, filterDateTo])

  // ── Unique values for block/flat dropdowns ─────────────────────────────────
  const uniqueBlocks = useMemo(() => [...new Set(submissions.map(s => s.block).filter(Boolean))].sort(), [submissions])
  const uniqueFlats  = useMemo(() => [...new Set(submissions.map(s => s.flat).filter(Boolean))].sort(), [submissions])

  // ── Admin tab ───────────────────────────────────────────────────────────────
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
      fetchUsers()
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

  // ── Render ──────────────────────────────────────────────────────────────────
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
          {/* Status filter + Filter button row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div className="filter-tabs" style={{ marginBottom: 0 }}>
              {[['', 'All'], ['pending', 'Pending'], ['reviewed', 'Reviewed']].map(([val, label]) => (
                <button key={val} className={`tab-btn ${statusFilter === val ? 'active' : ''}`}
                  onClick={() => setStatusFilter(val)}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {activeFilterCount > 0 && (
                <button className="link-btn" onClick={clearFilters} style={{ fontSize: '0.8rem' }}>
                  Clear filters ({activeFilterCount})
                </button>
              )}
              <button
                className={`tab-btn ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                🔽 Filter
                {activeFilterCount > 0 && (
                  <span style={{ background: '#3182ce', color: '#fff', borderRadius: '999px', padding: '0 6px', fontSize: '0.7rem' }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                {displayedSubmissions.length} of {submissions.length}
              </span>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div style={{
              background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
              padding: '1rem', marginBottom: '1rem',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem'
            }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                  Email
                </label>
                <input
                  type="text" placeholder="Search email…"
                  value={filterEmail} onChange={e => setFilterEmail(e.target.value)}
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                  Block
                </label>
                <select
                  value={filterBlock} onChange={e => setFilterBlock(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #cbd5e0' }}
                >
                  <option value="">All blocks</option>
                  {uniqueBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                  Flat
                </label>
                <select
                  value={filterFlat} onChange={e => setFilterFlat(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #cbd5e0' }}
                >
                  <option value="">All flats</option>
                  {uniqueFlats.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                  Date from
                </label>
                <input
                  type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                  Date to
                </label>
                <input
                  type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.85rem' }}
                />
              </div>
            </div>
          )}

          {loadingSubs ? (
            <p className="loading-text">Loading…</p>
          ) : displayedSubmissions.length === 0 ? (
            <p className="loading-text">{submissions.length === 0 ? 'No submissions found.' : 'No submissions match the current filters.'}</p>
          ) : (
            <div className="table-wrapper">
              <table className="submissions-table">
                <thead>
                  <tr>
                    {COLUMNS.map(col => (
                      <th key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        title={`Sort by ${col.label}`}
                      >
                        {col.label}
                        <SortIcon column={col.key} sortConfig={sortConfig} />
                      </th>
                    ))}
                    <th>Image</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSubmissions.map((s) => (
                    <tr key={s.id} className={s.status === 'pending' ? 'row-pending' : ''}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(s.submitted_at).toLocaleDateString()}{' '}
                        <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                          {new Date(s.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td>{s.block}</td>
                      <td>{s.flat}</td>
                      <td>{s.email}</td>
                      <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                      <td>{s.reading_value || '—'}</td>
                      <td>
                        <img src={s.image_url} alt="meter" className="thumb-img"
                          onClick={() => setLightboxUrl(s.image_url)} title="Click to enlarge" />
                      </td>
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
          <div className="card card-wide" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginBottom: '0.25rem' }}>➕ Add Admin</h2>
            <p className="subtitle">Grant admin access by email — works even before they log in for the first time.</p>
            {addAdminSuccess && <div className="success-box" style={{ marginBottom: '0.75rem' }}>{addAdminSuccess}</div>}
            <form onSubmit={handleAddAdmin} style={{ flexDirection: 'row', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Email Address</label>
                <input type="email" placeholder="reviewer@example.com"
                  value={newAdminEmail}
                  onChange={e => { setNewAdminEmail(e.target.value); setAddAdminSuccess('') }}
                  required />
              </div>
              <button type="submit" disabled={addingAdmin} style={{ whiteSpace: 'nowrap', marginBottom: '0' }}>
                {addingAdmin ? 'Adding…' : 'Grant Admin'}
              </button>
            </form>
          </div>

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
                          <button className="review-btn" onClick={() => handleToggleAdmin(u.id)}
                            disabled={togglingId === u.id}>
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
            <img src={selected.image_url} alt="Meter" className="modal-img"
              style={{ cursor: 'zoom-in' }}
              onClick={() => setLightboxUrl(selected.image_url)}
              title="Click to enlarge" />
            <p style={{ fontSize: '0.75rem', color: '#718096', textAlign: 'center', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
              Click image to enlarge
            </p>
            {error && <div className="error-box">{error}</div>}
            <form onSubmit={handleReview}>
              <label>Reading Value (units)</label>
              <input type="text" placeholder="e.g. 847.3" value={readingValue}
                onChange={e => setReadingValue(e.target.value)} required autoFocus />
              <label>Notes (optional)</label>
              <textarea placeholder="Any comments…" value={notes}
                onChange={e => setNotes(e.target.value)} rows={2} />
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
