import { useState, useRef } from 'react'
import { uploadSubmission } from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * Main resident screen — pick a photo, preview it, submit.
 *
 * Why FormData instead of JSON?
 * Files can't be sent as JSON. FormData encodes the file as multipart/form-data,
 * which Django's request.FILES can read. Axios handles the Content-Type header automatically.
 */
export default function UploadPage() {
  const { user, logout } = useAuth()

  const [image, setImage]     = useState(null)      // File object
  const [preview, setPreview] = useState(null)      // Object URL for <img>
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const fileInput = useRef(null)

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImage(file)
    setPreview(URL.createObjectURL(file))  // create a local URL to preview before uploading
    setSuccess(false)
    setError('')
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!image) return
    setError('')
    setLoading(true)

    // FormData packages the file for multipart upload
    const formData = new FormData()
    formData.append('image', image)

    try {
      await uploadSubmission(formData)
      setSuccess(true)
      setImage(null)
      setPreview(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="card-header">
          <h1>📸 Submit Meter Reading</h1>
          <div className="user-info">
            <span>Block {user?.block_number} · Flat {user?.flat_number}</span>
            <button className="link-btn" onClick={logout}>Logout</button>
          </div>
        </div>

        {success && (
          <div className="success-box">
            ✅ Reading submitted successfully! The admin will review it shortly.
          </div>
        )}

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleUpload}>
          {/* Clicking the styled button triggers the hidden file input */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"   /* on mobile, opens the camera directly */
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label htmlFor="file-input" className="file-label">
            {preview ? '📷 Change Photo' : '📷 Take / Choose Photo'}
          </label>

          {preview && (
            <div className="preview-container">
              <img src={preview} alt="Meter preview" className="preview-img" />
            </div>
          )}

          {image && (
            <button type="submit" disabled={loading}>
              {loading ? 'Uploading…' : 'Submit Reading'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
