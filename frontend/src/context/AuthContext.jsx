import { createContext, useContext, useState, useEffect } from 'react'
import { getMe } from '../services/api'

/**
 * AuthContext stores who is logged in across the entire app.
 *
 * Why React Context?
 * Without it, every component that needs to know "is the user logged in?"
 * would have to read localStorage themselves and pass props up/down.
 * Context is a global store — any component can read it with useAuth().
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)  // true while we check existing session

  // On app load: if tokens exist in localStorage, fetch the user profile
  // This keeps the user logged in after a page refresh
  useEffect(() => {
    const token = localStorage.getItem('access')
    if (token) {
      getMe()
        .then(({ data }) => setUser(data))
        .catch(() => {
          localStorage.clear()   // token invalid/expired — start fresh
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = (tokens) => {
    // Store tokens in localStorage — persists across page refreshes
    localStorage.setItem('access', tokens.access)
    localStorage.setItem('refresh', tokens.refresh)
    setUser({
      email: tokens.email,
      is_admin: tokens.is_admin,
      is_profile_complete: tokens.is_profile_complete,
    })
  }

  const updateUser = (updates) => setUser((prev) => ({ ...prev, ...updates }))

  const logout = () => {
    localStorage.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook — components call useAuth() instead of useContext(AuthContext)
export const useAuth = () => useContext(AuthContext)
