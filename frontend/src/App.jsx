import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage  from './pages/LoginPage'
import SetupPage  from './pages/SetupPage'
import UploadPage from './pages/UploadPage'
import AdminPage  from './pages/AdminPage'
import './index.css'

/**
 * App is purely routing + wrapping the whole tree in AuthProvider.
 *
 * Route structure:
 *  /login              → public (LoginPage)
 *  /setup              → must be logged in (SetupPage)
 *  /upload             → must be logged in (UploadPage)
 *  /admin              → must be logged in AND is_admin (AdminPage)
 *  /                   → redirect to /login
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/setup"  element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/admin"  element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="*"       element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

