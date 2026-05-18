import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { orderService } from '../services/orderService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useNavigate } from 'react-router-dom'
import { formatThaiDateTimeBangkok } from '../utils/dateDisplay'

export default function AdminFranchiseList({ user }) {
  const navigate = useNavigate()
  const [franchiseUsers, setFranchiseUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchFranchiseUsers()
    }
  }, [user])

  const fetchFranchiseUsers = async () => {
    try {
      setLoading(true)
      
      // Get all franchise users
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('Email, Username, BranchId, UserType, RegisteredDate')
        .eq('UserType', 'franchise')
        .order('Email', { ascending: true })

      if (usersError) throw usersError

      // Get approval dates from user_approvals
      const { data: approvals, error: approvalsError } = await supabase
        .from('user_approvals')
        .select('useremail, reviewedat, createdat, status')
        .eq('status', 'approved')
        .eq('requested_usertype', 'franchise')

      if (approvalsError) {
        console.error('Error fetching approvals:', approvalsError)
      }

      // Get all orders to calculate totals
      const allOrders = await orderService.getAllOrders()

      // Combine data
      const franchiseData = await Promise.all(
        (users || []).map(async (u) => {
          const email = u.Email || u.email
          
          // Find approval date
          const approval = approvals?.find(a => 
            (a.useremail || a.UserEmail || '').toLowerCase() === email.toLowerCase()
          )
          const approvalDate = approval?.reviewedat || approval?.createdat || u.RegisteredDate

          // Calculate total order amount for this user
          const userOrders = allOrders.filter(o => {
            const orderEmail = o.UserEmail || o.User || o.useremail || ''
            return orderEmail.toLowerCase() === email.toLowerCase()
          })
          
          const totalOrderAmount = userOrders.reduce((sum, order) => {
            const total = parseFloat(order.Total || order.total || 0)
            return sum + total
          }, 0)

          // Calculate membership duration
          let membershipDuration = '-'
          if (approvalDate) {
            try {
              const approval = new Date(approvalDate)
              const now = new Date()
              const diffTime = Math.abs(now - approval)
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
              
              if (diffDays < 30) {
                membershipDuration = `${diffDays} วัน`
              } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30)
                const days = diffDays % 30
                membershipDuration = `${months} เดือน${days > 0 ? ` ${days} วัน` : ''}`
              } else {
                const years = Math.floor(diffDays / 365)
                const months = Math.floor((diffDays % 365) / 30)
                membershipDuration = `${years} ปี${months > 0 ? ` ${months} เดือน` : ''}`
              }
            } catch (e) {
              console.error('Error calculating membership duration:', e)
            }
          }

          return {
            email: email,
            username: u.Username || u.username || '-',
            branchId: u.BranchId || u.branchId || '-',
            approvalDate: approvalDate,
            membershipDuration: membershipDuration,
            totalOrderAmount: totalOrderAmount,
            orderCount: userOrders.length
          }
        })
      )

      setFranchiseUsers(franchiseData)
    } catch (error) {
      console.error('Error fetching franchise users:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    const out = formatThaiDateTimeBangkok(dateStr)
    return out === '-' && dateStr ? String(dateStr) : out
  }

  const filteredUsers = franchiseUsers.filter(u => {
    if (!searchTerm.trim()) return true
    const search = searchTerm.toLowerCase()
    return (
      u.email.toLowerCase().includes(search) ||
      u.username.toLowerCase().includes(search) ||
      (u.branchId && u.branchId.toLowerCase().includes(search))
    )
  })

  if (loading) {
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
              <h1 className="text-2xl font-bold text-gray-900">รายชื่อลูกค้าแฟรนไชส์</h1>
              <button
                onClick={fetchFranchiseUsers}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
              >
                <Icon icon="fa-sync-alt" className="text-gray-700" />
                <span className="text-gray-700">รีเฟรช</span>
              </button>
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหา</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาตามอีเมล, ชื่อผู้ใช้, หรือ Branch ID..."
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Franchise Users Table */}
            {filteredUsers.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Icon icon="fa-store" className="text-5xl mb-4 opacity-50" />
                <p>ไม่พบข้อมูลลูกค้าแฟรนไชส์</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ชื่อผู้ใช้</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">อีเมล</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Branch ID</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่อนุมัติ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ระยะเวลา</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จำนวนออเดอร์</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ยอดสั่งซื้อรวม</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredUsers.map((franchise) => (
                        <tr key={franchise.email} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900">{franchise.username}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{franchise.email}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-bold">
                              {franchise.branchId}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(franchise.approvalDate)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {franchise.membershipDuration}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {franchise.orderCount} ออเดอร์
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-emerald-600">
                              ฿{franchise.totalOrderAmount.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => navigate(`/admin/franchise-stock/${encodeURIComponent(franchise.email)}`)}
                              className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1"
                            >
                              <Icon icon="fa-warehouse" />
                              ดูสต๊อก
                            </button>
                          </td>
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
