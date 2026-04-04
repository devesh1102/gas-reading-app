import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps any route that requires authentication.
 *
 * How it works:
 * - Still loading session?  → show nothing (prevents flash of wrong page)
 * - Not logged in?          → redirect to /login
 * - Needs admin but isn't?  → redirect to /upload
 * - Otherwise               → render the page
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()

  if (loading) return null

  if (!user) return <Navigate to="/login" replace />

  if (adminOnly && !user.is_admin) return <Navigate to="/upload" replace />

  return children
}
