import { useState, useEffect } from 'react'
import { franchiseStockService } from '../services/franchiseStockService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Swal from 'sweetalert2'

export default function FranchiseStockHistory({ user }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [branchId, setBranchId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllDates, setShowAllDates] = useState(false)
  const itemsPerPage = 50

  useEffect(() => {
    initializeBranch()
  }, [user])

  useEffect(() => {
    if (branchId) {
      fetchLogs()
    }
  }, [branchId, currentPage, typeFilter, searchTerm, startDate, endDate, showAllDates])

  const initializeBranch = async () => {
    try {
      // Try to get from user object first, then from database
      const id = await franchiseStockService.getBranchId(user.email, user)
      console.log('[FranchiseStockHistory] Branch ID result:', id, 'User object:', user)
      if (!id) {
        console.error('[FranchiseStockHistory] Branch ID not found for user:', user.email)
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบ Branch ID',
          text: `กรุณาติดต่อผู้ดูแลระบบ\nอีเมล: ${user.email}\n\nหมายเหตุ: ตรวจสอบว่าในตาราง users มี BranchId สำหรับอีเมลนี้`
        })
        return
      }
      setBranchId(id)
    } catch (error) {
      console.error('[FranchiseStockHistory] Error getting branch ID:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถดึง Branch ID ได้: ${error.message || error}`
      })
    }
  }

  const fetchLogs = async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const filters = {
        type: typeFilter,
        search: searchTerm,
        page: currentPage,
        itemsPerPage
      }
      if (!showAllDates && (startDate || endDate)) {
        if (startDate) {
          filters.startDate = new Date(startDate + 'T00:00:00').toISOString()
        }
        if (endDate) {
          filters.endDate = new Date(endDate + 'T23:59:59.999').toISOString()
        }
      }
      const result = await franchiseStockService.getStockLogs(branchId, filters)
      setLogs(result.data)
      setTotalCount(result.count)
    } catch (error) {
      console.error('Error fetching stock logs:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลประวัติสต็อกได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const getTypeLabel = (type) => {
    const typeMap = {
      'IN': { label: 'รับเข้า', color: 'bg-green-100 text-green-800' },
      'OUT': { label: 'เบิกออก', color: 'bg-red-100 text-red-800' },
      'ADJUST': { label: 'ปรับปรุง', color: 'bg-purple-100 text-purple-800' },
      'FROM_ORDER': { label: 'จากออเดอร์', color: 'bg-blue-100 text-blue-800' },
      'FROM_PO': { label: 'จาก PO', color: 'bg-yellow-100 text-yellow-800' }
    }
    return typeMap[type] || { label: type, color: 'bg-gray-100 text-gray-800' }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatQuantity = (quantity, type) => {
    const sign = type === 'OUT' ? '-' : '+'
    const color = type === 'OUT' ? 'text-red-600' : 'text-green-600'
    return (
      <span className={`font-bold ${color}`}>
        {sign}{Math.abs(quantity).toLocaleString()}
      </span>
    )
  }

  const handleRefresh = () => {
    setSearchTerm('')
    setTypeFilter('all')
    setStartDate('')
    setEndDate('')
    setShowAllDates(false)
    setCurrentPage(1)
    fetchLogs()
  }

  if (!branchId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} />
        <Sidebar user={user} />
        <main className="ml-0 md:ml-64 pt-16 pb-20">
          <LoadingSpinner />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <Sidebar user={user} />
      
      <main className="ml-0 md:ml-64 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ประวัติเข้าออกสต็อกแฟรนไชส์</h1>
          <p className="text-gray-600 mb-6">ดูประวัติการเคลื่อนไหวสต็อกของสาขา</p>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6 sticky top-16 z-40 border border-gray-200">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1">
                <div className="relative">
                  <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาตามรหัสสินค้า, ชื่อสินค้า, หรือหมายเหตุ..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1)
                    }}
                    className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">ประเภท:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="IN">รับเข้า</option>
                  <option value="OUT">เบิกออก</option>
                  <option value="ADJUST">ปรับปรุง</option>
                  <option value="FROM_ORDER">จากออเดอร์</option>
                  <option value="FROM_PO">จาก PO</option>
                </select>
              </div>

              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2 font-medium self-start md:self-center"
              >
                <Icon icon="fa-sync-alt" />
                Refresh
              </button>
            </div>

            <div className="flex gap-4 flex-wrap pt-2 border-t border-gray-100">
              <div className="min-w-[200px]">
                <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setShowAllDates(false)
                    setCurrentPage(1)
                  }}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="min-w-[200px]">
                <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สิ้นสุด</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setShowAllDates(false)
                    setCurrentPage(1)
                  }}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <DateRangeFilter
                layout="buttonsOnly"
                labelInline
                start={startDate}
                end={endDate}
                onStartChange={(v) => {
                  setStartDate(v)
                  setShowAllDates(false)
                  setCurrentPage(1)
                }}
                onEndChange={(v) => {
                  setEndDate(v)
                  setShowAllDates(false)
                  setCurrentPage(1)
                }}
                showAllDates={showAllDates}
                onShowAllDatesChange={(v) => {
                  setShowAllDates(v)
                  setCurrentPage(1)
                }}
                extraButtons={
                  (startDate || endDate || showAllDates) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate('')
                        setEndDate('')
                        setShowAllDates(false)
                        setCurrentPage(1)
                      }}
                      className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold text-gray-700 transition"
                    >
                      ล้างตัวกรองวันที่
                    </button>
                  )
                }
              />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <LoadingSpinner />
          ) : logs.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Icon icon="fa-inbox" className="text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">ไม่พบข้อมูลประวัติสต็อก</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">วันที่/เวลา</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">รหัสสินค้า</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ชื่อสินค้า</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">ประเภท</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">จำนวน</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">ยอดคงเหลือ</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">หมายเหตุ</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ผู้ทำรายการ</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ออเดอร์/PO</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logs.map((log) => {
                        const typeInfo = getTypeLabel(log.type)
                        return (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(log.timestamp || log.createdat)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {log.productid}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {log.productname}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              {formatQuantity(log.quantity, log.type)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                              {log.balance?.toLocaleString() || '0'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {log.note || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {log.useremail || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {log.orderid ? (
                                <span className="text-blue-600 font-medium">{log.orderid}</span>
                              ) : log.poid ? (
                                <span className="text-yellow-600 font-medium">{log.poid}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {Math.ceil(totalCount / itemsPerPage) > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    แสดง {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} จาก {totalCount.toLocaleString()} รายการ
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon icon="fa-chevron-left" />
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-700">
                      หน้า {currentPage} จาก {Math.ceil(totalCount / itemsPerPage)}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / itemsPerPage), prev + 1))}
                      disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon icon="fa-chevron-right" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
