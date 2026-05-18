import { useState, useEffect, useMemo } from 'react'
import { productService } from '../services/productService'
import { poService } from '../services/poService'
import { getNotificationsSettings } from '../services/shopSettingsService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function StockAlert({ user }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [orderQuantities, setOrderQuantities] = useState({})
  const [lowStockThreshold, setLowStockThreshold] = useState(5)
  const itemsPerPage = 20

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    getNotificationsSettings().then((s) => setLowStockThreshold(s.lowStockThreshold || 5))
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const data = await productService.getAllProducts(user, '')
      setProducts(data)
      console.log('[StockAlert] Products refreshed:', data.length, 'products')
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

  const handleRefresh = async () => {
    // Reset states
    setSearchTerm('')
    setCurrentPage(1)
    setSelectedProducts(new Set())
    setOrderQuantities({})
    
    // Fetch fresh data
    await fetchProducts()
    
    // Dispatch event to update sidebar badge
    window.dispatchEvent(new CustomEvent('stockUpdated'))
  }

  /** จำนวนขั้นต่ำที่ใช้เตือน: ถ้าสินค้าไม่ได้ตั้ง minStock หรือไม่ถูกต้อง ใช้ค่าจากตั้งค่าร้าน */
  const effectiveMinStock = (p) => {
    const n = Number(p.minStock)
    if (Number.isFinite(n) && n > 0) return n
    return lowStockThreshold
  }

  // Calculate low stock products (ใช้ lowStockThreshold จาก settings เมื่อสินค้าไม่มี minStock)
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const stock = Number(p.stock) || 0
      const minStock = effectiveMinStock(p)
      return stock <= minStock
    }).sort((a, b) => {
      const aStock = Number(a.stock) || 0
      const bStock = Number(b.stock) || 0
      return aStock - bStock
    })
  }, [products, lowStockThreshold])

  // Filter low stock products by search
  const filteredLowStockProducts = useMemo(() => {
    return lowStockProducts.filter(p => {
      const searchLower = searchTerm.toLowerCase()
      return (
        p.name.toLowerCase().includes(searchLower) ||
        (p.category || '').toLowerCase().includes(searchLower) ||
        (p.supplier || '').toLowerCase().includes(searchLower) ||
        (p.id || '').toLowerCase().includes(searchLower)
      )
    })
  }, [lowStockProducts, searchTerm])

  // Paginate
  const displayedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return filteredLowStockProducts.slice(start, end)
  }, [filteredLowStockProducts, currentPage])

  const totalPages = Math.ceil(filteredLowStockProducts.length / itemsPerPage)

  const handleToggleSelect = (productId, product) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
        // ลบจำนวนที่แก้ไขเมื่อยกเลิกการเลือก
        setOrderQuantities(prev => {
          const newQty = { ...prev }
          delete newQty[productId]
          return newQty
        })
      } else {
        newSet.add(productId)
        // ตั้งค่าเริ่มต้นเป็นจำนวนที่แนะนำ
        const minStock = effectiveMinStock(product)
        const currentStock = Number(product.stock) || 0
        const recommendedQty = Math.max(minStock * 2 - currentStock, minStock)
        setOrderQuantities(prev => ({
          ...prev,
          [productId]: recommendedQty
        }))
      }
      return newSet
    })
  }

  const handleSelectAll = (checked) => {
    if (checked) {
      const newSelected = new Set(displayedProducts.map(p => p.id))
      setSelectedProducts(newSelected)
      // ตั้งค่าจำนวนเริ่มต้นสำหรับทุกสินค้าที่เลือก
      const newQuantities = {}
      displayedProducts.forEach(product => {
        const minStock = effectiveMinStock(product)
        const currentStock = Number(product.stock) || 0
        const recommendedQty = Math.max(minStock * 2 - currentStock, minStock)
        newQuantities[product.id] = recommendedQty
      })
      setOrderQuantities(prev => ({ ...prev, ...newQuantities }))
    } else {
      setSelectedProducts(new Set())
      // ลบจำนวนที่แก้ไขทั้งหมด
      setOrderQuantities({})
    }
  }

  const handleQuantityChange = (productId, value) => {
    const numValue = parseInt(value) || 0
    if (numValue >= 0) {
      setOrderQuantities(prev => ({
        ...prev,
        [productId]: numValue
      }))
    }
  }

  const handleRestock = async (product) => {
    const { value: qty } = await Swal.fire({
      title: `เติมสต็อก: ${product.name}`,
      text: 'ระบุจำนวนที่ต้องการเติมเพิ่ม (+)',
      input: 'number',
      inputValue: 0,
      inputAttributes: {
        min: 1,
        step: 1
      },
      showCancelButton: true,
      confirmButtonText: 'เติมสต็อก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      inputValidator: (value) => {
        if (!value || parseInt(value) <= 0) {
          return 'กรุณาระบุจำนวนที่มากกว่า 0'
        }
      }
    })

    if (qty && parseInt(qty) > 0) {
      try {
        Swal.fire({
          title: 'กำลังเติมสต็อก...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        })

        const newStock = product.stock + parseInt(qty)
        await productService.updateStock(product.id, newStock)
        
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ',
          text: `เติมสต็อก +${qty} เรียบร้อย`,
          timer: 1500,
          showConfirmButton: false
        })

        await fetchProducts()
      } catch (error) {
        console.error('Error restocking:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถเติมสต็อกได้'
        })
      }
    }
  }

  const handleCreatePO = async (product) => {
    const minStock = effectiveMinStock(product)
    const currentStock = Number(product.stock) || 0
    const recommendedQty = Math.max(minStock * 2 - currentStock, minStock)

    try {
      Swal.fire({
        title: 'กำลังสร้าง PO...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      await poService.createPO({
        supplier: product.supplier || 'ไม่ระบุ',
        items: [{
          productId: product.id,
          productName: product.name,
          qty: recommendedQty,
          price: product.price || 0
        }],
        expectedDate: '',
        notes: `สร้างจาก Stock Alert - ${new Date().toLocaleDateString('th-TH')}`
      }, user.email)

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'สร้าง PO เรียบร้อย',
        timer: 1500,
        showConfirmButton: false
      })

      await fetchProducts()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสร้าง PO ได้'
      })
    }
  }

  const handleAutoCreatePO = async () => {
    const selectedProductsList = filteredLowStockProducts.filter(p => selectedProducts.has(p.id))
    
    if (selectedProductsList.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกสินค้า',
        text: 'กรุณาเลือกสินค้าที่ต้องการสร้าง PO'
      })
      return
    }

    // ตรวจสอบว่ามีสินค้าที่จำนวนสั่งเป็น 0 หรือไม่
    const invalidProducts = selectedProductsList.filter(p => {
      const qty = orderQuantities[p.id] || 0
      return qty <= 0
    })

    if (invalidProducts.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวนสั่ง',
        text: `กรุณาระบุจำนวนสั่งที่มากกว่า 0 สำหรับสินค้า: ${invalidProducts.map(p => p.name).join(', ')}`
      })
      return
    }

    // จัดกลุ่มสินค้าตามซัพพลายเออร์
    const productsBySupplier = {}
    selectedProductsList.forEach(product => {
      const supplier = product.supplier || 'ไม่ระบุ'
      if (!productsBySupplier[supplier]) {
        productsBySupplier[supplier] = []
      }
      // ใช้จำนวนที่แก้ไข หรือจำนวนที่แนะนำถ้ายังไม่ได้แก้ไข
      const orderQty = orderQuantities[product.id] || (() => {
        const minStock = effectiveMinStock(product)
        const currentStock = Number(product.stock) || 0
        return Math.max(minStock * 2 - currentStock, minStock)
      })()
      
      productsBySupplier[supplier].push({
        productId: product.id,
        productName: product.name,
        qty: orderQty,
        price: product.price || 0
      })
    })

    const suppliers = Object.keys(productsBySupplier)
    const supplierCount = suppliers.length

    const { isConfirmed } = await Swal.fire({
      title: 'สร้าง PO อัตโนมัติ',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการสร้าง PO สำหรับสินค้าทั้งหมด (${selectedProductsList.length} รายการ) หรือไม่?</p>
          <p class="text-sm text-gray-600 mb-2">ระบบจะแยกสร้าง PO ตามซัพพลายเออร์อัตโนมัติ:</p>
          <ul class="text-sm text-gray-700 list-disc list-inside">
            ${suppliers.map(supplier => 
              `<li>${supplier}: ${productsBySupplier[supplier].length} รายการ</li>`
            ).join('')}
          </ul>
          <p class="text-sm font-bold text-emerald-600 mt-2">จะสร้าง PO ทั้งหมด ${supplierCount} ใบ</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a'
    })

    if (!isConfirmed) return

    try {
      Swal.fire({
        title: 'กำลังสร้าง PO...',
        html: `กำลังสร้าง PO สำหรับ ${supplierCount} ซัพพลายเออร์`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      let createdCount = 0
      let failedCount = 0

      // สร้าง PO แยกตามซัพพลายเออร์
      for (const supplier of suppliers) {
        try {
          if (createdCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 100)) // delay 100ms
          }

          await poService.createPO({
            supplier: supplier,
            items: productsBySupplier[supplier],
            expectedDate: '',
            notes: `สร้างอัตโนมัติจาก Stock Alert - ${new Date().toLocaleDateString('th-TH')}`
          }, user.email)

          createdCount++
        } catch (error) {
          failedCount++
          console.error('Error creating PO for supplier:', supplier, error)
        }
      }

      if (createdCount > 0) {
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ',
          text: supplierCount > 1 ? `สร้าง PO เรียบร้อย ${createdCount} ใบ (แยกตามซัพพลายเออร์)` : 'สร้าง PO เรียบร้อย',
          timer: 2000,
          showConfirmButton: false
        })

        setSelectedProducts(new Set())
        setOrderQuantities({})
        await fetchProducts()
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: 'ไม่สามารถสร้าง PO ได้'
        })
      }
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสร้าง PO ได้'
      })
    }
  }

  if (loading && products.length === 0) {
    return <LoadingSpinner />
  }

  const allSelected = displayedProducts.length > 0 && displayedProducts.every(p => selectedProducts.has(p.id))

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />

      <div className="flex">
        <Sidebar user={user} />

        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">แจ้งเตือนสต็อกต่ำ</h1>
                <p className="text-sm text-gray-500 mt-1">
                  พบสินค้าที่สต็อกต่ำกว่า minStock จำนวน <span className="font-bold text-red-600">{lowStockProducts.length}</span> รายการ
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className={`text-sm text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded hover:bg-blue-100 transition flex items-center gap-2 ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Icon icon={loading ? "fa-spinner" : "fa-sync"} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
                {filteredLowStockProducts.length > 0 && (
                  <button
                    onClick={handleAutoCreatePO}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition shadow-sm flex items-center gap-2"
                  >
                    <Icon icon="fa-magic" />
                    สร้าง PO อัตโนมัติ (แยกตามซัพพลายเออร์)
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
              <div className="relative">
                <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="ค้นหาสินค้าที่สต็อกต่ำ..."
                  className="w-full pl-10 p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-gray-800 outline-none transition"
                />
              </div>
            </div>

            {/* Low Stock Products Table */}
            {filteredLowStockProducts.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                {lowStockProducts.length === 0
                  ? '🎉 ไม่มีสินค้าที่สต็อกต่ำ - ทุกอย่างพร้อม!'
                  : 'ไม่พบสินค้าที่ตรงกับการค้นหา'
                }
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-red-50 font-bold uppercase text-xs text-gray-600">
                      <tr>
                        <th className="p-4 w-12">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={allSelected}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                          />
                        </th>
                        <th className="p-4">สินค้า</th>
                        <th className="p-4 text-center">STOCK</th>
                        <th className="p-4 text-center">ขาด</th>
                        <th className="p-4 text-center">แนะนำสั่ง</th>
                        <th className="p-4 text-center">จำนวนสั่ง</th>
                        <th className="p-4 text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {displayedProducts.map(product => {
                        const stock = Number(product.stock) || 0
                        const minStock = effectiveMinStock(product)
                        // จำนวนที่ขาดถึงขั้นต่ำ (ค่าบวก — ไม่ใช่ stock - minStock ที่ดูติดลบ)
                        const shortage = Math.max(0, minStock - stock)
                        const recommendedQty = Math.max(minStock * 2 - stock, minStock)
                        const isSelected = selectedProducts.has(product.id)
                        const orderQty = orderQuantities[product.id] !== undefined 
                          ? orderQuantities[product.id] 
                          : recommendedQty
                        
                        return (
                          <tr key={product.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                            <td className="p-4">
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(product.id, product)}
                              />
                            </td>
                            <td className="p-4">
                              <div className="font-bold">{product.name}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                {product.category || '-'} | {product.supplier || 'ไม่ระบุ'}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-3 py-1 rounded text-sm font-bold ${
                                stock === 0 ? 'bg-red-200 text-red-900' :
                                stock <= minStock / 2 ? 'bg-orange-100 text-orange-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {stock} {product.unit || 'ชิ้น'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className="text-red-600 font-bold" title="จำนวนที่ขาดถึงระดับขั้นต่ำ (min stock)">
                                {shortage > 0 ? `${shortage} ${product.unit || 'ชิ้น'}` : '0'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className="text-emerald-600 font-bold">{recommendedQty} {product.unit || 'ชิ้น'}</span>
                            </td>
                            <td className="p-4 text-center">
                              {isSelected ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleQuantityChange(product.id, orderQty - 1)}
                                    className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 transition flex items-center justify-center font-bold"
                                    disabled={orderQty <= 0}
                                  >
                                    <Icon icon="fa-minus" className="text-xs" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={orderQty}
                                    onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                                    className="w-20 px-2 py-1 border-2 border-emerald-500 rounded text-center font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleQuantityChange(product.id, orderQty + 1)}
                                    className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 transition flex items-center justify-center font-bold"
                                  >
                                    <Icon icon="fa-plus" className="text-xs" />
                                  </button>
                                  <span className="text-xs text-gray-500">{product.unit || 'ชิ้น'}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">-</span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleCreatePO(product)}
                                  className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs flex items-center gap-1 font-bold"
                                >
                                  <Icon icon="fa-shopping-cart" />
                                  สร้าง PO
                                </button>
                                <button
                                  onClick={() => handleRestock(product)}
                                  className="p-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-xs flex items-center gap-1 font-bold"
                                >
                                  <Icon icon="fa-plus" />
                                  เติมสต็อก
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex justify-center">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <Icon icon="fa-chevron-left" />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-4 py-2 rounded-lg transition ${
                            currentPage === page
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <Icon icon="fa-chevron-right" />
                      </button>
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
