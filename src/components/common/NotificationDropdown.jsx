import { useState, useEffect, useRef } from 'react'
import { notificationService } from '../../services/notificationService'
import Icon from './Icon'

export default function NotificationDropdown({ user, onClose }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (user) {
      fetchNotifications()
    }
  }, [user])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const data = await notificationService.getUserNotifications(user.email)
      setNotifications(data || [])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsRead = async (notificationId, e) => {
    e.stopPropagation()
    try {
      await notificationService.markAsRead(notificationId)
      // Update local state
      setNotifications(prev =>
        prev.map(n => (n.ID === notificationId || n.id === notificationId) ? { ...n, Read: true } : n)
      )
      // Dispatch event to update badge count
      window.dispatchEvent(new CustomEvent('notificationRead'))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleMarkAllAsRead = async (e) => {
    e.stopPropagation()
    try {
      await notificationService.markAllAsRead(user.email)
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, Read: true })))
      // Dispatch event to update badge count
      window.dispatchEvent(new CustomEvent('notificationRead'))
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'เมื่อสักครู่'
      if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`
      if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`
      if (diffDays < 7) return `${diffDays} วันที่แล้ว`
      
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return dateStr
    }
  }

  const unreadCount = notifications.filter(n => !n.Read && !n.read).length

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-bold text-gray-900">แจ้งเตือน</h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <Icon icon="fa-spinner" className="animate-spin text-xl mb-2" />
            <p className="text-sm">กำลังโหลด...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Icon icon="fa-bell-slash" className="text-3xl mb-2 opacity-50" />
            <p className="text-sm">ยังไม่มีแจ้งเตือน</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => {
              const isRead = notification.Read || notification.read || false
              const notificationId = notification.ID || notification.id
              
              return (
                <div
                  key={notificationId}
                  className={`p-4 hover:bg-gray-50 transition ${
                    !isRead ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                      !isRead ? 'bg-emerald-600' : 'bg-transparent'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className={`text-sm font-bold ${!isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notification.Title || notification.title || 'แจ้งเตือน'}
                          </h4>
                        </div>
                        {!isRead && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMarkAsRead(notificationId, e)
                            }}
                            className="flex-shrink-0 text-emerald-600 hover:text-emerald-700 text-xs px-2 py-1 rounded hover:bg-emerald-50 transition"
                            title="ทำเครื่องหมายว่าอ่านแล้ว"
                          >
                            <Icon icon="fa-check" className="text-xs" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {notification.Message || notification.message || ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDate(notification.CreatedAt || notification.created_at || notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-3 border-t border-gray-200 text-center">
          <button
            onClick={() => window.location.href = '/history'}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ดูทั้งหมด
          </button>
        </div>
      )}
    </div>
  )
}
