import { useState, useEffect } from 'react'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Sidebar from '../components/common/Sidebar'
import { creditService } from '../services/creditService'
import { supabase } from '../utils/supabase'
import { formatThaiDateTimeBangkok, parseDbDateTime } from '../utils/dateDisplay'

export default function CreditHistory({ user }) {
  const [transactions, setTransactions] = useState([])
  const [usageLogs, setUsageLogs] = useState([])
  const [allHistory, setAllHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchUserEmail, setSearchUserEmail] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllDates, setShowAllDates] = useState(false)
  const [userList, setUserList] = useState([])
  const [userMap, setUserMap] = useState({}) // Map email to username

  useEffect(() => {
    if (user) {
      fetchData()
      if (user.role === 'admin') {
        fetchUserList()
        fetchUserMap()
      }
    }
  }, [user])

  const fetchUserMap = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('Email, Username')
      
      if (!error && data) {
        const map = {}
        data.forEach(u => {
          const email = u.Email || u.email
          const username = u.Username || u.username || ''
          if (email) {
            map[email.toLowerCase()] = username
          }
        })
        setUserMap(map)
      }
    } catch (error) {
      console.error('Error fetching user map:', error)
    }
  }

  const fetchUserList = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('Email, email, Username, username')
        .order('Email', { ascending: true })
      
      if (!error && data) {
        const emails = data.map(u => u.Email || u.email).filter(Boolean)
        setUserList(emails)
      }
    } catch (error) {
      console.error('Error fetching user list:', error)
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      
      if (user.role === 'admin') {
        // Admin: Get all transactions and usage logs
        const [allTransactions, allUsageLogs] = await Promise.all([
          creditService.getAllCreditTransactions(),
          fetchAllUsageLogs()
        ])
        
        setTransactions(allTransactions || [])
        setUsageLogs(allUsageLogs || [])
      } else {
        // Customer: Get only their own data
        const [userTransactions, userUsageLogs] = await Promise.all([
          creditService.getUserCreditTransactions(user.email),
          creditService.getCreditUsageLog(user.email)
        ])
        
        setTransactions(userTransactions || [])
        setUsageLogs(userUsageLogs || [])
      }
    } catch (error) {
      console.error('Error fetching credit history:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsageLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_usage_log')
        .select('*')
        .order('createdat', { ascending: false })

      if (error) {
        console.error('Error fetching all usage logs:', error)
        return []
      }
      return data || []
    } catch (error) {
      console.error('Error fetching all usage logs:', error)
      return []
    }
  }

  useEffect(() => {
    // Combine and filter history
    const combined = []
    
    // Add transactions (เติมเครดิต)
    transactions.forEach(tx => {
      // Use approvedat if approved, otherwise use createdat
      const displayDate = (tx.status === 'approved' && (tx.approvedat || tx.ApprovedAt))
        ? (tx.approvedat || tx.ApprovedAt)
        : (tx.createdat || tx.CreatedAt)
      
      combined.push({
        id: tx.id || tx.transactionid,
        type: 'topup',
        date: displayDate,
        userEmail: tx.useremail || tx.UserEmail,
        amount: tx.amount || tx.Amount,
        status: tx.status,
        transactionId: tx.transactionid || tx.TransactionID,
        note: tx.note,
        adminEmail: tx.adminemail || tx.AdminEmail
      })
    })
    
    // Add usage logs (ใช้/คืนเครดิต)
    usageLogs.forEach(log => {
      const amount = log.Amount || log.amount || 0
      combined.push({
        id: log.id,
        type: amount < 0 ? 'refund' : 'usage',
        date: log.CreatedAt || log.createdat,
        userEmail: log.UserEmail || log.useremail,
        amount: Math.abs(amount),
        orderId: log.OrderID || log.orderid,
        order_id: log.OrderID || log.orderid
      })
    })
    
    // Filter by search criteria
    let filtered = combined
    
    // Filter by user email or username (admin only)
    if (user.role === 'admin' && searchUserEmail.trim()) {
      const searchTerm = searchUserEmail.trim().toLowerCase()
      filtered = filtered.filter(item => {
        const email = (item.userEmail || '').toLowerCase()
        const username = (userMap[email] || '').toLowerCase()
        return email.includes(searchTerm) || username.includes(searchTerm)
      })
    } else if (user.role !== 'admin') {
      // Customer: only show their own data
      filtered = filtered.filter(item => 
        (item.userEmail || '').toLowerCase() === (user.email || '').toLowerCase()
      )
    }
    
    // Filter by date range (ข้ามถ้าเลือก "ทั้งหมด")
    if (!showAllDates && (startDate || endDate)) {
      filtered = filtered.filter(item => {
        if (!item.date) return false
        const itemDate = parseDbDateTime(item.date)
        if (!itemDate) return false
        if (startDate) {
          const start = new Date(startDate)
          start.setHours(0, 0, 0, 0)
          if (itemDate < start) return false
        }
        if (endDate) {
          const end = new Date(endDate)
          end.setHours(23, 59, 59, 999)
          if (itemDate > end) return false
        }
        return true
      })
    }
    
    // Sort by date (newest first)
    filtered.sort((a, b) => {
      const dateA = parseDbDateTime(a.date)?.getTime() ?? 0
      const dateB = parseDbDateTime(b.date)?.getTime() ?? 0
      return dateB - dateA
    })
    
    setAllHistory(filtered)
  }, [transactions, usageLogs, searchUserEmail, startDate, endDate, showAllDates, user, userMap])

  const formatDate = (dateStr) => {
    const out = formatThaiDateTimeBangkok(dateStr)
    return out === '-' && dateStr ? String(dateStr) : out
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'topup':
        return 'เติมเครดิต'
      case 'usage':
        return 'ใช้เครดิต'
      case 'refund':
        return 'คืนเครดิต'
      default:
        return type
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'topup':
        return 'bg-blue-100 text-blue-800'
      case 'usage':
        return 'bg-red-100 text-red-800'
      case 'refund':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'approved':
        return 'อนุมัติแล้ว'
      case 'rejected':
        return 'ปฏิเสธ'
      case 'pending':
        return 'รออนุมัติ'
      default:
        return status
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  // Check if user has sidebar (admin or franchise)
  const hasSidebar = user?.role === 'admin' || user?.userType === 'franchise' || user?.customerType === 'franchise'

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        {hasSidebar && <Sidebar user={user} />}
        
        <div className={`flex-1 ${hasSidebar ? 'ml-0 md:ml-64' : ''} p-6 pt-20`}>
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ประวัติการใช้เครดิต</h1>
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
              >
                <Icon icon="fa-sync-alt" className="text-gray-700" />
                <span className="text-gray-700">รีเฟรช</span>
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex gap-4 flex-wrap">
                {user.role === 'admin' && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหาตามอีเมลหรือชื่อผู้ใช้</label>
                    <input
                      type="text"
                      value={searchUserEmail}
                      onChange={(e) => setSearchUserEmail(e.target.value)}
                      placeholder="กรอกอีเมลหรือชื่อผู้ใช้..."
                      list="user-emails"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    <datalist id="user-emails">
                      {userList.map(email => (
                        <option key={email} value={email} />
                      ))}
                    </datalist>
                  </div>
                )}
                <div className="min-w-[200px]">
                  <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่มต้น</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setShowAllDates(false) }}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="min-w-[200px]">
                  <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สิ้นสุด</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setShowAllDates(false) }}
                    min={startDate}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <DateRangeFilter
                  layout="buttonsOnly"
                  labelInline
                  start={startDate}
                  end={endDate}
                  onStartChange={(v) => { setStartDate(v); setShowAllDates(false) }}
                  onEndChange={(v) => { setEndDate(v); setShowAllDates(false) }}
                  showAllDates={showAllDates}
                  onShowAllDatesChange={setShowAllDates}
                  extraButtons={
                    (searchUserEmail || startDate || endDate || showAllDates) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchUserEmail('')
                          setStartDate('')
                          setEndDate('')
                          setShowAllDates(false)
                        }}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold text-gray-700 transition"
                      >
                        ล้างตัวกรอง
                      </button>
                    )
                  }
                />
              </div>
            </div>

            {/* History Table */}
            {allHistory.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Icon icon="fa-wallet" className="text-5xl mb-4 opacity-50" />
                <p>ไม่พบประวัติการใช้เครดิต</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่</th>
                        {user.role === 'admin' && (
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้ใช้</th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ประเภท</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จำนวนเงิน</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">รายละเอียด</th>
                        {user.role === 'admin' && (
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {allHistory.map((item, index) => (
                        <tr key={`${item.type}-${item.id}-${index}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatDate(item.date)}
                          </td>
                          {user.role === 'admin' && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-900">
                                  {userMap[(item.userEmail || '').toLowerCase()] || '-'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {item.userEmail}
                                </span>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getTypeColor(item.type)}`}>
                              {getTypeLabel(item.type)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold text-lg ${
                              item.type === 'topup' || item.type === 'refund' 
                                ? 'text-green-600' 
                                : 'text-red-600'
                            }`}>
                              {item.type === 'topup' || item.type === 'refund' ? '+' : '-'}
                              ฿{Number(item.amount || 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.type === 'topup' && (
                              <div>
                                <div>Transaction ID: {item.transactionId}</div>
                                {item.note && <div className="text-xs text-gray-500">หมายเหตุ: {item.note}</div>}
                              </div>
                            )}
                            {item.type === 'usage' && (
                              <div>ออเดอร์: {item.orderId || item.order_id || '-'}</div>
                            )}
                            {item.type === 'refund' && (
                              <div>ออเดอร์: {item.orderId || item.order_id || '-'}</div>
                            )}
                          </td>
                          {user.role === 'admin' && item.type === 'topup' && (
                            <td className="px-4 py-3">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(item.status)}`}>
                                {getStatusText(item.status)}
                              </span>
                            </td>
                          )}
                          {user.role === 'admin' && item.type !== 'topup' && (
                            <td className="px-4 py-3 text-sm text-gray-400">-</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
