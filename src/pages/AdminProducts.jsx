import { useState, useEffect } from 'react'
import { productService } from '../services/productService'
import { imageService } from '../services/imageService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { allowedViewerEmailsToFormText, mergeEmailIntoAllowedViewerText, parseAllowedViewerEmailsFromText } from '../utils/helpers'
import { fetchCustomersForVisibilityPicker } from '../services/userDirectoryService'

export default function AdminProducts({ user }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    price: '',
    cost: '',
    stock: '',
    image: '',
    category: '',
    detail: '',
    supplier: '',
    unit: 'ชิ้น',
    weight: '',
    minStock: '5',
    franchisePrice: '',
    visibleOnHome: true,
    saleToFranchise: true,
    saleToRegular: true,
    saleRestrictedToUsers: false,
    allowedViewerEmailsText: ''
  })
  const [visibilityPickList, setVisibilityPickList] = useState([])
  const [visibilityPickLoading, setVisibilityPickLoading] = useState(false)
  const [visibilitySelectSeq, setVisibilitySelectSeq] = useState(0)

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    if (!showAddModal && !showEditModal) return
    let cancelled = false
    setVisibilityPickLoading(true)
    fetchCustomersForVisibilityPicker()
      .then((list) => {
        if (!cancelled) setVisibilityPickList(list)
      })
      .catch((err) => {
        console.error('fetchCustomersForVisibilityPicker:', err)
        if (!cancelled) setVisibilityPickList([])
      })
      .finally(() => {
        if (!cancelled) setVisibilityPickLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showAddModal, showEditModal])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const data = await productService.getProducts(user, 0, 1000, searchTerm)
      setProducts(data)
    } catch (error) {
      console.error('Error fetching products:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลสินค้าได้'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchProducts()
    }, 500)
    return () => clearTimeout(debounce)
  }, [searchTerm])

  const handleAddProduct = () => {
    setFormData({
      id: '',
      name: '',
      price: '',
      cost: '',
      stock: '',
      image: '',
      category: '',
      detail: '',
      supplier: '',
      unit: 'ชิ้น',
      weight: '',
      minStock: '5',
      franchisePrice: '',
      visibleOnHome: true,
      saleToFranchise: true,
      saleToRegular: true,
      saleRestrictedToUsers: false,
      allowedViewerEmailsText: ''
    })
    setShowAddModal(true)
  }

  const handleEditProduct = (product) => {
    setFormData({
      id: product.id,
      name: product.name,
      price: product.price,
      cost: product.cost || '',
      stock: product.stock,
      image: product.image || '',
      category: product.category || '',
      detail: product.detail || '',
      supplier: product.supplier || '',
      unit: product.unit || 'ชิ้น',
      weight: product.weight || '',
      minStock: product.minStock || 5,
      franchisePrice: product.franchisePrice || product.price,
      visibleOnHome: product.visibleOnHome !== false,
      saleToFranchise: product.saleToFranchise !== false,
      saleToRegular: product.saleToRegular !== false,
      saleRestrictedToUsers: product.saleRestrictedToUsers === true,
      allowedViewerEmailsText: allowedViewerEmailsToFormText(product.allowedViewerEmails)
    })
    setEditingProduct(product)
    setShowEditModal(true)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      Swal.fire({
        title: 'กำลังอัปโหลดรูปภาพ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      const imageUrl = await imageService.uploadImage(file)
      setFormData({ ...formData, image: imageUrl })

      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'อัปโหลดรูปภาพสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'อัปโหลดรูปภาพไม่สำเร็จ',
        text: error.message
      })
    }
  }

  const handleSaveProduct = async () => {
    if (!formData.name || !formData.price) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูลให้ครบ',
        text: 'ชื่อสินค้าและราคาเป็นข้อมูลที่จำเป็น'
      })
      return
    }

    if (formData.visibleOnHome !== false) {
      if (formData.saleRestrictedToUsers) {
        const emails = parseAllowedViewerEmailsFromText(formData.allowedViewerEmailsText || '')
        if (emails.length === 0) {
          Swal.fire({
            icon: 'warning',
            title: 'กรุณาระบุอีเมล',
            text: 'เมื่อเลือกจำกัดเฉพาะผู้ใช้ ต้องกรอกอีเมลอย่างน้อย 1 รายการ หรือปิดการแสดงในหน้าหลัก'
          })
          return
        }
      } else if (!formData.saleToFranchise && !formData.saleToRegular) {
        Swal.fire({
          icon: 'warning',
          title: 'เลือกกลุ่มลูกค้า',
          text: 'เลือกอย่างน้อยหนึ่งกลุ่ม (แฟรนไชส์ / ลูกค้าทั่วไป) หรือใช้โหมดจำกัดอีเมล หรือปิดการแสดงในหน้าหลัก'
        })
        return
      }
    }

    try {
      Swal.fire({
        title: 'กำลังบันทึก...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      if (editingProduct) {
        await productService.updateProduct(formData.id, {
          ...formData,
          franchiseAvailable: formData.saleToFranchise !== false
        })
        Swal.fire({
          icon: 'success',
          title: 'อัปเดตสินค้าสำเร็จ',
          timer: 1500,
          showConfirmButton: false
        })
      } else {
        await productService.addProduct({
          ...formData,
          id: formData.id || `PROD_${Date.now()}`,
          franchiseAvailable: formData.saleToFranchise !== false
        })
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มสินค้าสำเร็จ',
          timer: 1500,
          showConfirmButton: false
        })
      }

      setShowAddModal(false)
      setShowEditModal(false)
      setEditingProduct(null)
      fetchProducts()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกสินค้าได้'
      })
    }
  }

  const handleUpdateStock = async (productId, newStock) => {
    const { value: stock } = await Swal.fire({
      title: 'อัปเดตสต็อก',
      input: 'number',
      inputLabel: 'จำนวนสต็อก',
      inputValue: newStock,
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      inputValidator: (value) => {
        if (!value || value < 0) {
          return 'กรุณากรอกจำนวนสต็อกที่ถูกต้อง'
        }
      }
    })

    if (stock === undefined) return

    try {
      await productService.updateStock(productId, parseInt(stock))
      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสต็อกสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })
      fetchProducts()
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตสต็อกได้'
      })
    }
  }

  if (loading && products.length === 0) {
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
              <h1 className="text-2xl font-bold text-gray-900">จัดการสินค้า</h1>
              <button
                onClick={handleAddProduct}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
              >
                <Icon icon="fa-plus" />
                <span>เพิ่มสินค้า</span>
              </button>
            </div>

            {/* Search - Sticky */}
            <div className="mb-6 sticky top-16 z-40 bg-gray-50 py-4 -mx-6 px-6 border-b border-gray-200 shadow-sm">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาสินค้า..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white shadow-sm"
                />
                <Icon icon="fa-search" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            {/* Products Table */}
            {products.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Icon icon="fa-box" className="text-5xl mb-4 opacity-50" />
                <p>ไม่พบสินค้า</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">รูปภาพ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ชื่อสินค้า</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ราคา</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สต็อก</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">หมวดหมู่</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {products.map((product) => (
                        <tr key={product.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-16 h-16 object-cover rounded-lg"
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                                <Icon icon="fa-image" className="text-gray-400" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900">{product.name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-emerald-600">
                              ฿{product.price.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleUpdateStock(product.id, product.stock)}
                              className={`px-3 py-1 rounded text-xs font-bold transition ${
                                product.stock <= (product.minStock || 5)
                                  ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                  : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                            >
                              {product.stock} {product.unit || 'ชิ้น'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">{product.category || '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition"
                              >
                                <Icon icon="fa-edit" />
                              </button>
                            </div>
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

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setShowEditModal(false)
                    setEditingProduct(null)
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">รหัสสินค้า</label>
                    <input
                      type="text"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      disabled={!!editingProduct}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อสินค้า *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ราคา *</label>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ต้นทุน</label>
                    <input
                      type="number"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">สต็อก</label>
                    <input
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">สต็อกขั้นต่ำ</label>
                    <input
                      type="number"
                      value={formData.minStock}
                      onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">รูปภาพ</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  {formData.image && (
                    <img src={formData.image} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded-lg" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">หมวดหมู่</label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">หน่วย</label>
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">รายละเอียด</label>
                  <textarea
                    value={formData.detail}
                    onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
                    rows={3}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ราคาแฟรนไชส์</label>
                    <input
                      type="number"
                      value={formData.franchisePrice}
                      onChange={(e) => setFormData({ ...formData, franchisePrice: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">น้ำหนัก (กรัม)</label>
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3 border-2 border-gray-200 rounded-xl p-4 bg-gray-50">
                  <p className="text-sm font-bold text-gray-800">การแสดงในหน้าแคตตาล็อกและกลุ่มลูกค้า</p>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="admin-visible-home"
                      checked={formData.visibleOnHome !== false}
                      onChange={(e) => setFormData({ ...formData, visibleOnHome: e.target.checked })}
                      className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="admin-visible-home" className="text-sm font-bold text-gray-700 leading-snug">
                      แสดงสินค้าในหน้าแคตตาล็อก (หน้าหลัก)
                      <span className="block text-xs font-normal text-gray-500 mt-0.5">ปิดตัวนี้เพื่อซ่อนรายการจากหน้าหลัก</span>
                    </label>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="admin-restricted-emails"
                      checked={formData.saleRestrictedToUsers === true}
                      onChange={(e) =>
                        setFormData({ ...formData, saleRestrictedToUsers: e.target.checked })
                      }
                      className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="admin-restricted-emails" className="text-sm font-bold text-gray-700 leading-snug">
                      จำกัดเฉพาะผู้ใช้ที่ระบุอีเมล
                    </label>
                  </div>
                  {formData.saleRestrictedToUsers && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          เพิ่มจากรายชื่อลูกค้า (ชื่อ / อีเมล)
                        </label>
                        <select
                          key={visibilitySelectSeq}
                          className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                          defaultValue=""
                          disabled={visibilityPickLoading}
                          onChange={(e) => {
                            const v = e.target.value
                            if (!v) return
                            setFormData((fd) => ({
                              ...fd,
                              allowedViewerEmailsText: mergeEmailIntoAllowedViewerText(
                                fd.allowedViewerEmailsText,
                                v
                              )
                            }))
                            setVisibilitySelectSeq((n) => n + 1)
                          }}
                        >
                          <option value="">
                            {visibilityPickLoading ? 'กำลังโหลดรายชื่อ...' : '-- เลือกเพื่อเพิ่มอีเมล --'}
                          </option>
                          {visibilityPickList.map((c) => (
                            <option key={c.email.toLowerCase()} value={c.email}>
                              {c.optionLabel}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                          ลูกค้าจะเห็นราคาตามประเภทบัญชี (แฟรนไชส์ / ทั่วไป)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          รายการอีเมล (คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่)
                        </label>
                        <textarea
                          value={formData.allowedViewerEmailsText}
                          onChange={(e) =>
                            setFormData({ ...formData, allowedViewerEmailsText: e.target.value })
                          }
                          rows={3}
                          className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                          placeholder="user@example.com"
                        />
                      </div>
                    </div>
                  )}
                  {!formData.saleRestrictedToUsers && (
                    <div className="space-y-2 pl-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="admin-sale-franchise"
                          checked={formData.saleToFranchise !== false}
                          onChange={(e) =>
                            setFormData({ ...formData, saleToFranchise: e.target.checked })
                          }
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <label htmlFor="admin-sale-franchise" className="text-sm font-bold text-gray-700">
                          เปิดให้ลูกค้าแฟรนไชส์
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="admin-sale-regular"
                          checked={formData.saleToRegular !== false}
                          onChange={(e) =>
                            setFormData({ ...formData, saleToRegular: e.target.checked })
                          }
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <label htmlFor="admin-sale-regular" className="text-sm font-bold text-gray-700">
                          เปิดให้ลูกค้าทั่วไป
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleSaveProduct}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    บันทึก
                  </button>
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setShowEditModal(false)
                      setEditingProduct(null)
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
