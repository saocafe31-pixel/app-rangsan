import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { franchiseStockService } from '../services/franchiseStockService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Swal from 'sweetalert2'
import { formatThaiDateTimeBangkok } from '../utils/dateDisplay'

export default function AdminFranchiseStock({ user }) {
  const { userEmail } = useParams()
  const navigate = useNavigate()
  const [franchiseInfo, setFranchiseInfo] = useState(null)
  const [stockItems, setStockItems] = useState([])
  const [stockLogs, setStockLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('stock') // 'stock', 'lowStock', 'logs'
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (user?.role === 'admin' && userEmail) {
      fetchFranchiseInfo()
      fetchStock()
      fetchStockLogs()
    }
  }, [user, userEmail, activeTab])

  const fetchFranchiseInfo = async () => {
    try {
      const decodedEmail = decodeURIComponent(userEmail)
      const { data, error } = await supabase
        .from('users')
        .select('Email, Username, BranchId, UserType')
        .eq('Email', decodedEmail)
        .eq('UserType', 'franchise')
        .maybeSingle()

      if (error) throw error
      if (!data) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูล',
          text: 'ไม่พบข้อมูลลูกค้าแฟรนไชส์',
          confirmButtonText: 'ตกลง'
        }).then(() => navigate('/admin/franchise-list'))
        return
      }

      setFranchiseInfo(data)
    } catch (error) {
      console.error('Error fetching franchise info:', error)
    }
  }

  const fetchStock = async () => {
    try {
      setLoading(true)
      const decodedEmail = decodeURIComponent(userEmail)
      
      // Get branch ID from user
      const branchId = await franchiseStockService.getBranchId(decodedEmail, null)
      if (!branchId) {
        console.error('Branch ID not found')
        return
      }

      // Get franchise stock
      const stock = await franchiseStockService.getFranchiseStock(branchId)
      console.log('[AdminFranchiseStock] Fetched stock:', stock)
      setStockItems(stock || [])
    } catch (error) {
      console.error('Error fetching stock:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStockLogs = async () => {
    try {
      const decodedEmail = decodeURIComponent(userEmail)
      const branchId = await franchiseStockService.getBranchId(decodedEmail, null)
      if (!branchId) return

      const result = await franchiseStockService.getStockLogs(branchId)
      setStockLogs(result?.data || [])
    } catch (error) {
      console.error('Error fetching stock logs:', error)
    }
  }

  const formatDate = (dateStr) => {
    const out = formatThaiDateTimeBangkok(dateStr)
    return out === '-' && dateStr ? String(dateStr) : out
  }

  const lowStockItems = stockItems.filter(item => {
    const currentStock = Number(item.stock || item.Stock || 0)
    const minStock = Number(item.minstock || item.MinStock || item.min_stock || 0)
    return currentStock <= minStock && minStock > 0
  })

  const filteredItems = (activeTab === 'lowStock' ? lowStockItems : stockItems).filter(item => {
    if (!searchTerm.trim()) return true
    const search = searchTerm.toLowerCase()
    const productName = (item.productname || item.ProductName || item.productName || '').toLowerCase()
    return productName.includes(search)
  })

  const filteredLogs = stockLogs.filter(log => {
    if (!searchTerm.trim()) return true
    const search = searchTerm.toLowerCase()
    const productName = (log.productname || log.ProductName || log.productName || '').toLowerCase()
    return productName.includes(search)
  })

  if (loading) {
    return <LoadingSpinner />
  }

  if (!franchiseInfo) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <button
                  onClick={() => navigate('/admin/franchise-list')}
                  className="mb-2 text-gray-600 hover:text-gray-900 flex items-center gap-2"
                >
                  <Icon icon="fa-arrow-left" />
                  <span>กลับไปรายชื่อแฟรนไชส์</span>
                </button>
                <h1 className="text-2xl font-bold text-gray-900">
                  สต๊อกสาขา: {franchiseInfo.Username || franchiseInfo.email} ({franchiseInfo.BranchId || '-'})
                </h1>
              </div>
              <button
                onClick={() => {
                  fetchStock()
                  fetchStockLogs()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
              >
                <Icon icon="fa-sync-alt" className="text-gray-700" />
                <span className="text-gray-700">รีเฟรช</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveTab('stock')}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  activeTab === 'stock'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                สต๊อกทั้งหมด
              </button>
              <button
                onClick={() => setActiveTab('lowStock')}
                className={`px-4 py-2 rounded-lg font-bold transition relative ${
                  activeTab === 'lowStock'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                แจ้งเตือนสต็อกต่ำ
                {lowStockItems.length > 0 && (
                  <span className="ml-2 bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {lowStockItems.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  activeTab === 'logs'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                ประวัติเข้าออกสต็อก
              </button>
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหาสินค้า</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาตามชื่อสินค้า..."
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Content */}
            {activeTab === 'logs' ? (
              /* Stock Logs */
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สินค้า</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ประเภท</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จำนวน</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สต๊อกหลัง</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
                            ไม่พบประวัติการเข้าออกสต็อก
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log, index) => {
                          // Determine type: check log.type first, then check note for "นำเข้าจากออเดอร์"
                          let logType = (log.type || log.Type || '').toLowerCase()
                          const note = (log.note || log.Note || '').toLowerCase()
                          
                          // If note contains "นำเข้าจากออเดอร์" or "from_order", it's IN
                          if (note.includes('นำเข้าจากออเดอร์') || note.includes('from_order') || logType === 'from_order') {
                            logType = 'in'
                          }
                          
                          // Also check for other IN types
                          if (logType === 'from_po' || logType === 'from_order' || logType === 'add') {
                            logType = 'in'
                          }
                          
                          const isIn = logType === 'in'
                          const quantity = Number(log.quantity || log.Quantity || 0)
                          
                          return (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {formatDate(log.timestamp || log.Timestamp || log.createdat || log.CreatedAt)}
                              </td>
                              <td className="px-4 py-3 font-bold text-gray-900">
                                {log.productname || log.ProductName || log.productName || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  isIn
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {isIn ? 'รับเข้า' : 'เบิกออก'}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-sm font-bold ${
                                isIn ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {isIn ? '+' : '-'}
                                {Math.abs(quantity).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {Number(log.stockafter || log.StockAfter || log.balance || log.Balance || 0).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {log.note || log.Note || '-'}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Stock Items */
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สินค้า</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สต๊อกปัจจุบัน</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สต๊อกขั้นต่ำ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-4 py-8 text-center text-gray-400">
                            {activeTab === 'lowStock' ? 'ไม่พบสินค้าที่ใกล้หมด' : 'ไม่พบข้อมูลสต๊อก'}
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          // Try multiple column name variations
                          const currentStock = Number(item.stock || item.Stock || 0)
                          const minStock = Number(item.minstock || item.MinStock || item.min_stock || 0)
                          const productName = item.productname || item.ProductName || item.productName || '-'
                          const productId = item.productid || item.ProductID || item.productId || index
                          const isLowStock = currentStock <= minStock && minStock > 0

                          return (
                            <tr key={productId} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-bold text-gray-900">
                                {productName}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {currentStock.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {minStock > 0 ? minStock.toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3">
                                {isLowStock ? (
                                  <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-bold">
                                    ใกล้หมด
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">
                                    ปกติ
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
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
