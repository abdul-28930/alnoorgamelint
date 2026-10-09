import { createClient } from '@supabase/supabase-js'
import { apiFetch } from './api'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not found. Please check your .env.local file.')
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'NOT SET')
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'NOT SET')
}

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Simple auth helpers with session persistence
export const auth = {
  signUp: async (email: string, password: string, userData?: { fullName: string, username: string, phone?: string }) => {
    if (!userData) {
      return { data: null, error: { message: 'User data required for signup' } }
    }
    
    try {
      const response = await apiFetch(`/api/v1/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: userData.fullName,
          username: userData.username,
          phone: userData.phone
        })
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        return { data: null, error: { message: result.detail || 'Signup failed' } }
      }
      
      // After successful backend signup, sign in the user
      if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      return { data, error }
      
    } catch (error) {
      return { data: null, error: { message: 'Network error during signup' } }
    }
  },
  
  signIn: (email: string, password: string) => 
    supabase ? supabase.auth.signInWithPassword({ email, password }) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  signInWithUsernameOrEmail: async (emailOrUsername: string, password: string) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }
    
    try {
      // Get email from backend (handles username lookup)
      const response = await apiFetch(`/api/v1/auth/login-with-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_or_username: emailOrUsername, password: password })
      })
      
      const result = await response.json()
      if (!response.ok) {
        return { data: null, error: { message: result.detail || 'Invalid credentials' } }
      }
      
      // Use email for Supabase login
      return supabase.auth.signInWithPassword({ email: result.email, password })
    } catch (error) {
      return { data: null, error: { message: 'Login failed' } }
    }
  },
  
  signOut: () => supabase ? supabase.auth.signOut() : Promise.resolve({ error: null }),
  
  getUser: () => supabase ? supabase.auth.getUser() : Promise.resolve({ data: { user: null }, error: null }),
  
  // Check for existing session
  getSession: () => supabase ? supabase.auth.getSession() : Promise.resolve({ data: { session: null }, error: null }),
  
  // Listen for auth changes
  onAuthChange: (callback: (event: string, session: any) => void) => 
    supabase ? supabase.auth.onAuthStateChange(callback) : { data: { subscription: null } }
}

// Simple booking helpers
export const bookings = {
  create: async (booking: any) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/bookings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(booking)
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Booking failed' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  
  getUserBookings: async (userId: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/bookings`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to get bookings' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  
  getUserCancelledBookings: (userId: string) => 
    supabase ? supabase.from('bookings').select('*, stations(*)').eq('user_id', userId).eq('status', 'CANCELLED') : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  getAllBookings: async (page: number = 1, limit: number = 10) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings?page=${page}&limit=${limit}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result.data || [], total: result.total || 0, page: result.page || 1, limit: result.limit || 10, error: null } : { data: null, total: 0, error: { message: result.detail || 'Failed to get bookings' } }
    } catch (error) {
      return { data: null, total: 0, error: { message: 'Network error' } }
    }
  },
  
  getAllCancelledBookings: async (page: number = 1, limit: number = 10) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings/cancelled?page=${page}&limit=${limit}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result.data || [], total: result.total || 0, page: result.page || 1, limit: result.limit || 10, error: null } : { data: null, total: 0, error: { message: result.detail || 'Failed to get cancelled bookings' } }
    } catch (error) {
      return { data: null, total: 0, error: { message: 'Network error' } }
    }
  },
  
  update: async (id: string, booking: any) => {
    console.log('Updating booking via API:', id, booking)
    
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(booking)
      })
      
      const result = await response.json()
      console.log('API update result:', result)
      
      if (!response.ok) {
        return { data: null, error: { message: result.detail || 'Update failed' } }
      }
      
      return { data: result, error: null }
    } catch (error) {
      console.error('API error:', error)
      return { data: null, error: { message: 'Network error' } }
    }
  },

  cancel: async (id: string) => {
    console.log('Cancelling booking via API:', id)
    
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/bookings/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      const result = await response.json()
      console.log('API cancel result:', result)
      
      if (!response.ok) {
        return { data: null, error: { message: result.detail || 'Cancel failed' } }
      }
      
      return { data: result, error: null }
    } catch (error) {
      console.error('API error:', error)
      return { data: null, error: { message: 'Network error' } }
    }
  },
  
  getAvailableSlots: (stationId: string, date: string) => 
    supabase ? supabase.rpc('get_available_slots', { station_id_param: stationId, date_param: date }) : Promise.resolve({ data: [], error: { message: 'Supabase not configured' } }),
  
  getAvailableSlotsByType: async (stationType: 'PC' | 'PS5', date: string) => {
    try {
      const url = `/api/v1/stations/availability-by-type?type=${stationType}&date=${date}`
      console.log('🔍 [DEBUG] Fetching from:', url)
      const response = await apiFetch(url)
      console.log('📡 [DEBUG] Response status:', response.status)
      const result = await response.json()
      console.log('📦 [DEBUG] Response data:', result)
      
      if (!response.ok) {
        console.error('❌ [DEBUG] Error response:', result)
        return { data: null, error: { message: result.detail || 'Failed to get slots' } }
      }
      
      return { data: result, error: null }
    } catch (error) {
      console.error('❌ [DEBUG] Network error:', error)
      return { data: null, error: { message: 'Network error' } }
    }
  }
}

// Simple station helpers
export const stations = {
  getAll: () => 
    supabase ? supabase.from('stations').select('*') : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  create: (station: any) => 
    supabase ? supabase.from('stations').insert(station) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  update: (id: string, station: any) => 
    supabase ? supabase.from('stations').update(station).eq('id', id) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  delete: (id: string) => 
    supabase ? supabase.from('stations').delete().eq('id', id) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } })
}

// Simple profile helpers
export const profiles = {
  get: (userId: string) => 
    supabase ? supabase.from('user_profiles').select('*').eq('user_id', userId).single() : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  getAll: () => 
    supabase ? supabase.from('user_profiles').select('*') : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  create: (profile: any) => 
    supabase ? supabase.from('user_profiles').insert(profile) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  update: (userId: string, updates: any) => 
    supabase ? supabase.from('user_profiles').update(updates).eq('user_id', userId) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  
  checkUsername: async (username: string) => {
    try {
      const response = await apiFetch(`/api/v1/auth/check-username?username=${encodeURIComponent(username)}`, {
        method: 'POST'
      })
      const result = await response.json()
      return { data: result.available, error: null }
    } catch (error) {
      return { data: false, error: { message: 'Failed to check username' } }
    }
  },
  
  changePassword: (newPassword: string) => 
    supabase ? supabase.auth.updateUser({ password: newPassword }) : Promise.resolve({ data: null, error: { message: 'Supabase not configured' } })
}

// Storage helpers
export const storage = {
  uploadProfilePicture: async (userId: string, file: File) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }
    
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExt}`
    const filePath = `profile-pictures/${fileName}`
    
    const { data, error } = await supabase.storage
      .from('profile-pictures')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (error) return { data: null, error }
    
    const { data: urlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(filePath)
    
    return { data: { path: filePath, url: urlData.publicUrl }, error: null }
  },
  
  deleteProfilePicture: async (filePath: string) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } }
    
    return await supabase.storage
      .from('profile-pictures')
      .remove([filePath])
  }
}

// Admin helpers
export const admin = {
  // Check if current user is admin
  checkAccess: async () => {
    if (!supabase) return { data: false, error: { message: 'Supabase not configured' } }
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: false, error: { message: 'Not authenticated' } }
    
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('admin_emails')
      .single()
    
    if (!settings?.admin_emails) return { data: false, error: { message: 'No admin emails configured' } }
    
    const adminEmails = JSON.parse(settings.admin_emails)
    return { data: adminEmails.includes(user.email), error: null }
  },

  // Get all users for admin panel
  getAllUsers: async () => {
    try {
      const response = await apiFetch(`/api/v1/admin/users`)
      const result = await response.json()
      return { data: result, error: null }
    } catch (error) {
      return { data: null, error: { message: 'Failed to fetch users' } }
    }
  },

  // Get user profiles by user IDs
  getUserProfiles: async (userIds: string[]) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/user-profiles`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userIds)
      })
      if (!response.ok) {
        const error = await response.json()
        return { data: null, error: { message: error.detail || 'Failed to fetch user profiles' } }
      }
      const result = await response.json()
      return { data: result, error: null }
    } catch (error) {
      return { data: null, error: { message: 'Failed to fetch user profiles' } }
    }
  },
  
  // Get admin emails
  getAdminEmails: async () => {
    if (!supabase) return { data: [], error: { message: 'Supabase not configured' } }
    
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('admin_emails')
      .single()
    
    if (!settings?.admin_emails) return { data: [], error: null }
    
    const adminEmails = JSON.parse(settings.admin_emails)
    return { data: adminEmails, error: null }
  },
  
  // Update admin emails
  updateAdminEmails: async (emails: string[]) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }
    
    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({ 
        id: 1, 
        admin_emails: JSON.stringify(emails) 
      })
    
    return { data, error }
  },

  // Get food items
  getFoodItems: async () => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      const response = await apiFetch(`/api/v1/admin/food-items`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const result = await response.json()
      return { data: result, error: null }
    } catch (error) {
      return { data: null, error: { message: 'Failed to fetch food items' } }
    }
  },

  // Update food items
  updateFoodItems: async (items: Array<{name: string, price: number}>) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      const response = await apiFetch(`/api/v1/admin/food-items`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(items)
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to update food items' } }
    } catch (error) {
      return { data: null, error: { message: 'Failed to update food items' } }
    }
  },

  // Get stations with reservations for a date
  getStationsWithReservations: async (date: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/stations/reservations?date=${date}`, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to fetch stations' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },

  // Check in a booking and assign station
  checkinBooking: async (bookingId: string, stationId: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings/${bookingId}/checkin?station_id=${stationId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Check-in failed' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },

  // Timer functions
  startTimer: async (bookingId: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings/${bookingId}/timer/start`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to start timer' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },

  stopTimer: async (bookingId: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings/${bookingId}/timer/stop`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to stop timer' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },

  // Generate receipt
  generateReceipt: async (bookingId: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/bookings/${bookingId}/receipt`, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        const error = await response.json()
        return { data: null, error: { message: error.detail || 'Failed to generate receipt' } }
      }
      
      // Get PDF blob and trigger download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt_${bookingId}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      return { data: { success: true }, error: null }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  }
}

// Points helpers
export const points = {
  getBalance: async () => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/user/points`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to get points' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  
  getHistory: async () => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/user/points/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to get history' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  
  getRewards: async () => {
    try {
      const response = await apiFetch(`/api/v1/points/rewards`)
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: 'Failed to get rewards' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  
  redeemReward: async (rewardId: string) => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } }
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/points/redeem/${rewardId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const result = await response.json()
      return response.ok ? { data: result, error: null } : { data: null, error: { message: result.detail || 'Failed to redeem' } }
    } catch (error) {
      return { data: null, error: { message: 'Network error' } }
    }
  }
}