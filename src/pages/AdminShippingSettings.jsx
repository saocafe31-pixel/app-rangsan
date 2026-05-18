import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function AdminShippingSettings({ user }) {
  const [settings, setSettings] = useState({
    pickupEnabled: true,
    deliveryEnabled: true
  })
  const [shippingRates, setShippingRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showRateModal, setShowRateModal] = useState(false)
  const [editingRate, setEditingRate] = useState(null)
  const [rateForm, setRateForm] = useState({
    MinWeight: 0,
    MaxWeight: 0,
    Price: 0
  })

  useEffect(() => {
    fetchSettings()
    fetchShippingRates()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      // Get settings from a settings table or use default
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'shipping')
        .maybeSingle()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error fetching settings:', error)
      }

      if (data && data.value) {
        setSettings({
          pickupEnabled: data.value.pickupEnabled !== false,
          deliveryEnabled: data.value.deliveryEnabled !== false
        })
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchShippingRates = async () => {
    try {
      const { data, error } = await supabase
        .from('shipping_rates')
        .select('*')
        .order('MinWeight', { ascending: true })

      if (error) {
        console.error('Error fetching shipping rates:', error)
        throw error
      }

      const rows = (data || []).map((r) => ({
        id: r.id,
        MinWeight: r.MinWeight ?? r.minweight ?? 0,
        MaxWeight: r.MaxWeight ?? r.maxweight ?? 0,
        Price: r.Price ?? r.price ?? 0
      }))
      setShippingRates(rows)
    } catch (error) {
      console.error('Error fetching shipping rates:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลอัตราค่าจัดส่งได้'
      })
    }
  }

  const handleAddRate = () => {
    setEditingRate(null)
    setRateForm({ MinWeight: 0, MaxWeight: 0, Price: 0 })
    setShowRateModal(true)
  }

  const handleEditRate = (rate) => {
    if (!rate.id) {
      Swal.fire({
        icon: 'info',
        title: 'ต้องเพิ่มคอลัมน์ id ในตาราง shipping_rates',
        text: 'กรุณารัน SQL ใน DEPLOY.md หัวข้อ "ตาราง shipping_rates" (เพิ่มคอลัมน์ id) ใน Supabase → SQL Editor แล้วรีเฟรชหน้า'
      })
      return
    }
    setEditingRate(rate)
    setRateForm({
      MinWeight: rate.MinWeight || 0,
      MaxWeight: rate.MaxWeight || 0,
      Price: rate.Price || 0
    })
    setShowRateModal(true)
  }

  const handleSaveRate = async () => {
    if (!rateForm.MinWeight && rateForm.MinWeight !== 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกน้ำหนักขั้นต่ำ'
      })
      return
    }

    if (rateForm.MaxWeight <= rateForm.MinWeight && rateForm.MaxWeight !== 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: 'น้ำหนักสูงสุดต้องมากกว่าน้ำหนักขั้นต่ำ (หรือใส่ 0 สำหรับไม่มีขีดจำกัด)'
      })
      return
    }

    if (rateForm.Price <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกค่าจัดส่งที่มากกว่า 0'
      })
      return
    }

    try {
      if (editingRate) {
        // Update existing rate
        const { error } = await supabase
          .from('shipping_rates')
          .update({
            MinWeight: Number(rateForm.MinWeight),
            MaxWeight: Number(rateForm.MaxWeight) || 0,
            Price: Number(rateForm.Price)
          })
          .eq('id', editingRate.id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'อัปเดตอัตราค่าจัดส่งเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })
      } else {
        // Insert new rate
        const { error } = await supabase
          .from('shipping_rates')
          .insert({
            MinWeight: Number(rateForm.MinWeight),
            MaxWeight: Number(rateForm.MaxWeight) || 0,
            Price: Number(rateForm.Price)
          })

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'เพิ่มอัตราค่าจัดส่งเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })
      }

      setShowRateModal(false)
      fetchShippingRates()
    } catch (error) {
      console.error('Error saving shipping rate:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกได้'
      })
    }
  }

  const handleDeleteRate = async (rate) => {
    if (!rate.id) {
      Swal.fire({
        icon: 'info',
        title: 'ต้องเพิ่มคอลัมน์ id ในตาราง shipping_rates',
        text: 'กรุณารัน SQL ใน DEPLOY.md หัวข้อ "ตาราง shipping_rates" (เพิ่มคอลัมน์ id) ใน Supabase → SQL Editor แล้วรีเฟรชหน้า'
      })
      return
    }
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `คุณต้องการลบอัตราค่าจัดส่งนี้หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('shipping_rates')
          .delete()
          .eq('id', rate.id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'ลบสำเร็จ',
          text: 'ลบอัตราค่าจัดส่งเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })

        fetchShippingRates()
      } catch (error) {
        console.error('Error deleting shipping rate:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถลบได้'
        })
      }
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)

      // Upsert settings
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'shipping',
          value: settings,
          updatedat: new Date().toISOString()
        }, {
          onConflict: 'key'
        })

      if (error) {
        throw new Error(error.message)
      }

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: 'ตั้งค่าการจัดส่งถูกบันทึกแล้ว',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error saving settings:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกได้'
      })
    } finally {
      setSaving(false)
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
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าการจัดส่ง</h1>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">เปิด/ปิดช่องทางการรับสินค้า</h2>
              
              <div className="space-y-4">
                {/* Pickup Option */}
                <div className="border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-store" className="text-2xl text-emerald-600" />
                      <div>
                        <h3 className="font-bold text-gray-900">รับเองที่ร้าน</h3>
                        <p className="text-sm text-gray-500">
                          ลูกค้าสามารถเข้ามารับสินค้าได้ที่ร้าน
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.pickupEnabled}
                        onChange={(e) => setSettings({ ...settings, pickupEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  {settings.pickupEnabled && (
                    <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded">
                      <p><strong>รายละเอียด:</strong></p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>รับได้ในช่วงเวลาทำการ 10:00-17:30 น.</li>
                        <li>รอ 4 ชั่วโมงหลังอนุมัติ</li>
                        <li>ไม่คิดค่าจัดส่ง</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Delivery Option */}
                <div className="border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-truck" className="text-2xl text-blue-600" />
                      <div>
                        <h3 className="font-bold text-gray-900">จัดส่งตามระบบ</h3>
                        <p className="text-sm text-gray-500">
                          จัดส่งสินค้าตามที่อยู่ที่ลูกค้ากำหนด
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.deliveryEnabled}
                        onChange={(e) => setSettings({ ...settings, deliveryEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  {settings.deliveryEnabled && (
                    <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded">
                      <p><strong>รายละเอียด:</strong></p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>จัดส่งตามที่อยู่ที่ลูกค้ากำหนด</li>
                        <li>คิดค่าจัดส่งตามน้ำหนัก</li>
                        <li>อัตราค่าจัดส่งตามตาราง shipping_rates</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Rates Management */}
              {settings.deliveryEnabled && (
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900">จัดการอัตราค่าจัดส่ง</h2>
                    <button
                      onClick={handleAddRate}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition flex items-center gap-2"
                    >
                      <Icon icon="fa-plus" />
                      เพิ่มอัตราใหม่
                    </button>
                  </div>

                  {shippingRates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Icon icon="fa-inbox" className="text-4xl mb-2" />
                      <p>ยังไม่มีอัตราค่าจัดส่ง</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-bold">น้ำหนักขั้นต่ำ (กรัม)</th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-bold">น้ำหนักสูงสุด (กรัม)</th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-bold">ค่าจัดส่ง (บาท)</th>
                            <th className="border border-gray-300 px-4 py-2 text-center text-sm font-bold">จัดการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shippingRates.map((rate) => (
                            <tr key={rate.id ?? `rate-${rate.MinWeight}-${rate.MaxWeight}`} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 text-sm">
                                {rate.MinWeight?.toLocaleString() || 0}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-sm">
                                {rate.MaxWeight === 0 || !rate.MaxWeight ? 'ไม่จำกัด' : rate.MaxWeight.toLocaleString()}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-sm">
                                {rate.Price?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => handleEditRate(rate)}
                                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                                  >
                                    <Icon icon="fa-edit" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRate(rate)}
                                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
                                  >
                                    <Icon icon="fa-trash" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={fetchSettings}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Icon icon="fa-spinner" className="animate-spin" />
                      กำลังบันทึก...
                    </span>
                  ) : (
                    'บันทึกการตั้งค่า'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {editingRate ? 'แก้ไขอัตราค่าจัดส่ง' : 'เพิ่มอัตราค่าจัดส่งใหม่'}
              </h3>
              <button
                onClick={() => setShowRateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Icon icon="fa-times" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  น้ำหนักขั้นต่ำ (กรัม) *
                </label>
                <input
                  type="number"
                  min="0"
                  value={rateForm.MinWeight || ''}
                  onChange={(e) => setRateForm({ ...rateForm, MinWeight: Number(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  น้ำหนักสูงสุด (กรัม) <span className="text-gray-500 text-xs">(ใส่ 0 สำหรับไม่จำกัด)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={rateForm.MaxWeight || ''}
                  onChange={(e) => setRateForm({ ...rateForm, MaxWeight: Number(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค่าจัดส่ง (บาท) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateForm.Price || ''}
                  onChange={(e) => setRateForm({ ...rateForm, Price: Number(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowRateModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveRate}
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
