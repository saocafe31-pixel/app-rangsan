import { useState, useEffect } from 'react'
import { supplierService } from '../services/supplierService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

const emptyForm = { name: '', contact: '', phone: '' }

export default function AdminSuppliers({ user }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [list, setList] = useState([])
  const [tableExists, setTableExists] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const fetchList = async () => {
    try {
      setLoading(true)
      const data = await supplierService.getSuppliersFromTable()
      setList(Array.isArray(data) ? data : [])
      setTableExists(true)
    } catch (e) {
      console.error(e)
      setList([])
      setTableExists(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (row) => {
    setEditingId(row.id)
    setForm({
      name: row.name || '',
      contact: row.contact || '',
      phone: row.phone || ''
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async () => {
    const name = (form.name || '').trim()
    if (!name) {
      Swal.fire({ icon: 'warning', title: 'กรุณาระบุชื่อซัพพลายเออร์' })
      return
    }
    try {
      setSaving(true)
      if (editingId) {
        await supplierService.updateSupplier(editingId, {
          name: form.name.trim(),
          contact: form.contact.trim(),
          phone: form.phone.trim()
        })
        Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500, showConfirmButton: false })
      } else {
        await supplierService.createSupplier({
          name: form.name.trim(),
          contact: form.contact.trim(),
          phone: form.phone.trim()
        })
        Swal.fire({ icon: 'success', title: 'เพิ่มแล้ว', timer: 1500, showConfirmButton: false })
      }
      closeModal()
      fetchList()
    } catch (error) {
      Swal.fire({ icon: 'error', title: editingId ? 'บันทึกไม่สำเร็จ' : 'เพิ่มไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันลบ',
      text: `ลบซัพพลายเออร์ "${row.name}" หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    })
    if (!result.isConfirmed) return
    try {
      await supplierService.deleteSupplier(row.id)
      Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1500, showConfirmButton: false })
      fetchList()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-4 md:px-6 pb-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">จัดการซัพพลายเออร์</h1>
            <p className="text-gray-600 mb-4">
              รายชื่อจากตาราง suppliers ใช้ร่วมกับใบสั่งซื้อ (PO) และสินค้า
            </p>

            {!tableExists && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800">
                <p className="font-medium">ยังไม่มีตาราง suppliers</p>
                <p className="text-sm mt-1">
                  ให้รัน SQL ใน Supabase → SQL Editor ตามคู่มือ DEPLOY.md (หัวข้อ 5.2 ตาราง suppliers)
                </p>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <span className="font-bold text-gray-700">รายการซัพพลายเออร์</span>
                <button
                  type="button"
                  onClick={openAdd}
                  disabled={!tableExists}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-2"
                >
                  <Icon icon="fa-plus" />
                  เพิ่ม
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ชื่อ</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้ติดต่อ</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">เบอร์โทร</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase w-28">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {list.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-gray-600">{row.contact || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{row.phone || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="text-blue-600 hover:underline font-medium mr-2"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="text-red-600 hover:underline"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list.length === 0 && tableExists && (
                <div className="px-4 py-8 text-center text-gray-500">ยังไม่มีรายการ เพิ่มซัพพลายเออร์ได้ด้านบน</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingId ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ชื่อบริษัท/ร้าน"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ติดต่อ</label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  placeholder="ชื่อผู้ติดต่อ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="เบอร์โทรศัพท์"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {editingId ? 'บันทึก' : 'เพิ่ม'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
