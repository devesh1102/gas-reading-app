import axios from 'axios'

/**
 * Axios instance pre-configured for our Django backend.
 *
 * Why a custom instance?
 * Instead of typing the base URL and auth header on every request,
 * we configure it once here. Every API call in the app imports this.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
})

/**
 * REQUEST interceptor — attaches the JWT access token to every request.
 * The token is stored in localStorage after login.
 * Django reads it from the Authorization header to identify the user.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * RESPONSE interceptor — handles expired tokens (401 responses).
 *
 * JWTs expire (ours after 1 hour). When that happens Django returns 401.
 * Instead of kicking the user out, we silently:
 *   1. Call /auth/token/refresh/ with the refresh token (valid 7 days)
 *   2. Store the new access token
 *   3. Retry the original request automatically
 * The user never notices. Only if the refresh token is also expired do we log out.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh')

      if (refresh) {
        try {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/auth/token/refresh/`,
            { refresh }
          )
          localStorage.setItem('access', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          // Refresh token also expired — clear everything and redirect to login
          localStorage.clear()
          window.location.href = '/'
        }
      }
    }
    return Promise.reject(error)
  }
)

// Auth endpoints
export const requestOTP   = (email)               => api.post('/auth/request-otp/', { email })
export const verifyOTP    = (email, code)          => api.post('/auth/verify-otp/', { email, code })
export const setupProfile = (flat_number, block_number) =>
  api.post('/auth/setup-profile/', { flat_number, block_number })
export const getMe        = ()                     => api.get('/auth/me/')

// Submission endpoints
export const uploadSubmission    = (formData)  => api.post('/submissions/', formData)
export const getAdminSubmissions = (status)    =>
  api.get('/submissions/admin/', { params: status ? { status } : {} })
export const reviewSubmission    = (id, data)  => api.patch(`/submissions/admin/${id}/`, data)

// Admin user management
export const getUsers    = ()       => api.get('/auth/users/')
export const toggleAdmin = (userId) => api.patch(`/auth/users/${userId}/toggle-admin/`)
export const addAdmin    = (email)  => api.post('/auth/users/add-admin/', { email })

export default api
