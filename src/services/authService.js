import { supabase } from '../utils/supabase'

/**
 * ตรวจว่าเป็นอุปกรณ์มือถือหรือไม่ (ใช้แสดงคำแนะนำลงชื่อเข้าใช้ด้วย Google)
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase())
}

/**
 * ตรวจว่าเปิดจาก WebView / in-app browser หรือไม่
 * Google OAuth จะคืน 403 disallowed_useragent ในสภาพแบบนี้
 */
export function isLikelyWebViewOrInAppBrowser() {
  if (!isMobileDevice()) return false
  const ua = navigator.userAgent.toLowerCase()
  const webViewMarkers = [
    'webview', 'wv)', '; wv)',
    'line/', 'line ', 'fban', 'fbav', 'instagram', 'twitter', 'snapchat',
    'naver', 'kakaotalk'
  ]
  return webViewMarkers.some(m => ua.includes(m))
}

export const authService = {
  // Google Sign-In
  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      
      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Google sign-in error:', error)
      return { success: false, error: error.message }
    }
  },

  // Get current session
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      return { success: true, session }
    } catch (error) {
      console.error('Get session error:', error)
      return { success: false, error: error.message }
    }
  },

  // Sign out
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Sign out error:', error)
      return { success: false, error: error.message }
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      return { success: true, user }
    } catch (error) {
      console.error('Get current user error:', error)
      return { success: false, error: error.message }
    }
  },

  // Check if user exists in users table
  async checkUserExists(email) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('Email', email)
        .maybeSingle()

      if (error) throw error
      return { success: true, exists: !!data, user: data }
    } catch (error) {
      console.error('Check user exists error:', error)
      return { success: false, error: error.message }
    }
  },

  // ดึงโปรไฟล์ผู้ใช้จาก DB (ใช้ตรวจสอบว่า UserType ถูกเปลี่ยนโดยแอดมิน แล้วบังคับ logout)
  async getProfileByEmail(email) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('Email, UserType, Username, BranchId')
        .eq('Email', email)
        .maybeSingle()

      if (error) throw error
      return { success: true, profile: data }
    } catch (error) {
      console.error('Get profile error:', error)
      return { success: false, error: error.message, profile: null }
    }
  },

  // Create user in users table
  async createUser(userData) {
    try {
      // Double-check if user exists before creating
      const checkResult = await this.checkUserExists(userData.email)
      if (checkResult.success && checkResult.exists) {
        console.log('User already exists, returning existing user')
        return { success: true, user: checkResult.user }
      }

      const { data, error } = await supabase
        .from('users')
        .insert({
          Email: userData.email,
          Username: userData.username || userData.email.split('@')[0],
          Password: null, // No password for OAuth users
          Role: userData.role || 'partner',
          UserType: userData.userType || 'regular',
          RegisteredDate: new Date().toISOString(),
          Phone: userData.phone || null,
          Address: userData.address || null,
          BranchId: null,
          TaxName: null,
          TaxID: null,
          TaxAddress: null
        })
        .select()
        .single()

      if (error) {
        // If duplicate key error, fetch existing user instead
        if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
          console.log('Duplicate key detected, fetching existing user')
          const existingUserResult = await this.checkUserExists(userData.email)
          if (existingUserResult.success && existingUserResult.exists) {
            return { success: true, user: existingUserResult.user }
          }
        }
        throw error
      }
      return { success: true, user: data }
    } catch (error) {
      console.error('Create user error:', error)
      return { success: false, error: error.message }
    }
  }
}
