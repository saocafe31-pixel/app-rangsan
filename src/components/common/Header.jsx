import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Icon from './Icon'
import { APP_LOGO_URL } from '../../utils/constants'
import { creditService } from '../../services/creditService'
import { notificationService } from '../../services/notificationService'
import { getFeaturesSettings } from '../../services/shopSettingsService'
import NotificationDropdown from './NotificationDropdown'

export default function Header({ user, cartItemCount, onCartClick }) {
  const navigate = useNavigate()
  const [creditBalance, setCreditBalance] = useState(0)
  const [loadingCredit, setLoadingCredit] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [features, setFeatures] = useState({ showCreditTopUp: true })

  useEffect(() => {
    if (user && user.role !== 'admin') {
      fetchCreditBalance()
      fetchUnreadCount()
      
      // Refresh credit balance when tab becomes active
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchCreditBalance()
          fetchUnreadCount()
        }
      }
      
      // Listen for custom event when credit is updated
      const handleCreditUpdated = (event) => {
        // Refresh if event is for current user or no specific user
        if (!event.detail?.userEmail || event.detail.userEmail === user.email) {
          fetchCreditBalance()
        }
      }
      
      // Listen for notification read event
      const handleNotificationRead = () => {
        fetchUnreadCount()
      }
      
      // Polling: Refresh credit balance and notifications every 10 seconds
      const intervalId = setInterval(() => {
        fetchCreditBalance()
        fetchUnreadCount()
      }, 10000)
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('creditUpdated', handleCreditUpdated)
      window.addEventListener('notificationRead', handleNotificationRead)
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('creditUpdated', handleCreditUpdated)
        window.removeEventListener('notificationRead', handleNotificationRead)
        clearInterval(intervalId)
      }
    } else if (user && user.role === 'admin') {
      // Admin also needs notifications
      fetchUnreadCount()
      
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchUnreadCount()
        }
      }
      
      const handleNotificationRead = () => {
        fetchUnreadCount()
      }
      
      const intervalId = setInterval(() => {
        fetchUnreadCount()
      }, 10000)
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('notificationRead', handleNotificationRead)
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('notificationRead', handleNotificationRead)
        clearInterval(intervalId)
      }
    }
  }, [user])

  useEffect(() => {
    getFeaturesSettings().then(setFeatures)
  }, [])

  const fetchUnreadCount = async () => {
    if (!user) return
    try {
      const count = await notificationService.getUnreadCount(user.email)
      setUnreadCount(count)
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }

  const fetchCreditBalance = async () => {
    try {
      setLoadingCredit(true)
      const credit = await creditService.getUserCredit(user.email)
      setCreditBalance(credit.balance || 0)
    } catch (error) {
      console.error('Error fetching credit balance:', error)
    } finally {
      setLoadingCredit(false)
    }
  }

  const cartBadgeText =
    Number(cartItemCount) > 99 ? '99+' : String(Number(cartItemCount) || 0)

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-[60]">
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between">
          <Link to={user?.role === 'admin' ? '/admin/dashboard' : '/home'} className="flex items-center gap-3">
            <img src={APP_LOGO_URL} alt="APP RANGSAN" className="w-10 h-10 rounded-full" />
            <span className="text-xl font-bold text-gray-900">APP RANGSAN</span>
          </Link>

          <div className="flex items-center gap-4">
            {user?.role !== 'admin' && (
              <>
                {features.showCreditTopUp && (
                  <button
                    onClick={() => navigate('/topup')}
                    className="relative p-2 text-gray-700 hover:text-emerald-600 transition group"
                    title="ยอดเครดิต"
                  >
                    <Icon icon="fa-wallet" className="text-xl" />
                    {!loadingCredit && (
                      <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] flex items-center justify-center">
                        {creditBalance > 0 ? creditBalance.toLocaleString() : '0'}
                      </span>
                    )}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
                      ยอดเครดิต: ฿{creditBalance.toLocaleString()}
                    </span>
                  </button>
                )}

                {/* Shopping Cart */}
                <button
                  onClick={onCartClick}
                  className="relative p-2 text-gray-700 hover:text-emerald-600 transition"
                >
                  <Icon icon="fa-shopping-cart" className="text-2xl" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center leading-none">
                      {cartBadgeText}
                    </span>
                  )}
                </button>
              </>
            )}

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-700 hover:text-emerald-600 transition"
                title="แจ้งเตือน"
              >
                <Icon icon="fa-bell" className="text-xl" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <NotificationDropdown
                  user={user}
                  onClose={() => setShowNotifications(false)}
                />
              )}
            </div>

            <button
              onClick={() => navigate('/profile')}
              className="p-2 text-gray-700 hover:text-emerald-600 transition"
            >
              <Icon icon="fa-user" className="text-xl" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
