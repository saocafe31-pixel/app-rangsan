import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function AdminCoupons({ user }) {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [couponForm, setCouponForm] = useState({
    Code: '',
    Type: 'fixed', // 'fixed' or 'percentage'
    Value: 0,
    Status: 'active', // 'active' or 'inactive'
    MinPurchase: 0, // Minimum purchase amount
    MaxDiscount: 0, // Maximum discount amount (0 = no limit)
    UsageLimit: 0, // Usage limit per user (0 = unlimited)
    ValidFrom: '',
    ValidUntil: '',
    Description: ''
  })

  useEffect(() => {
    fetchCoupons()
  }, [])

  const fetchCoupons = async () => {
    try {
      setLoading(true)
      // First try with order by id (most tables have id)
      let { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('id', { ascending: false })

      // If that fails, try without order
      if (error && (error.message?.includes('column') || error.code === '42703')) {
        console.warn('Order by id failed, trying without order:', error.message)
        const result = await supabase
          .from('coupons')
          .select('*')
        
        data = result.data
        error = result.error
      }

      if (error) {
        console.error('Error fetching coupons:', error)
        throw error
      }

      // Sort manually by id if order didn't work
      if (data && data.length > 0) {
        data.sort((a, b) => (b.id || 0) - (a.id || 0))
      }

      setCoupons(data || [])
    } catch (error) {
      console.error('Error fetching coupons:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูลคูปองได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAddCoupon = () => {
    setEditingCoupon(null)
    setCouponForm({
      Code: '',
      Type: 'fixed',
      Value: 0,
      Status: 'active',
      MinPurchase: 0,
      MaxDiscount: 0,
      UsageLimit: 0,
      ValidFrom: '',
      ValidUntil: '',
      Description: ''
    })
    setShowModal(true)
  }

  const handleEditCoupon = (coupon) => {
    setEditingCoupon(coupon)
    setCouponForm({
      Code: coupon.Code || '',
      Type: coupon.Type || 'fixed',
      Value: coupon.Value || 0,
      Status: coupon.Status || 'active',
      MinPurchase: coupon.MinPurchase || 0,
      MaxDiscount: coupon.MaxDiscount || 0,
      UsageLimit: coupon.UsageLimit || 0,
      ValidFrom: coupon.ValidFrom ? coupon.ValidFrom.toString().split('T')[0] : '',
      ValidUntil: coupon.ValidUntil ? coupon.ValidUntil.toString().split('T')[0] : '',
      Description: coupon.Description || ''
    })
    setShowModal(true)
  }

  const handleSaveCoupon = async () => {
    // Validation
    if (!couponForm.Code || couponForm.Code.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกโค้ดคูปอง'
      })
      return
    }

    if (couponForm.Value <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกมูลค่าส่วนลดที่มากกว่า 0'
      })
      return
    }

    if (couponForm.Type === 'percentage' && couponForm.Value > 100) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: 'ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100%'
      })
      return
    }

    try {
      // Build coupon data with proper column names
      const couponData = {
        Code: couponForm.Code.toUpperCase().trim(),
        Type: couponForm.Type,
        Value: Number(couponForm.Value),
        Status: couponForm.Status,
        MinPurchase: Number(couponForm.MinPurchase) || 0,
        MaxDiscount: Number(couponForm.MaxDiscount) || 0,
        UsageLimit: Number(couponForm.UsageLimit) || 0,
        ValidFrom: couponForm.ValidFrom ? (couponForm.ValidFrom.includes('T') ? couponForm.ValidFrom : new Date(couponForm.ValidFrom).toISOString()) : null,
        ValidUntil: couponForm.ValidUntil ? (couponForm.ValidUntil.includes('T') ? couponForm.ValidUntil : new Date(couponForm.ValidUntil).toISOString()) : null,
        Description: couponForm.Description || ''
      }

      if (editingCoupon) {
        // Update existing coupon
        const { error } = await supabase
          .from('coupons')
          .update(couponData)
          .eq('id', editingCoupon.id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'อัปเดตคูปองเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })
      } else {
        // Check if code already exists
        const { data: existing } = await supabase
          .from('coupons')
          .select('id')
          .eq('Code', couponData.Code)
          .maybeSingle()

        if (existing) {
          Swal.fire({
            icon: 'warning',
            title: 'โค้ดซ้ำ',
            text: 'โค้ดคูปองนี้มีอยู่แล้ว'
          })
          return
        }

        // Insert new coupon
        const { error } = await supabase
          .from('coupons')
          .insert(couponData)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'เพิ่มคูปองเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })
      }

      setShowModal(false)
      fetchCoupons()
    } catch (error) {
      console.error('Error saving coupon:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกได้'
      })
    }
  }

  const handleDeleteCoupon = async (coupon) => {
    const couponCode = coupon.Code || 'คูปองนี้'
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `คุณต้องการลบคูปอง "${couponCode}" หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280'
    })

    if (result.isConfirmed) {
      try {
        // Get the ID
        const couponId = coupon.id
        
        if (!couponId) {
          throw new Error('ไม่พบ ID ของคูปองที่ต้องการลบ')
        }

        const { error } = await supabase
          .from('coupons')
          .delete()
          .eq('id', couponId)

        if (error) {
          console.error('Delete error details:', error)
          throw error
        }

        Swal.fire({
          icon: 'success',
          title: 'ลบสำเร็จ',
          text: 'ลบคูปองเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })

        fetchCoupons()
      } catch (error) {
        console.error('Error deleting coupon:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถลบได้',
          footer: error.hint ? `คำแนะนำ: ${error.hint}` : undefined
        })
      }
    }
  }

  const handleToggleStatus = async (coupon) => {
    try {
      const currentStatus = coupon.Status || 'active'
      const newStatus = currentStatus.toLowerCase() === 'active' ? 'inactive' : 'active'
      const { error } = await supabase
        .from('coupons')
        .update({ Status: newStatus })
        .eq('id', coupon.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสำเร็จ',
        text: `เปลี่ยนสถานะเป็น ${newStatus === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'} แล้ว`,
        timer: 1500,
        showConfirmButton: false
      })

      fetchCoupons()
    } catch (error) {
      console.error('Error toggling coupon status:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตได้'
      })
    }
  }

  const filteredCoupons = coupons.filter(coupon => {
    const code = coupon.Code || ''
    const description = coupon.Description || ''
    const status = coupon.Status || ''
    
    const matchesSearch = !searchTerm || 
      code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      description.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || status.toLowerCase() === statusFilter.toLowerCase()

    return matchesSearch && matchesStatus
  })

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch (e) {
      return '-'
    }
  }

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
              <h1 className="text-2xl font-bold text-gray-900">จัดการคูปอง/โค้ดส่วนลด</h1>
              <button
                onClick={handleAddCoupon}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition flex items-center gap-2"
              >
                <Icon icon="fa-plus" />
                เพิ่มคูปองใหม่
              </button>
            </div>

            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="ค้นหาตามโค้ดหรือรายละเอียด..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">สถานะ:</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Coupons Table */}
            {filteredCoupons.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Icon icon="fa-inbox" className="text-6xl text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">ไม่พบข้อมูลคูปอง</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">โค้ด</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">ประเภท</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">มูลค่า</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">เงื่อนไข</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">จำนวนการใช้งาน</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่เริ่มต้น</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่สิ้นสุด</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCoupons.map((coupon) => {
                        const code = coupon.Code || ''
                        const type = coupon.Type || 'fixed'
                        const value = coupon.Value || 0
                        const status = coupon.Status || ''
                        const description = coupon.Description || ''
                        const minPurchase = coupon.MinPurchase || 0
                        const maxDiscount = coupon.MaxDiscount || 0
                        const usageLimit = coupon.UsageLimit || 0
                        const usageCount = coupon.UsageCount || 0
                        const validFrom = coupon.ValidFrom
                        const validUntil = coupon.ValidUntil
                        
                        return (
                          <tr key={coupon.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-gray-900">{code}</div>
                              {description && (
                                <div className="text-xs text-gray-500">{description}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {type === 'percentage' ? 'เปอร์เซ็นต์' : 'จำนวนเงิน'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {type === 'percentage' 
                                ? `${value}%` 
                                : `฿${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                              {maxDiscount > 0 && type === 'percentage' && (
                                <div className="text-xs text-gray-500">สูงสุด ฿{Number(maxDiscount).toLocaleString()}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <div className="space-y-1">
                                {minPurchase > 0 && (
                                  <div>ซื้อขั้นต่ำ: ฿{Number(minPurchase).toLocaleString()}</div>
                                )}
                                {usageLimit > 0 && (
                                  <div>ใช้ได้: {usageLimit} ครั้ง/คน</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-gray-900">
                                {usageCount.toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-500">ครั้ง</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(validFrom)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(validUntil)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => handleToggleStatus(coupon)}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  status.toLowerCase() === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {status.toLowerCase() === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleEditCoupon(coupon)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                                >
                                  <Icon icon="fa-edit" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCoupon(coupon)}
                                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
                                >
                                  <Icon icon="fa-trash" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coupon Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {editingCoupon ? 'แก้ไขคูปอง' : 'เพิ่มคูปองใหม่'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Icon icon="fa-times" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    โค้ดคูปอง *
                  </label>
                  <input
                    type="text"
                    value={couponForm.Code}
                    onChange={(e) => setCouponForm({ ...couponForm, Code: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="เช่น DISCOUNT10"
                    disabled={!!editingCoupon}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ประเภท *
                  </label>
                  <select
                    value={couponForm.Type}
                    onChange={(e) => setCouponForm({ ...couponForm, Type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="fixed">จำนวนเงิน (บาท)</option>
                    <option value="percentage">เปอร์เซ็นต์ (%)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    มูลค่าส่วนลด *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={couponForm.Type === 'percentage' ? '1' : '0.01'}
                    value={couponForm.Value || ''}
                    onChange={(e) => setCouponForm({ ...couponForm, Value: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder={couponForm.Type === 'percentage' ? '10' : '100'}
                  />
                  {couponForm.Type === 'percentage' && (
                    <p className="text-xs text-gray-500 mt-1">กรอกเป็นเปอร์เซ็นต์ (เช่น 10 = 10%)</p>
                  )}
                </div>

                {couponForm.Type === 'percentage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ส่วนลดสูงสุด (บาท) <span className="text-gray-500 text-xs">(0 = ไม่จำกัด)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={couponForm.MaxDiscount || ''}
                      onChange={(e) => setCouponForm({ ...couponForm, MaxDiscount: Number(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg p-2"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ซื้อขั้นต่ำ (บาท) <span className="text-gray-500 text-xs">(0 = ไม่จำกัด)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={couponForm.MinPurchase || ''}
                    onChange={(e) => setCouponForm({ ...couponForm, MinPurchase: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ใช้ได้ (ครั้ง/คน) <span className="text-gray-500 text-xs">(0 = ไม่จำกัด)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={couponForm.UsageLimit || ''}
                    onChange={(e) => setCouponForm({ ...couponForm, UsageLimit: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่เริ่มต้น
                  </label>
                  <input
                    type="date"
                    value={couponForm.ValidFrom}
                    onChange={(e) => setCouponForm({ ...couponForm, ValidFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่สิ้นสุด
                  </label>
                  <input
                    type="date"
                    value={couponForm.ValidUntil}
                    onChange={(e) => setCouponForm({ ...couponForm, ValidUntil: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  สถานะ
                </label>
                <select
                  value={couponForm.Status}
                  onChange={(e) => setCouponForm({ ...couponForm, Status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2"
                >
                  <option value="active">ใช้งาน</option>
                  <option value="inactive">ปิดใช้งาน</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียด
                </label>
                <textarea
                  value={couponForm.Description}
                  onChange={(e) => setCouponForm({ ...couponForm, Description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  rows="3"
                  placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveCoupon}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
