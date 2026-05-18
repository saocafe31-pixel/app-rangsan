import { useState, useEffect, useMemo, useRef } from 'react'
import { franchiseStockService } from '../services/franchiseStockService'
import { productService } from '../services/productService'
import { poService } from '../services/poService'
import { orderService } from '../services/orderService'
import { otherSupplierProductsService } from '../services/otherSupplierProductsService'
import { supplierPinLockService } from '../services/supplierPinLockService'
import { imageService } from '../services/imageService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { getOrderItemDisplayName } from '../utils/orderBundleLineUtils'

const STOCK_VIEW_ALL = 'all'
const STOCK_VIEW_BY_SUPPLIER = 'by_supplier'
const SUPPLIER_UNASSIGNED_LABEL = 'ไม่ระบุซัพพลาย'

function getFranchiseStockItemSupplierName(item) {
  const fromProduct = item?.product?.supplier || item?.product?.Supplier
  const direct = item?.supplier || item?.Supplier
  const name = String(fromProduct || direct || '').trim()
  return name || SUPPLIER_UNASSIGNED_LABEL
}

function OtherSupplierCardImage({ imageUrl }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!imageUrl) {
      setSrc(null)
      return
    }
    let cancelled = false
    imageService.getProductImagesBucketDisplayUrl(imageUrl).then((url) => {
      if (!cancelled) setSrc(url || imageUrl)
    })
    return () => { cancelled = true }
  }, [imageUrl])
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover z-[1]"
      onError={() => setSrc(null)}
    />
  )
}

export default function FranchiseStockManagement({ user }) {
  // Helper function to handle number input - removes leading zero when user starts typing
  const handleNumberInput = (value, isFloat = false) => {
    if (value === '' || value === null || value === undefined) {
      return isFloat ? 0 : 0
    }
    const stringValue = String(value)
    // If value starts with 0 and has more digits, remove leading zero
    if (stringValue.length > 1 && stringValue[0] === '0' && stringValue[1] !== '.') {
      const cleaned = stringValue.replace(/^0+/, '') || '0'
      return isFloat ? parseFloat(cleaned) || 0 : parseInt(cleaned) || 0
    }
    return isFloat ? parseFloat(stringValue) || 0 : parseInt(stringValue) || 0
  }

  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [branchId, setBranchId] = useState(null)
  const [activeTab, setActiveTab] = useState('stock') // 'stock', 'lowStock', 'importOrder', 'orderOtherSupplier'
  const [stockViewMode, setStockViewMode] = useState(STOCK_VIEW_ALL)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [orderQuantities, setOrderQuantities] = useState({})
  const [orders, setOrders] = useState([])
  const [showStockInModal, setShowStockInModal] = useState(false)
  const [showStockOutModal, setShowStockOutModal] = useState(false)
  const [showMinStockModal, setShowMinStockModal] = useState(false)
  const [showImportOrderModal, setShowImportOrderModal] = useState(false)
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [addProductMode, setAddProductMode] = useState('fromMain') // 'fromMain' | 'otherSupplier' | 'custom'
  const [availableProducts, setAvailableProducts] = useState([])
  const [otherSupplierProducts, setOtherSupplierProducts] = useState([]) // รายการจากตาราง other_supplier_products (ที่ยังไม่มีในสต็อก)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedProductsForAdd, setSelectedProductsForAdd] = useState(new Set())
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [productQuantities, setProductQuantities] = useState({}) // { productId: { stock: 0, minStock: 5 } }
  const [customProductName, setCustomProductName] = useState('')
  const [customProductId, setCustomProductId] = useState('')
  const [customProductPrice, setCustomProductPrice] = useState(0)
  const [initialStock, setInitialStock] = useState(0)
  const [initialMinStock, setInitialMinStock] = useState(5)
  const [selectedItem, setSelectedItem] = useState(null)
  const [stockInQty, setStockInQty] = useState(0)
  const [stockOutQty, setStockOutQty] = useState(0)
  const [stockNote, setStockNote] = useState('')
  const [minStockValue, setMinStockValue] = useState(5)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editProductName, setEditProductName] = useState('')
  const [editMinStock, setEditMinStock] = useState(5)
  const [editPrice, setEditPrice] = useState(0)
  const [showCloneModal, setShowCloneModal] = useState(false)
  const [cloneSourceBranchId, setCloneSourceBranchId] = useState('')
  const [cloneBranchList, setCloneBranchList] = useState([])
  const [cloneLoading, setCloneLoading] = useState(false)
  const [orderOtherSupplierList, setOrderOtherSupplierList] = useState([])
  const [orderOtherSupplierSearch, setOrderOtherSupplierSearch] = useState('')
  const [orderOtherSupplierQuantities, setOrderOtherSupplierQuantities] = useState({})
  const [orderOtherSupplierLoading, setOrderOtherSupplierLoading] = useState(false)
  const [orderOtherSupplierSupplier, setOrderOtherSupplierSupplier] = useState('All')
  const orderOtherSupplierCsvInputRef = useRef(null)
  const [lockedSupplierNames, setLockedSupplierNames] = useState([])
  const [showSupplierPinModal, setShowSupplierPinModal] = useState(false)
  const [supplierPinValue, setSupplierPinValue] = useState('')
  const [supplierPinChecking, setSupplierPinChecking] = useState(false)
  const [unlockTrigger, setUnlockTrigger] = useState(0)
  const [showEditOtherSupplierModal, setShowEditOtherSupplierModal] = useState(false)
  const [editOtherSupplierProduct, setEditOtherSupplierProduct] = useState(null)
  const [editOtherSupplierImage, setEditOtherSupplierImage] = useState('')
  const [editOtherSupplierSupplier, setEditOtherSupplierSupplier] = useState('')
  const [editOtherSupplierPrice, setEditOtherSupplierPrice] = useState(0)
  const [editOtherSupplierUnit, setEditOtherSupplierUnit] = useState('ชิ้น')
  const [showAddOtherSupplierModal, setShowAddOtherSupplierModal] = useState(false)
  const [newOtherProductId, setNewOtherProductId] = useState('')
  const [newOtherProductName, setNewOtherProductName] = useState('')
  const [newOtherSupplier, setNewOtherSupplier] = useState('')
  const [newOtherPrice, setNewOtherPrice] = useState(0)
  const [newOtherUnit, setNewOtherUnit] = useState('ชิ้น')
  const [newOtherImage, setNewOtherImage] = useState('')
  const [editOtherSupplierFile, setEditOtherSupplierFile] = useState(null)
  const [newOtherSupplierFile, setNewOtherSupplierFile] = useState(null)
  const [otherSupplierImageUploading, setOtherSupplierImageUploading] = useState(false)

  useEffect(() => {
    initializeBranch()
  }, [user])

  useEffect(() => {
    if (branchId) {
      if (activeTab !== 'orderOtherSupplier') fetchStock()
      if (activeTab === 'importOrder') fetchOrders()
    }
  }, [branchId, activeTab])

  useEffect(() => {
    if (showAddProductModal && addProductMode === 'fromMain' && branchId) {
      fetchAvailableProducts()
    }
  }, [showAddProductModal, addProductMode, branchId])

  useEffect(() => {
    if (showAddProductModal && addProductMode === 'otherSupplier' && branchId) {
      fetchOtherSupplierProducts()
    }
  }, [showAddProductModal, addProductMode, branchId])

  useEffect(() => {
    if (showCloneModal && branchId) {
      franchiseStockService.getBranchIdsWithStock(branchId).then(setCloneBranchList).catch(() => setCloneBranchList([]))
      setCloneSourceBranchId('')
    }
  }, [showCloneModal, branchId])

  const fetchOrderOtherSupplierList = () => {
    if (!branchId) return Promise.resolve()
    setOrderOtherSupplierLoading(true)
    return otherSupplierProductsService
      .getAll()
      .then(data => setOrderOtherSupplierList(data || []))
      .catch((err) => {
        console.error('[FranchiseStockManagement] fetchOrderOtherSupplierList failed:', err)
        // ไม่เคลียร์รายการเมื่อโหลดไม่สำเร็จ เพื่อไม่ให้รายการหาย
      })
      .finally(() => setOrderOtherSupplierLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'orderOtherSupplier' && branchId) {
      setOrderOtherSupplierSupplier('All')
      fetchOrderOtherSupplierList()
    }
  }, [activeTab, branchId])

  useEffect(() => {
    if (activeTab !== 'orderOtherSupplier') return
    supplierPinLockService.getLockedSupplierNames().then(setLockedSupplierNames).catch(() => setLockedSupplierNames([]))
  }, [activeTab])

  const currentSupplierLocked = useMemo(() => {
    if (orderOtherSupplierSupplier === 'All') return false
    const name = (orderOtherSupplierSupplier || '').toString().trim()
    return name && lockedSupplierNames.some((l) => (l || '').toString().trim() === name)
  }, [orderOtherSupplierSupplier, lockedSupplierNames])

  const currentSupplierUnlocked = useMemo(() => {
    if (orderOtherSupplierSupplier === 'All') return true
    return supplierPinLockService.isUnlockedInSession(orderOtherSupplierSupplier)
    // unlockTrigger: หลังใส่ PIN ถูกต้อง ต้องอ่าน sessionStorage ใหม่ (ไม่พึ่งแค่ orderOtherSupplierSupplier)
  }, [orderOtherSupplierSupplier, unlockTrigger])

  useEffect(() => {
    if (currentSupplierLocked && !currentSupplierUnlocked) setShowSupplierPinModal(true)
    else setShowSupplierPinModal(false)
  }, [currentSupplierLocked, currentSupplierUnlocked])

  const initializeBranch = async () => {
    try {
      // Try to get from user object first, then from database
      const id = await franchiseStockService.getBranchId(user.email, user)
      console.log('[FranchiseStockManagement] Branch ID result:', id, 'User object:', user)
      if (!id) {
        console.error('[FranchiseStockManagement] Branch ID not found for user:', user.email)
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบ Branch ID',
          text: `กรุณาติดต่อผู้ดูแลระบบ\nอีเมล: ${user.email}\n\nหมายเหตุ: ตรวจสอบว่าในตาราง users มี BranchId สำหรับอีเมลนี้`
        })
        return
      }
      setBranchId(id)
    } catch (error) {
      console.error('[FranchiseStockManagement] Error getting branch ID:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถดึง Branch ID ได้: ${error.message || error}`
      })
    }
  }

  const fetchStock = async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const data = await franchiseStockService.getFranchiseStock(branchId, searchTerm)
      setStockItems(data)
    } catch (error) {
      console.error('Error fetching stock:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลสต็อกได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchOrders = async () => {
    if (!branchId) return
    
    try {
      const data = await orderService.getUserOrders(user.email)
      // Filter only delivered orders
      const deliveredOrders = data.filter(o => 
        (o.Status || o.status || '') === 'จัดส่งแล้ว'
      )
      
      // Check which orders have been imported
      const ordersWithStatus = await Promise.all(
        deliveredOrders.map(async (order) => {
          const orderId = order.ID || order.OrderID
          const isImported = await franchiseStockService.isOrderImported(branchId, orderId)
          return {
            ...order,
            isImported
          }
        })
      )
      
      setOrders(ordersWithStatus)
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  const stockSummary = useMemo(() => {
    const totalItems = stockItems.length
    const supplierSet = new Set(
      stockItems.map(item => (item.product?.supplier || item.product?.Supplier || 'ไม่ระบุ').toString().trim() || 'ไม่ระบุ')
    )
    return { totalItems, supplierCount: supplierSet.size }
  }, [stockItems])

  const lowStockItems = useMemo(() => {
    return stockItems.filter(item => {
      const stock = Number(item.stock) || 0
      const minStock = Number(item.minstock) || 5
      return stock <= minStock
    }).sort((a, b) => {
      const aStock = Number(a.stock) || 0
      const bStock = Number(b.stock) || 0
      return aStock - bStock
    })
  }, [stockItems])

  const baseStockItemsForView = useMemo(
    () => (activeTab === 'lowStock' ? lowStockItems : stockItems),
    [activeTab, stockItems, lowStockItems]
  )

  const supplierSummaries = useMemo(() => {
    const map = new Map()
    baseStockItemsForView.forEach((item) => {
      const supplierName = getFranchiseStockItemSupplierName(item)
      const stock = Number(item.stock) || 0
      const minStock = Number(item.minstock) || 5
      const isLow = stock <= minStock

      if (!map.has(supplierName)) {
        map.set(supplierName, {
          name: supplierName,
          productCount: 0,
          lowStockCount: 0,
          totalStock: 0
        })
      }
      const row = map.get(supplierName)
      row.productCount += 1
      if (isLow) row.lowStockCount += 1
      row.totalStock += stock
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [baseStockItemsForView])

  const supplierCardsFiltered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return supplierSummaries
    return supplierSummaries.filter((s) => s.name.toLowerCase().includes(q))
  }, [supplierSummaries, searchTerm])

  const filteredStockItems = useMemo(() => {
    let list = baseStockItemsForView

    if (stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier) {
      list = list.filter((item) => getFranchiseStockItemSupplierName(item) === selectedSupplier)
    }

    const searchLower = searchTerm.trim().toLowerCase()
    if (searchLower && !(stockViewMode === STOCK_VIEW_BY_SUPPLIER && !selectedSupplier)) {
      list = list.filter(
        (item) =>
          item.productname.toLowerCase().includes(searchLower) ||
          item.productid.toLowerCase().includes(searchLower)
      )
    }
    return list
  }, [baseStockItemsForView, stockViewMode, selectedSupplier, searchTerm])

  const showStockTable =
    stockViewMode === STOCK_VIEW_ALL ||
    (stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier)

  const handleStockViewModeChange = (mode) => {
    setStockViewMode(mode)
    setSelectedSupplier(null)
    setSelectedProducts(new Set())
  }

  const handleSelectSupplier = (supplierName) => {
    setSelectedSupplier(supplierName)
    setSearchTerm('')
    setSelectedProducts(new Set())
  }

  const handleBackToSuppliers = () => {
    setSelectedSupplier(null)
    setSearchTerm('')
    setSelectedProducts(new Set())
  }

  const handleActiveTabChange = (tab) => {
    setActiveTab(tab)
    setSelectedSupplier(null)
    setSelectedProducts(new Set())
    if (tab === 'importOrder' || tab === 'orderOtherSupplier') {
      setStockViewMode(STOCK_VIEW_ALL)
    }
  }

  const handleStockIn = async () => {
    if (!selectedItem || stockInQty <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวน',
        text: 'กรุณาระบุจำนวนที่ต้องการรับเข้า'
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      await franchiseStockService.stockIn(
        branchId,
        selectedItem.productid ?? selectedItem.ProductID ?? selectedItem.productId ?? '',
        stockInQty,
        stockNote || 'รับเข้าสต็อก',
        user.email
      )

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'รับเข้าสต็อกเรียบร้อย',
        timer: 1500,
        showConfirmButton: false
      })

      setShowStockInModal(false)
      setStockInQty(0)
      setStockNote('')
      setSelectedItem(null)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถรับเข้าสต็อกได้'
      })
    }
  }

  const handleStockOut = async () => {
    if (!selectedItem || stockOutQty <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวน',
        text: 'กรุณาระบุจำนวนที่ต้องการเบิกออก'
      })
      return
    }

    if (stockOutQty > (selectedItem.stock || 0)) {
      Swal.fire({
        icon: 'warning',
        title: 'สต็อกไม่พอ',
        text: `สต็อกที่มี: ${selectedItem.stock || 0} ชิ้น`
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const productId = selectedItem.productid ?? selectedItem.ProductID ?? selectedItem.productId ?? ''
      await franchiseStockService.stockOut(
        branchId,
        productId,
        stockOutQty,
        stockNote || 'เบิกออกสต็อก',
        user.email
      )

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'เบิกออกสต็อกเรียบร้อย',
        timer: 1500,
        showConfirmButton: false
      })

      setShowStockOutModal(false)
      setStockOutQty(0)
      setStockNote('')
      setSelectedItem(null)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเบิกออกสต็อกได้'
      })
    }
  }

  const handleUpdateMinStock = async () => {
    if (!selectedItem || minStockValue < 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวน',
        text: 'กรุณาระบุจำนวนขั้นต่ำที่ถูกต้อง'
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const productId = selectedItem.productid ?? selectedItem.ProductID ?? selectedItem.productId ?? ''
      await franchiseStockService.updateMinStock(
        branchId,
        productId,
        minStockValue
      )

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'อัปเดตจำนวนขั้นต่ำเรียบร้อย',
        timer: 1500,
        showConfirmButton: false
      })

      setShowMinStockModal(false)
      setMinStockValue(5)
      setSelectedItem(null)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตจำนวนขั้นต่ำได้'
      })
    }
  }

  const handleEditCustomProduct = async () => {
    if (!editItem || !branchId || !(editItem.iscustom || editItem.isCustom)) return
    const name = (editProductName || '').trim()
    if (!name) {
      Swal.fire({ icon: 'warning', title: 'กรุณาระบุชื่อสินค้า' })
      return
    }
    try {
      Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      await franchiseStockService.updateCustomProduct(branchId, editItem.productid, {
        productName: name,
        minstock: editMinStock,
        price: editPrice
      })
      Swal.fire({ icon: 'success', title: 'บันทึกแก้ไขเรียบร้อย', timer: 1500, showConfirmButton: false })
      setShowEditModal(false)
      setEditItem(null)
      setEditProductName('')
      setEditMinStock(5)
      setEditPrice(0)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message || 'ไม่สามารถบันทึกแก้ไขได้' })
    }
  }

  const handleRemoveFromStock = async (item) => {
    const isCustom = item.iscustom || item.isCustom
    const result = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการลบ',
      html: isCustom
        ? `ลบสินค้าเพิ่มเอง "${item.productname}" ออกจากรายการสต็อก?`
        : `ลบ "${item.productname}" ออกจากสต็อกแฟรนไชส์?<br><small class="text-gray-500">สินค้ายังอยู่ที่ส่วนกลาง สามารถเพิ่มจากหน้าหลักได้อีกครั้ง</small>`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626'
    })
    if (!result.isConfirmed) return
    try {
      Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const productId = item.productid ?? item.ProductID ?? item.productId ?? ''
      await franchiseStockService.removeFromFranchiseStock(branchId, productId)
      Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', timer: 1500, showConfirmButton: false })
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message || 'ไม่สามารถลบได้' })
    }
  }

  const handleImportFromOrder = async (order) => {
    const orderId = order.ID || order.OrderID
    
    // Check if already imported
    if (order.isImported) {
      Swal.fire({
        icon: 'warning',
        title: 'ออเดอร์นี้ถูกนำเข้าแล้ว',
        text: `ออเดอร์ ${orderId} ถูกนำเข้าสต็อกแล้ว ไม่สามารถนำเข้าซ้ำได้`,
        confirmButtonText: 'ตกลง'
      })
      return
    }

    // Get order details to show items
    try {
      // Use Items from order object if available, otherwise fetch
      let orderItems = order.Items || []
      
      if (!orderItems || orderItems.length === 0) {
        const orderDetails = await orderService.getUserOrders(user.email)
        const selectedOrder = orderDetails.find(o => (o.ID || o.OrderID) === orderId)
        orderItems = selectedOrder?.Items || []
      }
      
      if (!orderItems || orderItems.length === 0) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบรายการสินค้า',
          text: 'ไม่สามารถดึงรายการสินค้าในออเดอร์ได้',
          confirmButtonText: 'ตกลง'
        })
        return
      }

      // Show order items in confirmation dialog
      const itemsHtml = orderItems.map((item, idx) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${idx + 1}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left;">${getOrderItemDisplayName(item.name)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.qty || 0}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${Number(item.price || 0).toLocaleString()} ฿</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${((item.qty || 0) * Number(item.price || 0)).toLocaleString()} ฿</td>
        </tr>
      `).join('')

      const totalAmount = orderItems.reduce((sum, item) => 
        sum + ((item.qty || 0) * Number(item.price || 0)), 0
      )

      const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการนำเข้าสต็อก',
        html: `
          <div style="text-align: left;">
            <p style="margin-bottom: 15px; font-weight: bold;">ออเดอร์: ${orderId}</p>
            <p style="margin-bottom: 10px;">รายการสินค้าที่จะนำเข้า:</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">#</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">ชื่อสินค้า</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">จำนวน</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">ราคา/หน่วย</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">รวม</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr style="background-color: #f9fafb; font-weight: bold;">
                  <td colspan="4" style="padding: 8px; border: 1px solid #ddd; text-align: right;">รวมทั้งหมด:</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${totalAmount.toLocaleString()} ฿</td>
                </tr>
              </tfoot>
            </table>
            <p style="color: #666; font-size: 14px;">ต้องการนำเข้าสต็อกจากออเดอร์นี้หรือไม่?</p>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันนำเข้า',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280',
        width: '600px'
      })

      if (!isConfirmed) return
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูลออเดอร์ได้',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    // Import stock
    try {
      Swal.fire({
        title: 'กำลังนำเข้าสต็อก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const result = await franchiseStockService.importFromOrder(branchId, orderId, user.email)
      
      const successCount = result.results.filter(r => r.success).length
      const failCount = result.results.filter(r => !r.success).length
      const bundleImported = result.results.filter(r => r.success && r.importSource === 'BUNDLE_IDS')
      const bundlePreviewHtml = bundleImported.slice(0, 8).map((r, idx) => (
        `<li>${idx + 1}. ${r.productId || '-'} - ${r.productName || '-'} (x${r.quantity || 0})</li>`
      )).join('')
      const bundleMoreCount = Math.max(0, bundleImported.length - 8)
      const failedItems = result.results.filter(r => !r.success)
      const failedPreviewHtml = failedItems.slice(0, 8).map((r, idx) => (
        `<li>${idx + 1}. ${r.productName || r.productId || '-'} (x${r.quantity || 0}) - ${r.error || 'ไม่ทราบสาเหตุ'}</li>`
      )).join('')
      const failedMoreCount = Math.max(0, failedItems.length - 8)

      Swal.fire({
        icon: successCount > 0 ? 'success' : 'warning',
        title: successCount > 0 ? 'สำเร็จ' : 'ไม่สามารถนำเข้าได้',
        html: `
          <div class="text-left">
            <p>นำเข้าสำเร็จ: ${successCount} รายการ</p>
            ${failCount > 0 ? `<p class="text-red-600">ไม่สำเร็จ: ${failCount} รายการ</p>` : ''}
            ${bundleImported.length > 0 ? `
              <div style="margin-top:10px; padding-top:10px; border-top:1px solid #e5e7eb;">
                <p style="font-weight:600; margin-bottom:6px;">นำเข้าจาก BUNDLE_IDS: ${bundleImported.length} รายการ</p>
                <ul style="padding-left:18px; margin:0; max-height:160px; overflow:auto;">
                  ${bundlePreviewHtml}
                </ul>
                ${bundleMoreCount > 0 ? `<p style="margin-top:6px; color:#6b7280;">...และอีก ${bundleMoreCount} รายการ</p>` : ''}
              </div>
            ` : ''}
            ${failedItems.length > 0 ? `
              <div style="margin-top:10px; padding-top:10px; border-top:1px solid #e5e7eb;">
                <p style="font-weight:600; margin-bottom:6px; color:#b91c1c;">รายละเอียดรายการที่ไม่สำเร็จ</p>
                <ul style="padding-left:18px; margin:0; max-height:170px; overflow:auto; color:#b91c1c;">
                  ${failedPreviewHtml}
                </ul>
                ${failedMoreCount > 0 ? `<p style="margin-top:6px; color:#6b7280;">...และอีก ${failedMoreCount} รายการ</p>` : ''}
              </div>
            ` : ''}
          </div>
        `,
        timer: failCount > 0 ? undefined : 2400,
        showConfirmButton: true
      })

      fetchStock()
      fetchOrders() // Refresh orders to update import status
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถนำเข้าสต็อกได้'
      })
    }
  }

  const handleAutoCreatePO = async () => {
    // สินค้าหน้าหลัก (ส่งออเดอร์/ชำระเงินได้)
    const selectedItemsMain = filteredStockItems.filter(item => {
      const isSelected = selectedProducts.has(item.productid)
      const isCustom = item.iscustom || item.isCustom || false
      return isSelected && !isCustom
    })
    // สินค้าซัพนอก (สร้าง PO เพื่อพิมพ์บิล/ซื้อเอง ไม่ไปชำระเงิน)
    const selectedItemsOther = filteredStockItems.filter(item => {
      const isSelected = selectedProducts.has(item.productid)
      const isCustom = item.iscustom || item.isCustom || false
      return isSelected && isCustom
    })

    const getOrderQty = (item) => {
      return orderQuantities[item.productid] ?? (() => {
        const minStock = Number(item.minstock) || 5
        const currentStock = Number(item.stock) || 0
        return Math.max(minStock * 2 - currentStock, minStock)
      })()
    }

    if (selectedItemsMain.length === 0 && selectedItemsOther.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกสินค้า',
        text: 'กรุณาเลือกสินค้าที่ต้องการสร้าง PO'
      })
      return
    }

    // Group main products by supplier
    const itemsBySupplier = {}
    selectedItemsMain.forEach(item => {
      const supplier = item.product?.supplier || 'ไม่ระบุ'
      if (!itemsBySupplier[supplier]) itemsBySupplier[supplier] = []
      const orderQty = getOrderQty(item)
      if (orderQty > 0) {
        itemsBySupplier[supplier].push({
          productId: item.productid,
          productName: item.productname,
          qty: orderQty,
          price: item.product?.price || item.price || 0
        })
      }
    })
    const suppliers = Object.keys(itemsBySupplier).filter(s => itemsBySupplier[s].length > 0)

    // สินค้าซัพนอก → หนึ่ง PO "ซัพอื่นๆ" (พิมพ์บิล/ซื้อเอง)
    const otherItems = selectedItemsOther
      .map(item => ({ item, orderQty: getOrderQty(item) }))
      .filter(({ orderQty }) => orderQty > 0)
      .map(({ item, orderQty }) => ({
        productId: item.productid,
        productName: item.productname,
        qty: orderQty,
        price: Number(item.price) || 0
      }))

    if (suppliers.length === 0 && otherItems.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีสินค้าที่เลือก',
        text: 'กรุณาเลือกสินค้าที่มีจำนวนสั่งมากกว่า 0'
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังสร้าง PO...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      let createdCount = 0
      for (const supplier of suppliers) {
        await poService.createPO({
          supplier,
          items: itemsBySupplier[supplier],
          expectedDate: '',
          notes: `สร้างจาก Stock Alert - ${new Date().toLocaleDateString('th-TH')}`,
          isFranchise: true,
          branchId: branchId
        }, user.email, user)
        createdCount++
      }
      if (otherItems.length > 0) {
        await poService.createPO({
          supplier: 'ซัพอื่นๆ',
          items: otherItems,
          expectedDate: '',
          notes: `สร้างจาก Stock Alert (ซื้อเอง) - ${new Date().toLocaleDateString('th-TH')}`,
          isFranchise: true,
          branchId: branchId,
          isOtherSupplier: true
        }, user.email, user)
        createdCount++
      }

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: `สร้าง PO เรียบร้อย ${createdCount} รายการ${otherItems.length > 0 ? ' (รวม PO ซัพอื่นๆ สำหรับพิมพ์บิล/ซื้อเอง)' : ''}`,
        timer: 2000,
        showConfirmButton: false
      })

      setSelectedProducts(new Set())
      setOrderQuantities({})
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสร้าง PO ได้'
      })
    }
  }

  const orderOtherSupplierSupplierOptions = useMemo(() => {
    const s = new Set((orderOtherSupplierList || []).map(p => (p.supplier || 'ซัพอื่นๆ').toString().trim() || 'ซัพอื่นๆ'))
    return Array.from(s).sort()
  }, [orderOtherSupplierList])

  const filteredOrderOtherSupplierList = useMemo(() => {
    if (orderOtherSupplierSupplier !== 'All' && currentSupplierLocked && !currentSupplierUnlocked) return []
    const list = orderOtherSupplierList || []
    let out = list
    if (orderOtherSupplierSupplier !== 'All') {
      out = out.filter(p => ((p.supplier || 'ซัพอื่นๆ').toString().trim() || 'ซัพอื่นๆ') === orderOtherSupplierSupplier)
    } else {
      // มุมมอง "ทั้งหมด" — ซ่อนสินค้าจากซัพที่ถูกล็อกและยังไม่ได้ใส่ PIN
      out = out.filter((p) => {
        const sup = (p.supplier || 'ซัพอื่นๆ').toString().trim() || 'ซัพอื่นๆ'
        const isLocked = lockedSupplierNames.some((l) => (l || '').toString().trim() === sup)
        if (isLocked && !supplierPinLockService.isUnlockedInSession(sup)) return false
        return true
      })
    }
    if (orderOtherSupplierSearch.trim()) {
      const q = orderOtherSupplierSearch.toLowerCase().trim()
      out = out.filter(p =>
        (p.productname || p.name || '').toLowerCase().includes(q) ||
        (p.productid || p.id || '').toString().toLowerCase().includes(q) ||
        (p.supplier || '').toLowerCase().includes(q)
      )
    }
    return [...out].sort((a, b) => {
      const sa = (a.supplier || 'ซัพอื่นๆ').toLowerCase()
      const sb = (b.supplier || 'ซัพอื่นๆ').toLowerCase()
      if (sa !== sb) return sa.localeCompare(sb)
      return (a.productname || a.name || '').localeCompare(b.productname || b.name || '')
    })
  }, [orderOtherSupplierList, orderOtherSupplierSearch, orderOtherSupplierSupplier, currentSupplierLocked, currentSupplierUnlocked, lockedSupplierNames, unlockTrigger])

  const orderOtherSupplierCartItems = useMemo(() => {
    const list = orderOtherSupplierList || []
    return list
      .map((p) => {
        const id = p.productid || p.id
        const qty = Number(orderOtherSupplierQuantities[id]) || 0
        if (qty <= 0) return null
        const price = Number(p.price) || 0
        return {
          ...p,
          productId: id,
          qty,
          price,
          subtotal: qty * price,
          supplier: (p.supplier || 'ซัพอื่นๆ').toString().trim() || 'ซัพอื่นๆ'
        }
      })
      .filter(Boolean)
  }, [orderOtherSupplierList, orderOtherSupplierQuantities])

  const handleAddOtherSupplierToCart = (p) => {
    const productId = p.productid || p.id
    setOrderOtherSupplierQuantities((prev) => ({
      ...prev,
      [productId]: (Number(prev[productId]) || 0) + 1
    }))
  }

  const handleRemoveFromOtherSupplierCart = (productId) => {
    setOrderOtherSupplierQuantities((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }

  const handleClearOtherSupplierCart = () => {
    setOrderOtherSupplierQuantities({})
  }

  const handleOpenEditOtherSupplier = (p) => {
    setEditOtherSupplierProduct(p)
    setEditOtherSupplierImage(p.image || '')
    setEditOtherSupplierSupplier(p.supplier || 'ซัพอื่นๆ')
    setEditOtherSupplierPrice(Number(p.price) || 0)
    setEditOtherSupplierUnit(p.unit || 'ชิ้น')
    setEditOtherSupplierFile(null)
    setShowEditOtherSupplierModal(true)
  }

  const handleSaveEditOtherSupplier = async () => {
    if (!editOtherSupplierProduct) return
    const id = editOtherSupplierProduct.productid || editOtherSupplierProduct.id
    try {
      setOtherSupplierImageUploading(true)
      let imageUrl = (editOtherSupplierImage || '').trim() || null
      if (editOtherSupplierFile) {
        imageUrl = await imageService.uploadOtherSupplierProductImage(editOtherSupplierFile)
      }
      await otherSupplierProductsService.update(
        id,
        {
          image: imageUrl,
          supplier: editOtherSupplierSupplier || null,
          price: editOtherSupplierPrice,
          unit: editOtherSupplierUnit || 'ชิ้น'
        },
        { dbUuid: editOtherSupplierProduct.dbUuid || null }
      )
      const newSupplier = (editOtherSupplierSupplier || '').toString().trim() || 'ซัพอื่นๆ'
      const idStr = String(id ?? '')
      setOrderOtherSupplierList(prev => prev.map(p => {
        const pid = String(p.productid ?? p.id ?? '')
        if (pid !== idStr) return p
        return {
          ...p,
          supplier: newSupplier,
          price: editOtherSupplierPrice,
          unit: (editOtherSupplierUnit || 'ชิ้น').toString().trim() || 'ชิ้น',
          image: imageUrl !== undefined ? imageUrl : p.image
        }
      }))
      setShowEditOtherSupplierModal(false)
      setEditOtherSupplierProduct(null)
      setEditOtherSupplierFile(null)
      await fetchOrderOtherSupplierList()
      Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500 })
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message })
    } finally {
      setOtherSupplierImageUploading(false)
    }
  }

  const handleOpenAddOtherSupplier = () => {
    setNewOtherProductId('')
    setNewOtherProductName('')
    setNewOtherSupplier('ซัพอื่นๆ')
    setNewOtherPrice(0)
    setNewOtherUnit('ชิ้น')
    setNewOtherImage('')
    setNewOtherSupplierFile(null)
    setShowAddOtherSupplierModal(true)
  }

  const handleSaveAddOtherSupplier = async () => {
    const id = (newOtherProductId || '').trim()
    const name = (newOtherProductName || '').trim()
    if (!id || !name) {
      Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสและชื่อสินค้า' })
      return
    }
    try {
      setOtherSupplierImageUploading(true)
      let imageUrl = (newOtherImage || '').trim() || null
      if (newOtherSupplierFile) {
        imageUrl = await imageService.uploadOtherSupplierProductImage(newOtherSupplierFile)
      }
      await otherSupplierProductsService.create({
        productid: id,
        productname: name,
        supplier: newOtherSupplier || null,
        price: newOtherPrice,
        unit: newOtherUnit || 'ชิ้น',
        image: imageUrl
      })
      Swal.fire({ icon: 'success', title: 'เพิ่มสินค้าเรียบร้อย', timer: 1500 })
      setShowAddOtherSupplierModal(false)
      setNewOtherSupplierFile(null)
      fetchOrderOtherSupplierList()
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message })
    } finally {
      setOtherSupplierImageUploading(false)
    }
  }

  const HEADER_TO_KEY = {
    productid: 'productid',
    รหัส: 'productid',
    id: 'productid',
    ID: 'productid',
    productname: 'productname',
    ชื่อสินค้า: 'productname',
    name: 'productname',
    Name: 'productname',
    stock: 'stock',
    สต็อก: 'stock',
    Stock: 'stock',
    minstock: 'minstock',
    ขั้นต่ำ: 'minstock',
    min: 'minstock',
    Min: 'minstock',
    price: 'price',
    ราคา: 'price',
    Price: 'price',
    supplier: 'supplier',
    ซัพพลาย: 'supplier',
    Supplier: 'supplier',
    image: 'image',
    รูป: 'image',
    Image: 'image',
    unit: 'unit',
    หน่วย: 'unit',
    Unit: 'unit'
  }

  const parseCsvLine = (line) => {
    const out = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        let end = line.indexOf('"', i + 1)
        if (end === -1) end = line.length
        out.push(line.slice(i + 1, end).replace(/""/g, '"').trim())
        i = end + 1
        if (line[i] === ',') i++
      } else {
        const comma = line.indexOf(',', i)
        const end = comma === -1 ? line.length : comma
        out.push(line.slice(i, end).trim())
        i = end + (comma === -1 ? 0 : 1)
      }
    }
    return out
  }

  const handleImportOtherSupplierCsv = async (e) => {
    const file = e?.target?.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      Swal.fire({ icon: 'warning', title: 'กรุณาเลือกไฟล์ .csv' })
      return
    }
    try {
      let text = await file.text()
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) {
        Swal.fire({ icon: 'warning', title: 'ไฟล์ CSV ต้องมีหัวคอลัมน์และอย่างน้อย 1 แถวข้อมูล' })
        return
      }
      const headerLine = parseCsvLine(lines[0]).map(c => c.replace(/^\uFEFF/, ''))
      const headers = headerLine.map(h => HEADER_TO_KEY[h] || h.toLowerCase().replace(/\s/g, ''))
      const rows = []
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i])
        const row = {}
        headers.forEach((key, j) => {
          if (key && cells[j] !== undefined) row[key] = cells[j]
        })
        if (row.productid || row.productname) rows.push(row)
      }
      if (rows.length === 0) {
        Swal.fire({ icon: 'warning', title: 'ไม่พบแถวข้อมูลที่ใช้ได้ (ต้องมีรหัสหรือชื่อสินค้า)' })
        return
      }
      Swal.fire({ title: `กำลังนำเข้า ${rows.length} รายการ...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const { count } = await otherSupplierProductsService.upsertBulk(rows)
      await fetchOrderOtherSupplierList()
      Swal.fire({ icon: 'success', title: 'นำเข้าเรียบร้อย', text: `อัปเดต/เพิ่ม ${count} รายการ` })
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'นำเข้าไม่สำเร็จ', text: err.message })
    }
  }

  const handleSubmitSupplierPin = async () => {
    const pin = (supplierPinValue || '').trim()
    const supplier = (orderOtherSupplierSupplier || '').toString().trim()
    if (!pin || !supplier) {
      Swal.fire({ icon: 'warning', title: 'กรุณาใส่รหัส PIN' })
      return
    }
    try {
      setSupplierPinChecking(true)
      const ok = await supplierPinLockService.checkPin(supplier, pin)
      if (ok) {
        supplierPinLockService.markUnlocked(supplier)
        setUnlockTrigger((t) => t + 1)
        setShowSupplierPinModal(false)
        setSupplierPinValue('')
      } else {
        Swal.fire({ icon: 'error', title: 'รหัส PIN ไม่ถูกต้อง' })
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'ตรวจสอบไม่สำเร็จ', text: e.message })
    } finally {
      setSupplierPinChecking(false)
    }
  }

  const handleCreatePOFromOtherSupplier = async () => {
    const withQty = orderOtherSupplierCartItems.map((item) => ({
      productId: item.productId,
      productName: item.productname || item.name,
      qty: item.qty,
      price: item.price,
      supplier: item.supplier
    }))
    if (withQty.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวน',
        text: 'กรุณาใส่จำนวนสั่งอย่างน้อย 1 รายการ'
      })
      return
    }
    const bySupplier = {}
    withQty.forEach(item => {
      const s = item.supplier || 'ซัพอื่นๆ'
      if (!bySupplier[s]) bySupplier[s] = []
      bySupplier[s].push({ productId: item.productId, productName: item.productName, qty: item.qty, price: item.price })
    })
    const suppliers = Object.keys(bySupplier)
    try {
      Swal.fire({ title: 'กำลังสร้าง PO...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      for (const supplier of suppliers) {
        await poService.createPO({
          supplier,
          items: bySupplier[supplier],
          expectedDate: '',
          notes: `สั่งจากหน้าสั่งสินค้าซัพอื่น - ${new Date().toLocaleDateString('th-TH')}`,
          isFranchise: true,
          branchId: branchId,
          isOtherSupplier: true
        }, user?.email, user)
      }
      Swal.fire({
        icon: 'success',
        title: 'สร้าง PO เรียบร้อย',
        text: `สร้าง ${suppliers.length} PO แยกตามซัพพลาย (${withQty.length} รายการ) — ไปที่หน้า PO เพื่อพิมพ์บิลและรับสินค้าได้`,
        timer: 3000
      })
      setOrderOtherSupplierQuantities({})
      setOrderOtherSupplierList(prev => prev)
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสร้าง PO ได้'
      })
    }
  }

  const fetchAvailableProducts = async () => {
    try {
      // Fetch current stock first to get latest data
      const currentStock = await franchiseStockService.getFranchiseStock(branchId, '')
      
      // Get all products
      const products = await productService.getAllProducts(user, '')
      
      // Filter out products that are already in franchise stock
      const existingProductIds = new Set(
        currentStock.map(item => {
          // Try multiple column name variations
          return item.productid || item.ProductID || item.productId || ''
        }).filter(id => id) // Remove empty strings
      )
      
      console.log('[FranchiseStockManagement] Existing product IDs:', Array.from(existingProductIds))
      console.log('[FranchiseStockManagement] All products count:', products.length)
      
      const available = products.filter(p => {
        const productId = p.id || p.ProductID || ''
        const isAvailable = !existingProductIds.has(productId)
        console.log('[FranchiseStockManagement] Product:', productId, 'Available:', isAvailable)
        return isAvailable
      })
      
      console.log('[FranchiseStockManagement] Available products count:', available.length)
      setAvailableProducts(available)
    } catch (error) {
      console.error('Error fetching available products:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลสินค้าได้'
      })
    }
  }

  const fetchOtherSupplierProducts = async () => {
    try {
      const currentStock = await franchiseStockService.getFranchiseStock(branchId, '')
      const existingProductIds = new Set(
        currentStock.map(item => (item.productid || item.ProductID || item.productId || '').toString().trim()).filter(Boolean)
      )
      const all = await otherSupplierProductsService.getAll()
      const available = all.filter(p => !existingProductIds.has((p.id || p.productid || '').toString().trim()))
      setOtherSupplierProducts(available)
    } catch (error) {
      console.error('Error fetching other supplier products:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงรายการสินค้าซัพนอกได้'
      })
      setOtherSupplierProducts([])
    }
  }

  const handleAddProductFromOtherSupplier = async () => {
    if (selectedProductsForAdd.size === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกสินค้า',
        text: 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'
      })
      return
    }
    const invalidProducts = []
    selectedProductsForAdd.forEach(productId => {
      const qty = productQuantities[productId]
      if (!qty || (qty.stock !== undefined && qty.stock !== '' && Number(qty.stock) < 0)) {
        invalidProducts.push(productId)
      }
    })
    if (invalidProducts.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'จำนวนไม่ถูกต้อง',
        text: 'กรุณาตรวจสอบจำนวนสต๊อกเริ่มต้นของสินค้าทั้งหมด'
      })
      return
    }
    try {
      Swal.fire({
        title: `กำลังเพิ่มสินค้า ${selectedProductsForAdd.size} รายการ...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })
      const results = []
      for (const productId of selectedProductsForAdd) {
        const product = otherSupplierProducts.find(p => (p.id || p.productid) === productId)
        const qty = productQuantities[productId] || { stock: 0, minStock: 5 }
        const initialStock = Number(qty.stock) || 0
        const initialMinStock = Number(qty.minStock) ?? 5
        const productName = product?.name || product?.ProductName || product?.productname || productId
        const price = Number(product?.price) || 0
        try {
          await franchiseStockService.addProductFromOtherSupplier(
            branchId,
            productId,
            productName,
            price,
            initialStock,
            initialMinStock,
            user.email
          )
          results.push({ productId, success: true })
        } catch (error) {
          results.push({ productId, success: false, error: error.message })
        }
      }
      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length
      Swal.fire({
        icon: successCount > 0 ? 'success' : 'error',
        title: successCount > 0 ? 'เพิ่มสินค้าสำเร็จ' : 'เกิดข้อผิดพลาด',
        html: `
          <div class="text-left">
            <p>เพิ่มสำเร็จ: ${successCount} รายการ</p>
            ${failCount > 0 ? `<p class="text-red-600">ไม่สำเร็จ: ${failCount} รายการ</p>` : ''}
          </div>
        `,
        timer: 3000,
        showConfirmButton: true
      })
      setSelectedProductsForAdd(new Set())
      setProductQuantities({})
      setProductSearchTerm('')
      setShowAddProductModal(false)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มสินค้าได้'
      })
    }
  }

  const handleAddProductFromMain = async () => {
    if (selectedProductsForAdd.size === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกสินค้า',
        text: 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'
      })
      return
    }

    // Validate quantities
    const invalidProducts = []
    selectedProductsForAdd.forEach(productId => {
      const qty = productQuantities[productId]
      if (!qty || qty.stock < 0) {
        invalidProducts.push(productId)
      }
    })

    if (invalidProducts.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'จำนวนไม่ถูกต้อง',
        text: 'กรุณาตรวจสอบจำนวนสต๊อกเริ่มต้นของสินค้าทั้งหมด'
      })
      return
    }

    try {
      Swal.fire({
        title: `กำลังเพิ่มสินค้า ${selectedProductsForAdd.size} รายการ...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const results = []
      for (const productId of selectedProductsForAdd) {
        const qty = productQuantities[productId] || { stock: 0, minStock: 5 }
        try {
          await franchiseStockService.addProductFromMain(
            branchId,
            productId,
            qty.stock || 0,
            qty.minStock || 5,
            user.email
          )
          results.push({ productId, success: true })
        } catch (error) {
          results.push({ productId, success: false, error: error.message })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length

      Swal.fire({
        icon: successCount > 0 ? 'success' : 'error',
        title: successCount > 0 ? 'เพิ่มสินค้าสำเร็จ' : 'เกิดข้อผิดพลาด',
        html: `
          <div class="text-left">
            <p>เพิ่มสำเร็จ: ${successCount} รายการ</p>
            ${failCount > 0 ? `<p class="text-red-600">ไม่สำเร็จ: ${failCount} รายการ</p>` : ''}
          </div>
        `,
        timer: 3000,
        showConfirmButton: true
      })

      // Reset form
      setSelectedProductsForAdd(new Set())
      setProductQuantities({})
      setProductSearchTerm('')
      setShowAddProductModal(false)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มสินค้าได้'
      })
    }
  }

  const handleAddCustomProduct = async () => {
    if (!customProductId || !customProductName || !branchId) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูลให้ครบ',
        text: 'กรุณากรอก Product ID และชื่อสินค้า'
      })
      return
    }

    if (initialStock < 0) {
      Swal.fire({
        icon: 'warning',
        title: 'จำนวนไม่ถูกต้อง',
        text: 'จำนวนสต๊อกต้องมากกว่าหรือเท่ากับ 0'
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังเพิ่มสินค้า...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      await franchiseStockService.addCustomProduct(
        branchId,
        customProductId,
        customProductName,
        customProductPrice,
        initialStock,
        initialMinStock,
        user.email
      )

      Swal.fire({
        icon: 'success',
        title: 'เพิ่มสินค้าสำเร็จ',
        html: 'สินค้าถูกเพิ่มเข้าในสต็อกแล้ว<br><small class="text-gray-600">หมายเหตุ: สินค้านี้ไม่สามารถสร้าง PO ได้เนื่องจากไม่มีในหน้าหลัก</small>',
        timer: 3000,
        showConfirmButton: true
      })

      // Reset form
      setCustomProductId('')
      setCustomProductName('')
      setCustomProductPrice(0)
      setInitialStock(0)
      setInitialMinStock(5)
      setShowAddProductModal(false)
      fetchStock()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มสินค้าได้'
      })
    }
  }

  const handleOpenCloneModal = () => setShowCloneModal(true)

  const handleCloneSubmit = async () => {
    const source = (cloneSourceBranchId || '').toString().trim()
    if (!source) {
      Swal.fire({ icon: 'warning', title: 'กรุณาเลือกสาขาต้นแบบ', text: 'เช่น SA000' })
      return
    }
    if (!branchId) return
    setCloneLoading(true)
    try {
      const result = await franchiseStockService.cloneFranchiseStockFromBranch(source, branchId, user?.email ?? '')
      setShowCloneModal(false)
      setCloneSourceBranchId('')
      fetchStock()
      const errMsg = result.errors?.length ? `\nข้อผิดพลาด: ${result.errors.slice(0, 3).join('; ')}${result.errors.length > 3 ? ' ...' : ''}` : ''
      Swal.fire({
        icon: 'success',
        title: 'โคลนรายการเสร็จแล้ว',
        html: `เพิ่ม <b>${result.added}</b> รายการ, ข้าม (มีอยู่แล้ว) <b>${result.skipped}</b> รายการ${errMsg}`
      })
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'โคลนไม่สำเร็จ',
        text: error.message || 'ไม่สามารถโคลนรายการได้'
      })
    } finally {
      setCloneLoading(false)
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
          <h1 className="text-3xl font-bold text-gray-900 mb-6">จัดการสต็อกแฟรนไชส์</h1>

          {/* สรุปจำนวนรายการสินค้าและจำนวนซัพพลาย */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Icon icon="fa-boxes" className="text-emerald-600 text-xl" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">รายการสินค้าในสต็อกทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">{stockSummary.totalItems.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Icon icon="fa-truck" className="text-blue-600 text-xl" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">จำนวนซัพพลาย</p>
                <p className="text-2xl font-bold text-gray-900">{stockSummary.supplierCount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm mb-6">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => handleActiveTabChange('stock')}
                className={`px-6 py-3 font-medium ${activeTab === 'stock' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                สต็อกทั้งหมด
              </button>
              <button
                onClick={() => handleActiveTabChange('lowStock')}
                className={`px-6 py-3 font-medium relative ${activeTab === 'lowStock' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                แจ้งเตือนสต็อกต่ำ
                {lowStockItems.length > 0 && (
                  <span className="ml-2 bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {lowStockItems.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleActiveTabChange('importOrder')}
                className={`px-6 py-3 font-medium ${activeTab === 'importOrder' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                นำเข้าจากออเดอร์
              </button>
              <button
                onClick={() => handleActiveTabChange('orderOtherSupplier')}
                className={`px-6 py-3 font-medium ${activeTab === 'orderOtherSupplier' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                สั่งสินค้าซัพอื่น
              </button>
            </div>
          </div>

          {/* Search and Actions */}
          <div className={`bg-white rounded-lg shadow-sm p-4 mb-6 sticky top-16 z-40 border-b border-gray-200 ${activeTab === 'orderOtherSupplier' ? 'border-gray-100' : ''}`}>
            <div className="flex flex-col md:flex-row gap-4">
              {activeTab !== 'orderOtherSupplier' && (
                <div className="flex-1 space-y-2">
                  {(activeTab === 'stock' || activeTab === 'lowStock') && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleStockViewModeChange(STOCK_VIEW_ALL)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                          stockViewMode === STOCK_VIEW_ALL
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Icon icon="fa-list" />
                        ทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStockViewModeChange(STOCK_VIEW_BY_SUPPLIER)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                          stockViewMode === STOCK_VIEW_BY_SUPPLIER
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Icon icon="fa-truck" />
                        ตามซัพพลาย
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder={
                        (activeTab === 'stock' || activeTab === 'lowStock') &&
                        stockViewMode === STOCK_VIEW_BY_SUPPLIER &&
                        !selectedSupplier
                          ? 'ค้นหาชื่อซัพพลายเออร์...'
                          : (activeTab === 'stock' || activeTab === 'lowStock') &&
                              stockViewMode === STOCK_VIEW_BY_SUPPLIER &&
                              selectedSupplier
                            ? `ค้นหาสินค้าใน "${selectedSupplier}"...`
                            : 'ค้นหาสินค้า...'
                      }
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}
              {activeTab === 'orderOtherSupplier' && (
                <>
                  <input
                    ref={orderOtherSupplierCsvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleImportOtherSupplierCsv}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleOpenAddOtherSupplier}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 font-medium"
                  >
                    <Icon icon="fa-plus" />
                    เพิ่มสินค้า
                  </button>
                  <button
                    type="button"
                    onClick={() => orderOtherSupplierCsvInputRef.current?.click()}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition flex items-center gap-2 font-medium"
                  >
                    <Icon icon="fa-file-import" />
                    นำเข้าจาก CSV
                  </button>
                  <button
                    type="button"
                    onClick={fetchOrderOtherSupplierList}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2 font-medium"
                  >
                    <Icon icon="fa-sync-alt" />
                    Refresh
                  </button>
                </>
              )}
              {activeTab === 'lowStock' && (
                <button
                  onClick={handleAutoCreatePO}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 font-medium"
                >
                  <Icon icon="fa-shopping-cart" />
                  สร้าง PO อัตโนมัติ
                </button>
              )}
              {activeTab !== 'orderOtherSupplier' && (
                <>
                  <button
                    onClick={() => setShowAddProductModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 font-medium"
                  >
                    <Icon icon="fa-plus" />
                    เพิ่มสินค้า
                  </button>
                  <button
                    onClick={fetchStock}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2 font-medium"
                  >
                    <Icon icon="fa-sync-alt" />
                    Refresh
                  </button>
                  <button
                    onClick={handleOpenCloneModal}
                    className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition flex items-center gap-2 font-medium"
                  >
                    <Icon icon="fa-copy" />
                    โคลนจากสาขา
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <LoadingSpinner />
          ) : activeTab === 'orderOtherSupplier' ? (
            <div className="space-y-6">
              <div className="sticky top-[4.5rem] z-30 flex flex-col gap-4 mb-2 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative">
                  <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={orderOtherSupplierSearch}
                    onChange={(e) => setOrderOtherSupplierSearch(e.target.value)}
                    placeholder="ค้นหาชื่อสินค้า..."
                    className="w-full pl-10 pr-4 p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-gray-800 outline-none transition"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  <button
                    type="button"
                    onClick={() => setOrderOtherSupplierSupplier('All')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      orderOtherSupplierSupplier === 'All'
                        ? 'bg-gray-800 text-white shadow'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {orderOtherSupplierSupplierOptions.map((sup) => (
                    <button
                      key={sup}
                      type="button"
                      onClick={() => setOrderOtherSupplierSupplier(sup)}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        orderOtherSupplierSupplier === sup
                          ? 'bg-gray-800 text-white shadow'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {sup}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <select
                    className="w-full p-2 pl-3 pr-10 border rounded-lg bg-gray-50 text-sm appearance-none outline-none focus:ring-2 focus:ring-gray-800 transition text-gray-700"
                    value={orderOtherSupplierSupplier}
                    onChange={(e) => setOrderOtherSupplierSupplier(e.target.value)}
                  >
                    <option value="All">ร้านค้า/ซัพพลายเออร์ทั้งหมด</option>
                    {orderOtherSupplierSupplierOptions.map((sup) => (
                      <option key={sup} value={sup}>
                        {sup}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                    <Icon icon="fa-chevron-down" className="text-xs" />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  ใส่จำนวนสั่งในการ์ด รายการจะขึ้นในตะกร้าซัพนอก — แก้ไขจำนวนได้ในตะกร้าด้านล่าง แล้วกด &quot;สร้าง PO (สั่งที่เลือก)&quot; ที่ตะกร้าเพื่อไปหน้า PO พิมพ์บิลและรับสินค้า
                </p>
              </div>

              {orderOtherSupplierCartItems.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Icon icon="fa-shopping-cart" className="text-emerald-600" />
                      ตะกร้าสินค้าซัพนอก ({orderOtherSupplierCartItems.length} รายการ)
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleClearOtherSupplierCart}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
                      >
                        ล้างตะกร้า
                      </button>
                      <button
                        type="button"
                        onClick={handleCreatePOFromOtherSupplier}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700"
                      >
                        สร้าง PO (สั่งที่เลือก)
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">สินค้า</th>
                          <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">ซัพพลาย</th>
                          <th className="px-4 py-2 text-center text-xs font-bold text-gray-600">จำนวน</th>
                          <th className="px-4 py-2 text-right text-xs font-bold text-gray-600">ราคา/หน่วย</th>
                          <th className="px-4 py-2 text-right text-xs font-bold text-gray-600">รวม</th>
                          <th className="px-4 py-2 w-12" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orderOtherSupplierCartItems.map((item) => (
                          <tr key={item.productId} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2">
                              <span className="font-medium text-gray-900">{getOrderItemDisplayName(item.productname || item.name)}</span>
                              <span className="text-gray-400 ml-1">({item.productId})</span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{item.supplier}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                value={orderOtherSupplierQuantities[item.productId] ?? item.qty}
                                onChange={(e) => {
                                  const v = handleNumberInput(e.target.value, false)
                                  setOrderOtherSupplierQuantities((prev) => {
                                    if (v <= 0) {
                                      const next = { ...prev }
                                      delete next[item.productId]
                                      return next
                                    }
                                    return { ...prev, [item.productId]: v }
                                  })
                                }}
                                className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                              />
                            </td>
                            <td className="px-4 py-2 text-right">฿{item.price.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-medium text-emerald-600">฿{item.subtotal.toLocaleString()}</td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveFromOtherSupplierCart(item.productId)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                title="ลบออกจากตะกร้า"
                              >
                                <Icon icon="fa-trash-alt" className="text-sm" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end items-center gap-4">
                    <span className="text-gray-600">
                      ยอดรวม <strong className="text-lg text-emerald-600">
                        ฿{orderOtherSupplierCartItems.reduce((sum, i) => sum + i.subtotal, 0).toLocaleString()}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleCreatePOFromOtherSupplier}
                      className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700"
                    >
                      สร้าง PO (สั่งที่เลือก)
                    </button>
                  </div>
                </div>
              )}

              {orderOtherSupplierLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
                  <p className="mt-4 text-gray-600">กำลังโหลดสินค้า...</p>
                </div>
              ) : filteredOrderOtherSupplierList.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                  {currentSupplierLocked && !currentSupplierUnlocked ? (
                    <>
                      <Icon icon="fa-lock" className="text-5xl text-amber-400 mb-4" />
                      <p className="text-gray-600 mb-2">ซัพพลายนี้ถูกล็อก</p>
                      <p className="text-sm text-gray-500">กรุณาใส่รหัส PIN ในหน้าต่างที่แสดงเพื่อดูรายการสินค้า</p>
                    </>
                  ) : (
                    <>
                      <Icon icon="fa-box-open" className="text-5xl text-gray-300 mb-4" />
                      <p className="text-gray-600">
                        {orderOtherSupplierSearch.trim() || orderOtherSupplierSupplier !== 'All'
                          ? 'ไม่พบสินค้าที่ค้นหา'
                          : 'ไม่มีรายการสินค้าซัพนอก'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div id="orderOtherSupplierGrid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-8">
                  {filteredOrderOtherSupplierList.map((p) => {
                    const id = p.productid || p.id
                    const supplier = p.supplier || 'ซัพอื่นๆ'
                    return (
                      <div
                        key={id}
                        className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col"
                      >
                        <div className="aspect-square bg-gray-100 relative flex items-center justify-center overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Icon icon="fa-box-open" className="text-5xl text-gray-200" />
                          </div>
                          {p.image ? <OtherSupplierCardImage imageUrl={p.image} /> : null}
                          <span className="absolute bottom-2 left-2 right-2 text-center text-[10px] font-medium text-emerald-800 bg-emerald-50/95 px-2 py-1 rounded-lg truncate z-10">
                            {supplier}
                          </span>
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 min-h-[2.5rem]">
                            {p.productname || p.name}
                          </h3>
                          <p className="text-xs text-gray-400 mb-3">{id}</p>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <p className="text-2xl font-bold text-emerald-600">
                                ฿{(Number(p.price) || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500">ต่อ {p.unit || 'ชิ้น'}</p>
                              <p className="text-xs text-gray-500">ราคาซัพนอก</p>
                            </div>
                            <span className="text-xs text-gray-500 text-right shrink-0">
                              <Icon icon="fa-truck" className="mr-0.5" />
                              {supplier}
                            </span>
                          </div>
                          <div className="flex gap-2 mb-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleOpenEditOtherSupplier(p) }}
                              className="flex-1 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                            >
                              แก้ไข
                            </button>
                          </div>
                          <label className="text-xs text-gray-500 mb-1">จำนวนสั่ง</label>
                          <input
                            type="number"
                            min="0"
                            value={orderOtherSupplierQuantities[id] ?? ''}
                            onChange={(e) => {
                              const v = handleNumberInput(e.target.value, false)
                              setOrderOtherSupplierQuantities((prev) => ({ ...prev, [id]: v }))
                            }}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'importOrder' ? (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">ออเดอร์ที่จัดส่งแล้ว</h2>
                {orders.length === 0 ? (
                  <p className="text-gray-500">ไม่มีออเดอร์ที่จัดส่งแล้ว</p>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => {
                      const orderId = order.ID || order.OrderID
                      const isImported = order.isImported || false
                      
                      return (
                        <div key={orderId} className={`border rounded-lg p-4 ${isImported ? 'bg-gray-50 border-gray-300' : 'border-gray-200'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-bold">ออเดอร์: {orderId}</p>
                                {isImported && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                                    นำเข้าแล้ว
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                {new Date(order.Timestamp || order.timestamp || order.CreatedAt).toLocaleDateString('th-TH')}
                              </p>
                              {order.Items && order.Items.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {order.Items.length} รายการ
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleImportFromOrder(order)}
                              disabled={isImported}
                              className={`px-4 py-2 rounded-lg transition ${
                                isImported
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              {isImported ? 'นำเข้าแล้ว' : 'นำเข้าสต็อก'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : !showStockTable ? (
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                เลือกซัพพลายเออร์เพื่อดูและจัดการสต็อกสินค้าของซัพนั้น
              </p>
              {supplierCardsFiltered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
                  <Icon icon="fa-truck" className="text-4xl text-gray-300 mb-3 block mx-auto" />
                  <p>ไม่พบซัพพลายที่ตรงกับคำค้นหา</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {supplierCardsFiltered.map((sup) => (
                    <button
                      key={sup.name}
                      type="button"
                      onClick={() => handleSelectSupplier(sup.name)}
                      className="group text-left bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-300 hover:bg-emerald-50/30 transition"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                          <Icon icon="fa-store" className="text-lg" />
                        </div>
                        <Icon
                          icon="fa-chevron-right"
                          className="text-gray-300 group-hover:text-emerald-600 mt-1"
                        />
                      </div>
                      <h3 className="font-bold text-gray-900 line-clamp-2 min-h-[2.75rem] leading-snug">
                        {sup.name}
                      </h3>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>จำนวนสินค้า</span>
                          <span className="font-semibold text-gray-900">
                            {sup.productCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>สต็อกรวม</span>
                          <span className="font-semibold text-gray-900">
                            {Math.round(sup.totalStock).toLocaleString()}
                          </span>
                        </div>
                        {sup.lowStockCount > 0 && (
                          <p className="text-xs font-semibold text-red-600 pt-1">
                            ใกล้หมด / ต่ำ {sup.lowStockCount.toLocaleString()} รายการ
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBackToSuppliers}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    <Icon icon="fa-arrow-left" />
                    กลับรายการซัพพลาย
                  </button>
                  <span className="text-sm text-gray-500">/</span>
                  <span className="text-sm font-bold text-emerald-800">{selectedSupplier}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {filteredStockItems.length.toLocaleString()} รายการสินค้า
                  </span>
                </div>
              )}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {activeTab === 'lowStock' && (
                        <th className="px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedProducts.size === filteredStockItems.length && filteredStockItems.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProducts(new Set(filteredStockItems.map(item => item.productid)))
                              } else {
                                setSelectedProducts(new Set())
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">สินค้า</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">สต็อก</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">ขั้นต่ำ</th>
                      {activeTab === 'lowStock' && (
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">จำนวนสั่ง</th>
                      )}
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredStockItems.length === 0 ? (
                      <tr>
                        <td colSpan={activeTab === 'lowStock' ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                          ไม่พบข้อมูล
                        </td>
                      </tr>
                    ) : (
                      filteredStockItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          {activeTab === 'lowStock' && (
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedProducts.has(item.productid)}
                                onChange={(e) => {
                                  const newSet = new Set(selectedProducts)
                                  if (e.target.checked) {
                                    newSet.add(item.productid)
                                  } else {
                                    newSet.delete(item.productid)
                                  }
                                  setSelectedProducts(newSet)
                                }}
                                className="rounded"
                                title={item.iscustom || item.isCustom ? 'สร้าง PO เพื่อพิมพ์บิล/ซื้อเองได้' : ''}
                              />
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <div className="font-medium">{item.productname}</div>
                            <div className="text-sm text-gray-500">{item.productid}</div>
                            {(item.iscustom || item.isCustom) && (
                              <div className="text-xs text-blue-600 mt-1">
                                <Icon icon="fa-info-circle" className="inline mr-1" />
                                สินค้าเพิ่มเอง (สร้าง PO เพื่อพิมพ์บิล/ซื้อเองได้)
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-bold ${(item.stock || 0) <= (item.minstock || 5) ? 'text-red-600' : 'text-gray-900'}`}>
                              {item.stock || 0} {item.unit || 'ชิ้น'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-medium">{item.minstock || 5} {item.unit || 'ชิ้น'}</span>
                          </td>
                          {activeTab === 'lowStock' && (
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                min="0"
                                value={orderQuantities[item.productid] ?? ''}
                                onChange={(e) => {
                                  const qty = handleNumberInput(e.target.value, false)
                                  setOrderQuantities({ ...orderQuantities, [item.productid]: qty })
                                }}
                                placeholder="จำนวนสั่ง"
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                              />
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              <button
                                onClick={() => {
                                  setSelectedItem(item)
                                  setStockInQty(0)
                                  setStockNote('')
                                  setShowStockInModal(true)
                                }}
                                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700"
                              >
                                รับเข้า
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(item)
                                  setStockOutQty(0)
                                  setStockNote('')
                                  setShowStockOutModal(true)
                                }}
                                className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
                              >
                                เบิกออก
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(item)
                                  setMinStockValue(item.minstock || 5)
                                  setShowMinStockModal(true)
                                }}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700"
                              >
                                ตั้งขั้นต่ำ
                              </button>
                              {(item.iscustom || item.isCustom) && (
                                <button
                                  onClick={() => {
                                    setEditItem(item)
                                    setEditProductName(item.productname || '')
                                    setEditMinStock(item.minstock ?? 5)
                                    setEditPrice(item.price ?? 0)
                                    setShowEditModal(true)
                                  }}
                                  className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                                  title="แก้ไขสินค้าเพิ่มเอง"
                                >
                                  แก้ไข
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveFromStock(item)}
                                className="px-3 py-1 bg-gray-600 text-white rounded text-xs font-bold hover:bg-gray-700"
                                title={item.iscustom || item.isCustom ? 'ลบสินค้าเพิ่มเองออกจากรายการ' : 'ลบออกจากสต็อกแฟรนไชส์'}
                              >
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </div>
      </main>

      {/* Stock In Modal */}
      {showStockInModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">รับเข้าสต็อก: {selectedItem.productname}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">จำนวน</label>
                <input
                  type="number"
                  min="1"
                  value={stockInQty || ''}
                  onChange={(e) => {
                    const val = handleNumberInput(e.target.value, false)
                    setStockInQty(val)
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">หมายเหตุ</label>
                <textarea
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="หมายเหตุ (ถ้ามี)"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleStockIn}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700"
                >
                  ยืนยัน
                </button>
                <button
                  onClick={() => {
                    setShowStockInModal(false)
                    setSelectedItem(null)
                    setStockInQty(0)
                    setStockNote('')
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {showStockOutModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">เบิกออกสต็อก: {selectedItem.productname}</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">สต็อกปัจจุบัน: <span className="font-bold">{selectedItem.stock || 0} {selectedItem.unit || 'ชิ้น'}</span></p>
                <label className="block text-sm font-medium mb-2">จำนวน</label>
                <input
                  type="number"
                  min="1"
                  max={selectedItem.stock || 0}
                  value={stockOutQty || ''}
                  onChange={(e) => {
                    const val = handleNumberInput(e.target.value, false)
                    setStockOutQty(val)
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">หมายเหตุ</label>
                <textarea
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="หมายเหตุ (ถ้ามี)"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleStockOut}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700"
                >
                  ยืนยัน
                </button>
                <button
                  onClick={() => {
                    setShowStockOutModal(false)
                    setSelectedItem(null)
                    setStockOutQty(0)
                    setStockNote('')
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Custom Product Modal (สินค้าเพิ่มเองเท่านั้น) */}
      {showEditModal && editItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">แก้ไขสินค้าเพิ่มเอง</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">รหัสสินค้า (ไม่สามารถแก้ไขได้)</label>
                <input
                  type="text"
                  value={editItem.productid || ''}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg p-2 bg-gray-50 text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">ชื่อสินค้า *</label>
                <input
                  type="text"
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="ชื่อสินค้า"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">จำนวนขั้นต่ำ</label>
                <input
                  type="number"
                  min="0"
                  value={editMinStock ?? ''}
                  onChange={(e) => setEditMinStock(handleNumberInput(e.target.value, false))}
                  className="w-full border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">ราคา (บาท)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPrice ?? ''}
                  onChange={(e) => setEditPrice(handleNumberInput(e.target.value, true))}
                  className="w-full border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleEditCustomProduct}
                  className="flex-1 bg-amber-600 text-white py-2 rounded-lg font-bold hover:bg-amber-700"
                >
                  บันทึก
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditItem(null)
                    setEditProductName('')
                    setEditMinStock(5)
                    setEditPrice(0)
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Min Stock Modal */}
      {showMinStockModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">ตั้งจำนวนขั้นต่ำ: {selectedItem.productname}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">จำนวนขั้นต่ำ</label>
                <input
                  type="number"
                  min="0"
                  value={minStockValue || ''}
                  onChange={(e) => {
                    const val = handleNumberInput(e.target.value, false)
                    setMinStockValue(val)
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateMinStock}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700"
                >
                  ยืนยัน
                </button>
                <button
                  onClick={() => {
                    setShowMinStockModal(false)
                    setSelectedItem(null)
                    setMinStockValue(5)
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">เพิ่มสินค้า</h2>
              <button
                onClick={() => {
                  setShowAddProductModal(false)
                  setAddProductMode('fromMain')
                  setSelectedProductId('')
                  setSelectedProductsForAdd(new Set())
                  setProductQuantities({})
                  setProductSearchTerm('')
                  setOtherSupplierProducts([])
                  setCustomProductId('')
                  setCustomProductName('')
                  setCustomProductPrice(0)
                  setInitialStock(0)
                  setInitialMinStock(5)
                  setCsvRows([])
                  setCsvParseError(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <Icon icon="fa-times" />
              </button>
            </div>

            {/* Mode Selection */}
            <div className="flex gap-2 mb-6 flex-wrap">
              <button
                onClick={() => {
                  setAddProductMode('fromMain')
                  setSelectedProductsForAdd(new Set())
                  setProductQuantities({})
                  setProductSearchTerm('')
                  if (branchId) {
                    fetchAvailableProducts()
                  }
                }}
                className={`flex-1 min-w-0 px-3 py-2 rounded-lg font-bold transition text-sm ${
                  addProductMode === 'fromMain'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                เลือกจากหน้าหลัก
              </button>
              <button
                onClick={() => {
                  setAddProductMode('otherSupplier')
                  setSelectedProductsForAdd(new Set())
                  setProductQuantities({})
                  setProductSearchTerm('')
                  if (branchId) {
                    fetchOtherSupplierProducts()
                  }
                }}
                className={`flex-1 min-w-0 px-3 py-2 rounded-lg font-bold transition text-sm ${
                  addProductMode === 'otherSupplier'
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                เพิ่มสินค้าซัพอื่นๆ
              </button>
              <button
                onClick={() => setAddProductMode('custom')}
                className={`flex-1 min-w-0 px-3 py-2 rounded-lg font-bold transition text-sm ${
                  addProductMode === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                เพิ่มสินค้าใหม่เอง
              </button>
            </div>

            {addProductMode === 'fromMain' ? (
              <div className="space-y-4">
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium mb-2">ค้นหาสินค้า</label>
                  <div className="relative">
                    <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      placeholder="ค้นหาตามชื่อสินค้าหรือรหัสสินค้า..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Product List */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    เลือกสินค้า * ({selectedProductsForAdd.size} รายการที่เลือก)
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                    {availableProducts.length === 0 ? (
                      <p className="text-sm text-gray-500 p-4 text-center">
                        ไม่มีสินค้าที่สามารถเพิ่มได้ (สินค้าทั้งหมดถูกเพิ่มแล้ว)
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {availableProducts
                          .filter(product => {
                            if (!productSearchTerm.trim()) return true
                            const search = productSearchTerm.toLowerCase()
                            const name = (product.name || product.ProductName || '').toLowerCase()
                            const id = (product.id || product.ProductID || '').toLowerCase()
                            return name.includes(search) || id.includes(search)
                          })
                          .map(product => {
                            const productId = product.id || product.ProductID
                            const isSelected = selectedProductsForAdd.has(productId)
                            const qty = productQuantities[productId] || { stock: 0, minStock: 5 }

                            return (
                              <div key={productId} className={`p-3 hover:bg-gray-50 ${isSelected ? 'bg-emerald-50' : ''}`}>
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedProductsForAdd)
                                      if (e.target.checked) {
                                        newSet.add(productId)
                                        setProductQuantities({
                                          ...productQuantities,
                                          [productId]: { stock: 0, minStock: 5 }
                                        })
                                      } else {
                                        newSet.delete(productId)
                                        const newQuantities = { ...productQuantities }
                                        delete newQuantities[productId]
                                        setProductQuantities(newQuantities)
                                      }
                                      setSelectedProductsForAdd(newSet)
                                    }}
                                    className="mt-1 rounded"
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      {product.name || product.ProductName}
                                    </div>
                                    <div className="text-sm text-gray-500">{productId}</div>
                                    {isSelected && (
                                      <div className="mt-2 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <label className="text-xs text-gray-600 w-24">สต๊อกเริ่มต้น:</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={qty.stock || ''}
                                            onChange={(e) => {
                                              const val = handleNumberInput(e.target.value, false)
                                              setProductQuantities({
                                                ...productQuantities,
                                                [productId]: {
                                                  ...qty,
                                                  stock: val
                                                }
                                              })
                                            }}
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                            placeholder="0"
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <label className="text-xs text-gray-600 w-24">สต๊อกขั้นต่ำ:</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={qty.minStock || ''}
                                            onChange={(e) => {
                                              const val = handleNumberInput(e.target.value, false)
                                              setProductQuantities({
                                                ...productQuantities,
                                                [productId]: {
                                                  ...qty,
                                                  minStock: val || 5
                                                }
                                              })
                                            }}
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                            placeholder="5"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleAddProductFromMain}
                    disabled={selectedProductsForAdd.size === 0}
                    className={`flex-1 py-2 rounded-lg font-bold transition ${
                      selectedProductsForAdd.size === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    เพิ่มสินค้า ({selectedProductsForAdd.size} รายการ)
                  </button>
                  <button
                    onClick={() => {
                      setShowAddProductModal(false)
                      setSelectedProductsForAdd(new Set())
                      setProductQuantities({})
                      setProductSearchTerm('')
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : addProductMode === 'otherSupplier' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">ค้นหาสินค้า</label>
                  <div className="relative">
                    <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      placeholder="ค้นหาตามชื่อสินค้าหรือรหัสสินค้า..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    เลือกสินค้าจากรายการซัพอื่นๆ * ({selectedProductsForAdd.size} รายการที่เลือก)
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                    {otherSupplierProducts.length === 0 ? (
                      <p className="text-sm text-gray-500 p-4 text-center">
                        {productSearchTerm.trim() ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ไม่มีรายการสินค้าซัพนอก หรือเพิ่มครบแล้ว'}
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {otherSupplierProducts
                          .filter(product => {
                            if (!productSearchTerm.trim()) return true
                            const search = productSearchTerm.toLowerCase()
                            const name = (product.name || product.ProductName || product.productname || '').toLowerCase()
                            const id = (product.id || product.productid || product.ProductID || '').toLowerCase()
                            return name.includes(search) || id.includes(search)
                          })
                          .map(product => {
                            const productId = product.id || product.productid || product.ProductID
                            const isSelected = selectedProductsForAdd.has(productId)
                            const qty = productQuantities[productId] ?? { stock: product.stock ?? 0, minStock: product.minStock ?? product.minstock ?? 5 }

                            return (
                              <div key={productId} className={`p-3 hover:bg-gray-50 ${isSelected ? 'bg-amber-50' : ''}`}>
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedProductsForAdd)
                                      if (e.target.checked) {
                                        newSet.add(productId)
                                        setProductQuantities({
                                          ...productQuantities,
                                          [productId]: { stock: product.stock ?? 0, minStock: product.minStock ?? product.minstock ?? 5 }
                                        })
                                      } else {
                                        newSet.delete(productId)
                                        const newQuantities = { ...productQuantities }
                                        delete newQuantities[productId]
                                        setProductQuantities(newQuantities)
                                      }
                                      setSelectedProductsForAdd(newSet)
                                    }}
                                    className="mt-1 rounded"
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      {product.name || product.ProductName || product.productname}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {productId} — ฿{(product.price || 0).toLocaleString()}
                                    </div>
                                    {isSelected && (
                                      <div className="mt-2 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <label className="text-xs text-gray-600 w-24">สต๊อกเริ่มต้น:</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={qty.stock ?? ''}
                                            onChange={(e) => {
                                              const val = handleNumberInput(e.target.value, false)
                                              setProductQuantities({
                                                ...productQuantities,
                                                [productId]: { ...qty, stock: val }
                                              })
                                            }}
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                            placeholder="0"
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <label className="text-xs text-gray-600 w-24">สต๊อกขั้นต่ำ:</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={qty.minStock ?? ''}
                                            onChange={(e) => {
                                              const val = handleNumberInput(e.target.value, false)
                                              setProductQuantities({
                                                ...productQuantities,
                                                [productId]: { ...qty, minStock: val || 5 }
                                              })
                                            }}
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                            placeholder="5"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddProductFromOtherSupplier}
                    disabled={selectedProductsForAdd.size === 0}
                    className={`flex-1 py-2 rounded-lg font-bold transition ${
                      selectedProductsForAdd.size === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                  >
                    เพิ่มสินค้า ({selectedProductsForAdd.size} รายการ)
                  </button>
                  <button
                    onClick={() => {
                      setShowAddProductModal(false)
                      setSelectedProductsForAdd(new Set())
                      setProductQuantities({})
                      setProductSearchTerm('')
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700">กรอกทีละรายการ</p>
                <div>
                  <label className="block text-sm font-medium mb-2">Product ID *</label>
                  <input
                    type="text"
                    value={customProductId}
                    onChange={(e) => setCustomProductId(e.target.value.toUpperCase())}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="เช่น CUSTOM001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ชื่อสินค้า *</label>
                  <input
                    type="text"
                    value={customProductName}
                    onChange={(e) => setCustomProductName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="กรอกชื่อสินค้า"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ราคา (บาท) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customProductPrice || ''}
                    onChange={(e) => {
                      const val = handleNumberInput(e.target.value, true)
                      setCustomProductPrice(val)
                    }}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">จำนวนสต๊อกเริ่มต้น *</label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock || ''}
                    onChange={(e) => {
                      const val = handleNumberInput(e.target.value, false)
                      setInitialStock(val)
                    }}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">สต๊อกขั้นต่ำ</label>
                  <input
                    type="number"
                    min="0"
                    value={initialMinStock || ''}
                    onChange={(e) => {
                      const val = handleNumberInput(e.target.value, false)
                      setInitialMinStock(val || 5)
                    }}
                    className="w-full border border-gray-300 rounded-lg p-2"
                    placeholder="5"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddCustomProduct}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700"
                  >
                    เพิ่มสินค้า
                  </button>
                  <button
                    onClick={() => {
                      setShowAddProductModal(false)
                      setCustomProductId('')
                      setCustomProductName('')
                      setCustomProductPrice(0)
                      setInitialStock(0)
                      setInitialMinStock(5)
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCloneModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">โคลนรายการจากสาขา</h3>
            <p className="text-sm text-gray-600 mb-4">
              ดึงรายการสินค้าทั้งหมดจากสาขาต้นแบบ (เช่น SA000) มายังสาขาปัจจุบัน ({branchId}) — จำนวนสต็อกตั้งเป็น 0, ใช้ minstock จากสาขาต้นแบบ
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">สาขาต้นแบบ</label>
            <select
              value={cloneSourceBranchId}
              onChange={(e) => setCloneSourceBranchId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
            >
              <option value="">-- เลือกสาขา --</option>
              {cloneBranchList.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {cloneBranchList.length === 0 && (
              <p className="text-xs text-amber-600 mb-2">ไม่มีสาขาอื่นในระบบ หรือสาขาอื่นยังไม่มีรายการสต็อก</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCloneModal(false); setCloneSourceBranchId('') }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCloneSubmit}
                disabled={cloneLoading || !cloneSourceBranchId}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cloneLoading ? 'กำลังโคลน...' : 'ยืนยันโคลน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSupplierPinModal && orderOtherSupplierSupplier !== 'All' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Icon icon="fa-lock" className="text-amber-500 text-xl" />
              <h3 className="text-lg font-bold text-gray-900">ซัพพลายนี้ถูกล็อก</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              กรุณาใส่รหัส PIN เพื่อดูรายการสินค้าของ <strong>{orderOtherSupplierSupplier}</strong>
            </p>
            <input
              type="password"
              value={supplierPinValue}
              onChange={(e) => setSupplierPinValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitSupplierPin()}
              placeholder="รหัส PIN"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowSupplierPinModal(false); setOrderOtherSupplierSupplier('All'); setSupplierPinValue('') }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitSupplierPin}
                disabled={supplierPinChecking}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {supplierPinChecking ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditOtherSupplierModal && editOtherSupplierProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">แก้ไขสินค้าซัพนอก</h3>
            <p className="text-sm text-gray-500 mb-4">{editOtherSupplierProduct.productname || editOtherSupplierProduct.name} ({editOtherSupplierProduct.productid})</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อัปโหลดรูปภาพ (PNG, JPEG)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && !['image/png', 'image/jpeg', 'image/jpg'].includes((f.type || '').toLowerCase())) {
                      Swal.fire({ icon: 'warning', title: 'รองรับเฉพาะ PNG และ JPEG' })
                      e.target.value = ''
                      return
                    }
                    setEditOtherSupplierFile(f || null)
                  }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-emerald-50 file:text-emerald-700"
                />
                {editOtherSupplierFile && (
                  <p className="text-xs text-emerald-600 mt-1">เลือกไฟล์แล้ว — จะอัปโหลดไป Storage เมื่อกดบันทึก</p>
                )}
                <div className="mt-2 flex gap-2 items-center">
                  {(editOtherSupplierFile || editOtherSupplierImage) && (
                    <img
                      src={editOtherSupplierFile ? URL.createObjectURL(editOtherSupplierFile) : editOtherSupplierImage}
                      alt=""
                      className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                    />
                  )}
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">หรือ URL รูปภาพ (ถ้าไม่อัปโหลดไฟล์)</label>
                <input
                  type="text"
                  value={editOtherSupplierImage}
                  onChange={(e) => setEditOtherSupplierImage(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  disabled={!!editOtherSupplierFile}
                />
                {editOtherSupplierFile && (
                  <p className="text-xs text-gray-500 mt-1">ล้างการเลือกไฟล์เพื่อใช้ URL แทน</p>
                )}
                {editOtherSupplierFile && (
                  <button
                    type="button"
                    onClick={() => setEditOtherSupplierFile(null)}
                    className="text-xs text-red-600 mt-1 underline"
                  >
                    ยกเลิกไฟล์ที่เลือก
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ซัพพลาย</label>
                <input
                  type="text"
                  value={editOtherSupplierSupplier}
                  onChange={(e) => setEditOtherSupplierSupplier(e.target.value)}
                  placeholder="ซัพอื่นๆ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ราคา (บาท)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editOtherSupplierPrice}
                  onChange={(e) => setEditOtherSupplierPrice(handleNumberInput(e.target.value, true))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
                <input
                  type="text"
                  value={editOtherSupplierUnit}
                  onChange={(e) => setEditOtherSupplierUnit(e.target.value)}
                  placeholder="ชิ้น, ถุง, กล่อง..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => { setShowEditOtherSupplierModal(false); setEditOtherSupplierProduct(null) }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveEditOtherSupplier}
                disabled={otherSupplierImageUploading}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {otherSupplierImageUploading ? 'กำลังอัปโหลด...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddOtherSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">เพิ่มสินค้าซัพนอก</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสสินค้า *</label>
                <input
                  type="text"
                  value={newOtherProductId}
                  onChange={(e) => setNewOtherProductId(e.target.value)}
                  placeholder="เช่น S001"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
                <input
                  type="text"
                  value={newOtherProductName}
                  onChange={(e) => setNewOtherProductName(e.target.value)}
                  placeholder="ชื่อสินค้า"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ซัพพลาย</label>
                <input
                  type="text"
                  value={newOtherSupplier}
                  onChange={(e) => setNewOtherSupplier(e.target.value)}
                  placeholder="ซัพอื่นๆ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ราคา (บาท)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newOtherPrice}
                  onChange={(e) => setNewOtherPrice(handleNumberInput(e.target.value, true))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
                <input
                  type="text"
                  value={newOtherUnit}
                  onChange={(e) => setNewOtherUnit(e.target.value)}
                  placeholder="ชิ้น, ถุง, กล่อง..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อัปโหลดรูปภาพ (PNG, JPEG)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && !['image/png', 'image/jpeg', 'image/jpg'].includes((f.type || '').toLowerCase())) {
                      Swal.fire({ icon: 'warning', title: 'รองรับเฉพาะ PNG และ JPEG' })
                      e.target.value = ''
                      return
                    }
                    setNewOtherSupplierFile(f || null)
                  }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
                />
                {(newOtherSupplierFile || newOtherImage) && (
                  <img
                    src={newOtherSupplierFile ? URL.createObjectURL(newOtherSupplierFile) : newOtherImage}
                    alt=""
                    className="h-20 w-20 object-cover rounded-lg border border-gray-200 mt-2"
                  />
                )}
                <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">หรือ URL รูปภาพ</label>
                <input
                  type="text"
                  value={newOtherImage}
                  onChange={(e) => setNewOtherImage(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  disabled={!!newOtherSupplierFile}
                />
                {newOtherSupplierFile && (
                  <button type="button" onClick={() => setNewOtherSupplierFile(null)} className="text-xs text-red-600 mt-1 underline">
                    ยกเลิกไฟล์ที่เลือก
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowAddOtherSupplierModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveAddOtherSupplier}
                disabled={otherSupplierImageUploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {otherSupplierImageUploading ? 'กำลังอัปโหลด...' : 'เพิ่มสินค้า'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
