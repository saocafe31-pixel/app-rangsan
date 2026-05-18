import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Swal from 'sweetalert2'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Sidebar from '../components/common/Sidebar'
import { creditService } from '../services/creditService'
import { notificationService } from '../services/notificationService'
import { supabase } from '../utils/supabase'
import { formatThaiDateTimeBangkok } from '../utils/dateDisplay'

export default function AdminCreditApproval({ user }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'history' ? 'history' : tabParam === 'topup' ? 'topup' : 'approval'

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [userMap, setUserMap] = useState({}) // Map email to username
  const [searchTerm, setSearchTerm] = useState('')

  // ประวัติการใช้เครดิต (tab)
  const [usageLogs, setUsageLogs] = useState([])
  const [allHistory, setAllHistory] = useState([])
  const [searchUserEmail, setSearchUserEmail] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllDates, setShowAllDates] = useState(false)
  const [userList, setUserList] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // เติมเครดิตให้ผู้ใช้ (tab topup)
  const [topupUserSearch, setTopupUserSearch] = useState('')
  const [topupSelectedEmail, setTopupSelectedEmail] = useState('')
  const [topupAmount, setTopupAmount] = useState('')
  const [topupNote, setTopupNote] = useState('')
  const [topupSlipFile, setTopupSlipFile] = useState(null)
  const [topupSubmitting, setTopupSubmitting] = useState(false)
  const [topupUserList, setTopupUserList] = useState([]) // { email, username }[]

  useEffect(() => {
    fetchTransactions()
    fetchUserMap()
  }, [statusFilter])

  const fetchUserList = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('Email, email, Username, username')
        .order('Email', { ascending: true })
      if (!error && data) {
        setUserList(data.map(u => u.Email || u.email).filter(Boolean))
      }
    } catch (e) {
      console.error('Error fetching user list:', e)
    }
  }

  const fetchAllUsageLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_usage_log')
        .select('*')
        .order('createdat', { ascending: false })
      if (error) throw error
      return data || []
    } catch (e) {
      console.error('Error fetching usage logs:', e)
      return []
    }
  }

  const fetchHistoryData = async () => {
    setLoadingHistory(true)
    try {
      const logs = await fetchAllUsageLogs()
      setUsageLogs(logs)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'history') {
      fetchUserList()
      fetchHistoryData()
    }
  }, [activeTab])

  // โหลดรายชื่อผู้ใช้สำหรับแท็บเติมเครดิต
  useEffect(() => {
    if (activeTab === 'topup') {
      const loadUsers = async () => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('Email, Username')
            .order('Email', { ascending: true })
          if (!error && data) {
            setTopupUserList(data.map(u => ({
              email: u.Email || u.email || '',
              username: (u.Username || u.username || '').trim() || '-'
            })).filter(u => u.email))
          }
        } catch (e) {
          console.error('Error loading users for top-up:', e)
        }
      }
      loadUsers()
    }
  }, [activeTab])

  // รวม transactions + usageLogs เป็น allHistory และกรอง
  useEffect(() => {
    if (activeTab !== 'history') return
    const combined = []
    transactions.forEach(tx => {
      const displayDate = (tx.status === 'approved' && (tx.approvedat || tx.ApprovedAt))
        ? (tx.approvedat || tx.ApprovedAt) : (tx.createdat || tx.CreatedAt)
      combined.push({
        id: tx.id || tx.transactionid,
        type: 'topup',
        date: displayDate,
        userEmail: tx.useremail || tx.UserEmail,
        amount: tx.amount || tx.Amount,
        status: tx.status,
        transactionId: tx.transactionid || tx.TransactionID,
        note: tx.note
      })
    })
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
    let filtered = combined
    if (searchUserEmail.trim()) {
      const search = searchUserEmail.trim().toLowerCase()
      filtered = filtered.filter(item => {
        const email = (item.userEmail || '').toLowerCase()
        const username = (userMap[email] || '').toLowerCase()
        return email.includes(search) || username.includes(search)
      })
    }
    if (!showAllDates && (startDate || endDate)) {
      filtered = filtered.filter(item => {
        if (!item.date) return false
        const itemDate = new Date(item.date)
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
    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    setAllHistory(filtered)
  }, [activeTab, transactions, usageLogs, searchUserEmail, startDate, endDate, showAllDates, userMap])

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

  const fetchTransactions = async () => {
    setLoading(true)
    try {
      // Always fetch all transactions, then filter client-side
      const data = await creditService.getAllCreditTransactions()
      setTransactions(data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (transaction) => {
    try {
      const { value: note } = await Swal.fire({
        title: 'ยืนยันการอนุมัติ',
        html: `
          <div class="text-left">
            <p class="mb-2"><strong>ผู้ใช้:</strong> ${transaction.useremail}</p>
            <p class="mb-2"><strong>จำนวนเงิน:</strong> ฿${Number(transaction.amount).toLocaleString()}</p>
          </div>
        `,
        input: 'textarea',
        inputLabel: 'หมายเหตุ (ถ้ามี)',
        inputPlaceholder: 'ระบุหมายเหตุ...',
        inputAttributes: {
          rows: 3
        },
        showCancelButton: true,
        confirmButtonText: 'อนุมัติ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280'
      })

      if (note === undefined) return // User cancelled

      Swal.fire({
        title: 'กำลังอนุมัติ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      await creditService.approveCreditTransaction(
        transaction.transactionid,
        user.email,
        note || null
      )

      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'อนุมัติสำเร็จ',
        text: 'เครดิตถูกเพิ่มให้ผู้ใช้แล้ว',
        timer: 1500,
        showConfirmButton: false
      })

      // Send notification to user
      await notificationService.createNotification(
        transaction.useremail,
        'credit_approved',
        'การเติมเงินได้รับการอนุมัติ',
        `การเติมเงินจำนวน ฿${Number(transaction.amount).toLocaleString()} ได้รับการอนุมัติแล้ว${note ? `\nหมายเหตุ: ${note}` : ''}`,
        transaction.transactionid,
        { amount: transaction.amount, note: note || null }
      )

      // Dispatch event เพื่อแจ้งให้หน้าลูกค้า refresh credit balance
      window.dispatchEvent(new CustomEvent('creditUpdated', { 
        detail: { userEmail: transaction.useremail } 
      }))
      
      // เปลี่ยน filter เป็น 'all' เพื่อแสดงรายการที่อนุมัติแล้ว
      setStatusFilter('all')
      fetchTransactions()
    } catch (error) {
      Swal.close()
      console.error('Error approving transaction:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอนุมัติได้'
      })
    }
  }

  const handleReject = async (transaction) => {
    try {
      const { value: note } = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการปฏิเสธ',
        html: `
          <div class="text-left">
            <p class="mb-2"><strong>ผู้ใช้:</strong> ${transaction.useremail}</p>
            <p class="mb-2"><strong>จำนวนเงิน:</strong> ฿${Number(transaction.amount).toLocaleString()}</p>
          </div>
        `,
        input: 'textarea',
        inputLabel: 'หมายเหตุ (จำเป็น)',
        inputPlaceholder: 'ระบุเหตุผลในการปฏิเสธ...',
        inputAttributes: {
          rows: 3
        },
        showCancelButton: true,
        confirmButtonText: 'ปฏิเสธ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        inputValidator: (value) => {
          if (!value || value.trim() === '') {
            return 'กรุณาระบุเหตุผลในการปฏิเสธ'
          }
        }
      })

      if (!note) return

      Swal.fire({
        title: 'กำลังปฏิเสธ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      await creditService.rejectCreditTransaction(
        transaction.transactionid,
        user.email,
        note
      )

      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'ปฏิเสธสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })

      // เปลี่ยน filter เป็น 'all' เพื่อแสดงรายการที่ปฏิเสธแล้ว
      setStatusFilter('all')
      fetchTransactions()
    } catch (error) {
      Swal.close()
      console.error('Error rejecting transaction:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถปฏิเสธได้'
      })
    }
  }

  const formatDate = (dateStr) => {
    const out = formatThaiDateTimeBangkok(dateStr)
    return out === '-' && dateStr ? String(dateStr) : out
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

  const getTypeLabel = (type) => {
    switch (type) {
      case 'topup': return 'เติมเครดิต'
      case 'usage': return 'ใช้เครดิต'
      case 'refund': return 'คืนเครดิต'
      default: return type
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'topup': return 'bg-blue-100 text-blue-800'
      case 'usage': return 'bg-red-100 text-red-800'
      case 'refund': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredTransactions = (() => {
    let filtered = statusFilter === 'all'
      ? transactions
      : transactions.filter(t => t.status === statusFilter)
    
    // Filter by search term (email or username)
    if (searchTerm.trim()) {
      const search = searchTerm.trim().toLowerCase()
      filtered = filtered.filter(t => {
        const email = (t.useremail || t.UserEmail || '').toLowerCase()
        const username = (userMap[email] || '').toLowerCase()
        return email.includes(search) || username.includes(search)
      })
    }
    
    return filtered
  })()

  if (loading && activeTab === 'approval') {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                {activeTab === 'approval' ? 'อนุมัติการเติมเงิน' : activeTab === 'history' ? 'ประวัติการใช้เครดิต' : 'เติมเครดิตให้ผู้ใช้'}
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (activeTab === 'approval') fetchTransactions()
                    else fetchHistoryData().then(() => fetchTransactions())
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
                >
                  <Icon icon="fa-sync-alt" className="text-gray-700" />
                  <span className="text-gray-700">รีเฟรช</span>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setSearchParams({})}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  activeTab === 'approval' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                อนุมัติการเติมเงิน
              </button>
              <button
                onClick={() => setSearchParams({ tab: 'history' })}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  activeTab === 'history' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                ประวัติการใช้เครดิต
              </button>
              <button
                onClick={() => setSearchParams({ tab: 'topup' })}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  activeTab === 'topup' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                เติมเครดิตให้ผู้ใช้
              </button>
            </div>

            {activeTab === 'topup' ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <p className="text-gray-600 mb-4">เลือกผู้ใช้จากอีเมลหรือชื่อ แล้วระบุจำนวนเครดิตที่ต้องการเติมให้</p>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">เลือกผู้ใช้ (ค้นหาจากอีเมลหรือชื่อ)</label>
                    <input
                      type="text"
                      value={topupUserSearch}
                      onChange={(e) => setTopupUserSearch(e.target.value)}
                      onFocus={() => topupSelectedEmail && setTopupUserSearch('')}
                      placeholder="พิมพ์อีเมลหรือชื่อเพื่อค้นหา..."
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    {topupUserSearch.trim() && (
                      <ul className="mt-1 border border-gray-200 rounded-lg shadow-lg bg-white max-h-48 overflow-y-auto">
                        {topupUserList
                          .filter(u => {
                            const s = topupUserSearch.trim().toLowerCase()
                            return (u.email || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s)
                          })
                          .slice(0, 20)
                          .map(u => (
                            <li key={u.email}>
                              <button
                                type="button"
                                onClick={() => {
                                  setTopupSelectedEmail(u.email)
                                  setTopupUserSearch(`${u.username} (${u.email})`)
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex flex-col"
                              >
                                <span className="font-medium text-gray-900">{u.username}</span>
                                <span className="text-xs text-gray-500">{u.email}</span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                    {topupSelectedEmail && (
                      <p className="text-sm text-emerald-600 mt-1">
                        เลือกแล้ว: {userMap[topupSelectedEmail.toLowerCase()] || '-'} ({topupSelectedEmail})
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">จำนวนเครดิต (บาท) *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">หมายเหตุ (ถ้ามี)</label>
                    <input
                      type="text"
                      value={topupNote}
                      onChange={(e) => setTopupNote(e.target.value)}
                      placeholder="เช่น เติมเครดิตตามคำขอ"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">แนบสลิป (ถ้ามี)</label>
                    <input
                      key={topupSlipFile ? `slip-${topupSlipFile.name}` : 'slip-empty'}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setTopupSlipFile(e.target.files?.[0] || null)}
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium"
                    />
                    {topupSlipFile && (
                      <p className="text-sm text-emerald-600 mt-1">
                        เลือกแล้ว: {topupSlipFile.name}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!topupSelectedEmail || !topupAmount || Number(topupAmount) <= 0 || topupSubmitting}
                    onClick={async () => {
                      const amount = Number(topupAmount)
                      if (!topupSelectedEmail || amount <= 0) return
                      const confirm = await Swal.fire({
                        icon: 'question',
                        title: 'ยืนยันการเติมเครดิต',
                        html: `
                          <div class="text-left">
                            <p><strong>ผู้ใช้:</strong> ${userMap[topupSelectedEmail.toLowerCase()] || '-'} (${topupSelectedEmail})</p>
                            <p><strong>จำนวน:</strong> ฿${amount.toLocaleString()}</p>
                          </div>
                        `,
                        showCancelButton: true,
                        confirmButtonText: 'เติมเครดิต',
                        cancelButtonText: 'ยกเลิก',
                        confirmButtonColor: '#16a34a'
                      })
                      if (!confirm.isConfirmed) return
                      setTopupSubmitting(true)
                      try {
                        await creditService.addCreditByAdmin(topupSelectedEmail, amount, user?.email || '', topupNote || null, topupSlipFile || undefined)
                        Swal.fire({
                          icon: 'success',
                          title: 'เติมเครดิตสำเร็จ',
                          text: `เพิ่ม ฿${amount.toLocaleString()} ให้ ${userMap[topupSelectedEmail.toLowerCase()] || topupSelectedEmail} แล้ว`
                        })
                        setTopupAmount('')
                        setTopupNote('')
                        setTopupSlipFile(null)
                        setTopupUserSearch('')
                        setTopupSelectedEmail('')
                      } catch (err) {
                        Swal.fire({
                          icon: 'error',
                          title: 'เติมเครดิตไม่สำเร็จ',
                          text: err.message || 'เกิดข้อผิดพลาด'
                        })
                      } finally {
                        setTopupSubmitting(false)
                      }
                    }}
                    className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {topupSubmitting ? 'กำลังเติมเครดิต...' : 'เติมเครดิตให้ผู้ใช้'}
                  </button>
                </div>
              </div>
            ) : activeTab === 'history' ? (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="flex gap-4 flex-wrap">
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
                {loadingHistory ? (
                  <LoadingSpinner />
                ) : allHistory.length === 0 ? (
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
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้ใช้</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ประเภท</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จำนวนเงิน</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">รายละเอียด</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {allHistory.map((item, index) => (
                            <tr key={`${item.type}-${item.id}-${index}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">{formatDate(item.date)}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-900">
                                    {userMap[(item.userEmail || '').toLowerCase()] || '-'}
                                  </span>
                                  <span className="text-xs text-gray-500">{item.userEmail}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${getTypeColor(item.type)}`}>
                                  {getTypeLabel(item.type)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`font-bold text-lg ${item.type === 'topup' || item.type === 'refund' ? 'text-green-600' : 'text-red-600'}`}>
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
                                {(item.type === 'usage' || item.type === 'refund') && (
                                  <div>ออเดอร์: {item.orderId || item.order_id || '-'}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {item.type === 'topup' ? (
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(item.status)}`}>
                                    {getStatusText(item.status)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหาตามอีเมลหรือชื่อผู้ใช้</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="กรอกอีเมลหรือชื่อผู้ใช้..."
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {['all', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg font-bold transition ${
                    statusFilter === status
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {status === 'all' ? 'ทั้งหมด' : 
                   status === 'pending' ? 'รออนุมัติ' :
                   status === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}
                </button>
              ))}
            </div>

            {/* Transactions Table */}
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Icon icon="fa-wallet" className="text-5xl mb-4 opacity-50" />
                <p>ไม่พบรายการ</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Transaction ID</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้ใช้</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จำนวนเงิน</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วิธีการชำระ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้อนุมัติ/ผู้ดำเนินการ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTransactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900 text-sm">
                              {transaction.transactionid}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-900">
                                {userMap[(transaction.useremail || transaction.UserEmail || '').toLowerCase()] || '-'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {transaction.useremail || transaction.UserEmail}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-emerald-600">
                              ฿{Number(transaction.amount).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {transaction.paymentmethod === 'transfer' ? 'โอนเงิน' : 'เงินสด'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(transaction.status)}`}>
                              {getStatusText(transaction.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {(transaction.status === 'approved' || transaction.status === 'rejected') && (transaction.adminemail || transaction.AdminEmail) ? (
                                <>
                                  <span className="font-medium text-gray-900">
                                    {userMap[(transaction.adminemail || transaction.AdminEmail || '').toLowerCase()] || '-'}
                                  </span>
                                  <span className="block text-xs text-gray-500">
                                    {transaction.adminemail || transaction.AdminEmail}
                                  </span>
                                </>
                              ) : (
                                '-'
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {formatDate(transaction.createdat)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              {transaction.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(transaction)}
                                    className="px-3 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 transition"
                                  >
                                    อนุมัติ
                                  </button>
                                  <button
                                    onClick={() => handleReject(transaction)}
                                    className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition"
                                  >
                                    ปฏิเสธ
                                  </button>
                                </>
                              )}
                              {transaction.slipurl && (
                                <button
                                  onClick={() => window.open(transaction.slipurl, '_blank')}
                                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <Icon icon="fa-image" />
                                  ดูสลิป
                                </button>
                              )}
                              {transaction.note && (
                                <button
                                  onClick={() => {
                                    Swal.fire({
                                      title: 'หมายเหตุ',
                                      text: transaction.note,
                                      confirmButtonText: 'ปิด'
                                    })
                                  }}
                                  className="text-xs text-gray-600 hover:text-gray-700 flex items-center gap-1"
                                >
                                  <Icon icon="fa-sticky-note" />
                                  หมายเหตุ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
