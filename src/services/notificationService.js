import { supabase } from '../utils/supabase'

export const notificationService = {
  // Create notification for user
  async createNotification(userEmail, type, title, message, orderId = null, metadata = {}) {
    try {
      console.log('Creating notification:', { userEmail, type, title, message, orderId })
      
      // Try lowercase column names first (Supabase converts to lowercase)
      // Note: createdat may not exist, so we'll try without it first
      let result = await supabase
        .from('notifications')
        .insert({
          useremail: userEmail,
          type: type, // 'order_edited', 'order_cancelled', 'order_status_changed', etc.
          title: title,
          message: message,
          orderid: orderId,
          metadata: metadata,
          read: false
          // Don't include createdat - let database use default NOW()
        })
        .select()
        .single()

      if (result.error) {
        console.warn('First insert attempt failed, trying with createdat:', result.error)
        // Try with createdat
        result = await supabase
          .from('notifications')
          .insert({
            useremail: userEmail,
            type: type,
            title: title,
            message: message,
            orderid: orderId,
            metadata: metadata,
            read: false,
            createdat: new Date().toISOString()
          })
          .select()
          .single()
      }

      if (result.error) {
        // Try PascalCase as fallback
        console.warn('Lowercase failed, trying PascalCase:', result.error)
        result = await supabase
          .from('notifications')
          .insert({
            UserEmail: userEmail,
            Type: type,
            Title: title,
            Message: message,
            OrderID: orderId,
            Metadata: metadata,
            Read: false
            // Don't include CreatedAt - let database use default
          })
          .select()
          .single()
      }

      if (result.error) {
        console.error('Error creating notification (all attempts failed):', {
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code,
          userEmail,
          type,
          title
        })
        // Don't throw - notifications are not critical
        return null
      }

      console.log('Notification created successfully:', result.data)
      return result.data
    } catch (error) {
      console.error('Error creating notification (exception):', error)
      return null
    }
  },

  // Get user notifications
  async getUserNotifications(userEmail) {
    try {
      // Try lowercase column names first (Supabase converts to lowercase)
      let result = await supabase
        .from('notifications')
        .select('*')
        .eq('useremail', userEmail)
        .order('createdat', { ascending: false })
        .limit(50)

      if (result.error) {
        // Try UserEmail + CreatedAt (PascalCase) as fallback
        result = await supabase
          .from('notifications')
          .select('*')
          .eq('UserEmail', userEmail)
          .order('CreatedAt', { ascending: false })
          .limit(50)
      }

      if (result.error) {
        console.error('Error fetching notifications:', {
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code
        })
        // Return empty array instead of throwing
        return []
      }

      return result.data || []
    } catch (error) {
      console.error('Error fetching notifications:', error)
      return []
    }
  },

  // Get unread count for user
  async getUnreadCount(userEmail) {
    try {
      // Try lowercase column names first (Supabase converts to lowercase)
      let result = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('useremail', userEmail)
        .eq('read', false)

      if (result.error) {
        // Try Read (PascalCase) as fallback
        result = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('UserEmail', userEmail)
          .eq('Read', false)
      }

      if (result.error) {
        console.error('Error getting unread count:', {
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code
        })
        // Return 0 instead of throwing
        return 0
      }

      return result.count || 0
    } catch (error) {
      console.error('Error getting unread count:', error)
      return 0
    }
  },

  // Mark notification as read
  async markAsRead(notificationId) {
    try {
      // Try lowercase column names first (Supabase converts to lowercase)
      let result = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .select()
        .single()

      if (result.error) {
        // Try ID + read (lowercase)
        result = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('ID', notificationId)
          .select()
          .single()
      }

      if (result.error) {
        // Try ID + Read (PascalCase)
        result = await supabase
          .from('notifications')
          .update({ Read: true })
          .eq('ID', notificationId)
          .select()
          .single()
      }

      if (result.error) {
        // Try id + Read
        result = await supabase
          .from('notifications')
          .update({ Read: true })
          .eq('id', notificationId)
          .select()
          .single()
      }

      if (result.error) {
        console.error('Error marking notification as read:', {
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code
        })
        // Return null instead of throwing
        return null
      }

      return result.data
    } catch (error) {
      console.error('Error marking notification as read:', error)
      return null
    }
  },

  // Mark all notifications as read for user
  async markAllAsRead(userEmail) {
    try {
      // Try lowercase column names first (Supabase converts to lowercase)
      let result = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('useremail', userEmail)
        .eq('read', false)
        .select()

      if (result.error) {
        // Try Read (PascalCase) as fallback
        result = await supabase
          .from('notifications')
          .update({ Read: true })
          .eq('UserEmail', userEmail)
          .eq('Read', false)
          .select()
      }

      if (result.error) {
        console.error('Error marking all notifications as read:', {
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code
        })
        // Return empty array instead of throwing
        return []
      }

      return result.data || []
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      return []
    }
  }
}
