import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Swal from 'sweetalert2'

function parseOrderIdFromStockNote(note) {
  const s = String(note || '')
  let m = s.match(/ออเดอร์[:\s]*([A-Za-z0-9\-]+)/i)
  if (m) return m[1]
  m = s.match(/\b(ORD[A-Za-z0-9\-]+)/i)
  if (m) return m[1]
  return ''
}

function isBundleRelatedNote(note) {
  return /ชุดสินค้า|ขาย\/ชุด|BUNDLE_IDS|ชุด\s*\(/i.test(String(note || ''))
}

export default function StockLogs({ user }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [groupMode, setGroupMode] = useState('flat')
  const itemsPerPage = 50

  const groupedByOrder = useMemo(() => {
    const map = new Map()
    ;(logs || []).forEach((log) => {
      const oid = parseOrderIdFromStockNote(log.note || log.Note || '') || 'อื่น ๆ / ไม่พบเลขออเดอร์'
      if (!map.has(oid)) map.set(oid, [])
      map.get(oid).push(log)
    })
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'th'))
  }, [logs])

  const groupedByOrderBundle = useMemo(() => {
    const map = new Map()
    ;(logs || []).forEach((log) => {
      const note = log.note || log.Note || ''
      if (!isBundleRelatedNote(note)) return
      const oid = parseOrderIdFromStockNote(note) || 'อื่น ๆ'
      const key = oid
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(log)
    })
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'th'))
  }, [logs])

  useEffect(() => {
    fetchLogs()
  }, [currentPage, typeFilter, searchTerm])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('stock_logs')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })

      // Apply type filter
      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter)
      }

      // Apply search filter
      if (searchTerm.trim()) {
        query = query.or(`productid.ilike.%${searchTerm}%,productname.ilike.%${searchTerm}%,note.ilike.%${searchTerm}%`)
      }

      // Pagination
      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching stock logs:', error)
        throw error
      }

      setLogs(data || [])
      const total = count || 0
      setTotalCount(total)
      setTotalPages(Math.ceil(total / itemsPerPage))
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

  const getTypeLabel = (type, note = '') => {
    const typeMap = {
      'IN': { label: 'รับเข้า', color: 'bg-green-100 text-green-800' },
      'OUT': { label: 'เบิกออก', color: 'bg-red-100 text-red-800' },
      'ADD': { label: 'เพิ่มใหม่', color: 'bg-blue-100 text-blue-800' },
      'EDIT': { label: 'แก้ไข', color: 'bg-yellow-100 text-yellow-800' },
      'ADJUST': { label: 'ปรับปรุง', color: 'bg-purple-100 text-purple-800' },
      'SALE': { label: 'ขาย', color: 'bg-red-100 text-red-800' }
    }
    
    // ถ้า type เป็น 'IN' ให้แสดงเป็น "รับเข้า" เสมอ (ไม่ว่าจะมีคำว่า "ออเดอร์" ใน note หรือไม่)
    if (type === 'IN' || type === 'in') {
      return typeMap['IN']
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
    // For OUT type, always show negative (even if quantity is stored as positive)
    // For other types, show positive
    const isOut = type === 'OUT' || type === 'out'
    const sign = isOut ? '-' : '+'
    const color = isOut ? 'text-red-600' : 'text-green-600'
    const displayQuantity = isOut ? Math.abs(quantity) : Math.abs(quantity)
    return (
      <span className={`font-bold ${color}`}>
        {sign}{displayQuantity.toLocaleString()}
      </span>
    )
  }

  const handleRefresh = () => {
    setSearchTerm('')
    setTypeFilter('all')
    setGroupMode('flat')
    setCurrentPage(1)
    fetchLogs()
  }

  const renderLogRow = (log) => {
    const logType = (log.type || '').toUpperCase()
    const note = (log.note || log.Note || '').toLowerCase()
    const isReturn = note.includes('คืนสินค้า') || note.includes('ยกเลิก') || note.includes('return') || note.includes('cancel')
    const isSale = !isReturn && (note.includes('ขาย') || note.includes('สั่งซื้อ') || note.includes('order'))
    let typeInfo
    if (isReturn && (logType === 'IN' || logType === 'in')) {
      typeInfo = getTypeLabel('IN', note)
    } else if (isSale && (logType === 'OUT' || logType === 'out')) {
      typeInfo = getTypeLabel('SALE', note)
    } else {
      typeInfo = getTypeLabel(logType, note)
    }
    const isOut = (logType === 'OUT' || logType === 'SALE' || isSale) && !isReturn
    const displayQuantity = isOut ? -Math.abs(log.quantity || 0) : Math.abs(log.quantity || 0)
    return (
      <tr key={log.id} className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
          {formatDate(log.timestamp || log.createdat || log.Timestamp || log.CreatedAt)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {log.productid || log.ProductID || '-'}
        </td>
        <td className="px-6 py-4 text-sm text-gray-900">{log.productname || log.ProductName || '-'}</td>
        <td className="px-6 py-4 whitespace-nowrap text-center">
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${typeInfo.color}`}>{typeInfo.label}</span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
          {formatQuantity(displayQuantity, isOut ? 'OUT' : logType)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
          {(log.balance || log.Balance || 0).toLocaleString()}
        </td>
        <td className="px-6 py-4 text-sm text-gray-600">{log.note || log.Note || '-'}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {log.useremail || log.UserEmail || log.user || '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {log.poid || log.POID || log.orderid || log.OrderID ? (
            <span className="text-blue-600 font-medium">
              {log.poid || log.POID || log.orderid || log.OrderID}
            </span>
          ) : (
            '-'
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <Sidebar user={user} />
      
      <main className="ml-0 md:ml-64 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ประวัติเข้าออกสต็อก</h1>
            <p className="text-gray-600">ดูประวัติการเคลื่อนไหวสต็อกทั้งหมด</p>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6 sticky top-16 z-40 border-b border-gray-200">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Type Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">ประเภท:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="IN">รับเข้า</option>
                  <option value="OUT">เบิกออก</option>
                  <option value="ADD">เพิ่มใหม่</option>
                  <option value="EDIT">แก้ไข</option>
                  <option value="ADJUST">ปรับปรุง</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">จัดกลุ่ม:</label>
                <select
                  value={groupMode}
                  onChange={(e) => setGroupMode(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="flat">รายการเดียว</option>
                  <option value="byOrder">ตามเลขออเดอร์ (จากหมายเหตุ)</option>
                  <option value="byOrderBundle">เฉพาะ movement ชุด + ตามออเดอร์</option>
                </select>
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2 font-medium"
              >
                <Icon icon="fa-sync-alt" />
                Refresh
              </button>
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
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">PO ID</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupMode === 'flat' && logs.map((log) => renderLogRow(log))}
                      {groupMode === 'byOrder' &&
                        groupedByOrder.map(([orderKey, rows]) => (
                          <Fragment key={orderKey}>
                            <tr className="bg-slate-100">
                              <td colSpan={9} className="px-6 py-2 text-xs font-bold text-slate-800">
                                ออเดอร์: {orderKey} ({rows.length} รายการ)
                              </td>
                            </tr>
                            {rows.map((log) => renderLogRow(log))}
                          </Fragment>
                        ))}
                      {groupMode === 'byOrderBundle' &&
                        (groupedByOrderBundle.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-6 py-6 text-center text-gray-500 text-sm">
                              ไม่มีรายการที่ระบุหมายเหตุเกี่ยวกับชุดในหน้านี้ — ลองเปลี่ยนตัวกรองหรือโหมดจัดกลุ่ม
                            </td>
                          </tr>
                        ) : (
                          groupedByOrderBundle.map(([orderKey, rows]) => (
                            <Fragment key={`b-${orderKey}`}>
                              <tr className="bg-amber-50">
                                <td colSpan={9} className="px-6 py-2 text-xs font-bold text-amber-900">
                                  ชุด / ออเดอร์: {orderKey} ({rows.length} รายการ)
                                </td>
                              </tr>
                              {rows.map((log) => renderLogRow(log))}
                            </Fragment>
                          ))
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
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
                      หน้า {currentPage} จาก {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
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
