import { useState, useEffect } from 'react'
import { franchiseStockService } from '../services/franchiseStockService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Swal from 'sweetalert2'

export default function FranchiseStockDashboard({ user }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [branchId, setBranchId] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllDates, setShowAllDates] = useState(false)

  useEffect(() => {
    initializeBranch()
  }, [user])

  useEffect(() => {
    if (branchId) {
      fetchStats()
    }
  }, [branchId, startDate, endDate, showAllDates])

  const initializeBranch = async () => {
    try {
      // Try to get from user object first, then from database
      const id = await franchiseStockService.getBranchId(user.email, user)
      console.log('[FranchiseStockDashboard] Branch ID result:', id, 'User object:', user)
      if (!id) {
        console.error('[FranchiseStockDashboard] Branch ID not found for user:', user.email)
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบ Branch ID',
          text: `กรุณาติดต่อผู้ดูแลระบบ\nอีเมล: ${user.email}\n\nหมายเหตุ: ตรวจสอบว่าในตาราง users มี BranchId สำหรับอีเมลนี้`
        })
        return
      }
      setBranchId(id)
    } catch (error) {
      console.error('[FranchiseStockDashboard] Error getting branch ID:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถดึง Branch ID ได้: ${error.message || error}`
      })
    }
  }

  const fetchStats = async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const rangeOpts = showAllDates
        ? { showAllDates: true }
        : { startDate, endDate, showAllDates: false }
      const data = await franchiseStockService.getDashboardStats(branchId, rangeOpts)
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลได้'
      })
    } finally {
      setLoading(false)
    }
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
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">แดชบอร์ดสต็อกแฟรนไชส์</h1>
            <p className="text-gray-600">สรุปมูลค่าการเบิกออกและมูลค่าคงเหลือสต็อก</p>
          </div>

          {/* ช่วงวันที่ (เหมือนหน้าประวัติการใช้เครดิต) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <p className="text-sm text-gray-600 mb-4">
              เลือกช่วงวันที่เพื่อสรุป<strong className="text-gray-800"> มูลค่า/จำนวนที่เบิกออก</strong> — มูลค่าคงเหลือสต็อกเป็นยอดปัจจุบันเสมอ
            </p>
            <div className="flex gap-4 flex-wrap">
              <div className="min-w-[200px]">
                <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setShowAllDates(false)
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
                }}
                onEndChange={(v) => {
                  setEndDate(v)
                  setShowAllDates(false)
                }}
                showAllDates={showAllDates}
                onShowAllDatesChange={setShowAllDates}
                extraButtons={
                  (startDate || endDate || showAllDates) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate('')
                        setEndDate('')
                        setShowAllDates(false)
                      }}
                      className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold text-gray-700 transition"
                    >
                      ล้างตัวกรอง
                    </button>
                  )
                }
              />
            </div>
          </div>

          {/* Stats Cards */}
          {loading ? (
            <LoadingSpinner />
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Out Value */}
              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">มูลค่าที่เบิกออก</h3>
                  <Icon icon="fa-arrow-up" className="text-red-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  ฿{stats.totalOutValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  จำนวน: {stats.totalOutQuantity.toLocaleString()} ชิ้น
                </p>
              </div>

              {/* Total Stock Value */}
              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">มูลค่าคงเหลือสต็อก</h3>
                  <Icon icon="fa-box" className="text-green-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  ฿{stats.totalStockValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  จำนวน: {stats.totalStockQuantity.toLocaleString()} ชิ้น
                </p>
              </div>

              {/* Total Out Quantity */}
              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange-500">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">จำนวนที่เบิกออก</h3>
                  <Icon icon="fa-shopping-cart" className="text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalOutQuantity.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">ชิ้น</p>
              </div>

              {/* Total Stock Quantity */}
              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">จำนวนคงเหลือ</h3>
                  <Icon icon="fa-warehouse" className="text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalStockQuantity.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">ชิ้น</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Icon icon="fa-chart-line" className="text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">ไม่พบข้อมูล</p>
            </div>
          )}

          {/* Date Info */}
          {stats && (
            <div className="mt-6 bg-white rounded-lg shadow-sm p-4 border border-gray-100">
              <p className="text-sm text-gray-600">
                การเบิกออกนับตามช่วง:{' '}
                <span className="font-bold text-gray-900">
                  {showAllDates
                    ? 'ทั้งหมด (ไม่จำกัดวันที่)'
                    : !startDate && !endDate
                      ? 'ทั้งหมด (ไม่จำกัดวันที่)'
                      : [
                          startDate &&
                            `ตั้งแต่ ${new Date(startDate + 'T12:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                          endDate &&
                            `ถึง ${new Date(endDate + 'T12:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
                        ]
                          .filter(Boolean)
                          .join(' ') || 'ทั้งหมด'}
                </span>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
