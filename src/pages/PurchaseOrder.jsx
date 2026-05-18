import { useState, useEffect, useMemo } from 'react'
import { poService } from '../services/poService'
import { productService } from '../services/productService'
import { supplierService } from '../services/supplierService'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function PurchaseOrder({ user }) {
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [isPOModalOpen, setIsPOModalOpen] = useState(false)
  const [isPODetailModalOpen, setIsPODetailModalOpen] = useState(false)
  const [isReceivePOModalOpen, setIsReceivePOModalOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState(null)
  const [receivedItems, setReceivedItems] = useState([]) // เก็บจำนวนที่ได้รับจริง
  const [products, setProducts] = useState([])
  const [poItems, setPoItems] = useState([])
  const [poSupplier, setPoSupplier] = useState('')
  const [poExpectedDate, setPoExpectedDate] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [poProductSearch, setPoProductSearch] = useState('')
  /** ค่าชั่วคราวระหว่างกรอกจำนวนใน modal สร้าง PO (productId -> สตริง) */
  const [poQtyDraft, setPoQtyDraft] = useState({})
  const [suppliers, setSuppliers] = useState([])
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')

  useEffect(() => {
    fetchPOs()
    fetchProducts()
    fetchSuppliers()
  }, [])

  const fetchPOs = async () => {
    setLoading(true)
    try {
      const data = await poService.getAllPOs(user)
      setPurchaseOrders(data)
    } catch (error) {
      console.error('Error fetching POs:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูล PO ได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const data = await productService.getAllProducts(user, '')
      setProducts(data)
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const fetchSuppliers = async () => {
    try {
      const data = await supplierService.getAllSuppliers()
      setSuppliers(data)
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const handleAddSupplier = async () => {
    if (!newSupplierName || newSupplierName.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุชื่อซัพพลายเออร์',
        text: 'กรุณากรอกชื่อซัพพลายเออร์'
      })
      return
    }

    const trimmedName = newSupplierName.trim()
    
    // Check if supplier already exists
    if (suppliers.includes(trimmedName)) {
      Swal.fire({
        icon: 'info',
        title: 'ซัพพลายเออร์มีอยู่แล้ว',
        text: `ซัพพลายเออร์ "${trimmedName}" มีอยู่ในระบบแล้ว`
      })
      setNewSupplierName('')
      setIsAddSupplierModalOpen(false)
      setPoSupplier(trimmedName)
      return
    }

    try {
      // Add to suppliers list
      const updatedSuppliers = [...suppliers, trimmedName].sort()
      setSuppliers(updatedSuppliers)
      
      // Set as selected supplier
      setPoSupplier(trimmedName)
      
      // Close modal
      setIsAddSupplierModalOpen(false)
      setNewSupplierName('')
      
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มซัพพลายเออร์สำเร็จ',
        text: `เพิ่มซัพพลายเออร์ "${trimmedName}" เรียบร้อย`,
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error adding supplier:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มซัพพลายเออร์ได้'
      })
    }
  }

  useEffect(() => {
    if (user) {
      fetchPOs()
    }
  }, [statusFilter, user])

  const handleCreatePO = async () => {
    if (!poSupplier || poSupplier.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุชื่อซัพพลายเออร์',
        text: 'กรุณากรอกชื่อซัพพลายเออร์'
      })
      return
    }
    if (poItems.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเพิ่มสินค้า',
        text: 'กรุณาเพิ่มสินค้าในรายการ'
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังสร้าง PO...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const res = await poService.createPO({
        supplier: poSupplier,
        items: poItems,
        expectedDate: poExpectedDate,
        notes: poNotes
      }, user.email)

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: `สร้าง PO ${res.poId} เรียบร้อย`,
        timer: 2000,
        showConfirmButton: false
      })

      setPoQtyDraft({})
      setIsPOModalOpen(false)
      setPoItems([])
      setPoSupplier('')
      setPoExpectedDate('')
      setPoNotes('')
      await fetchPOs()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสร้าง PO ได้'
      })
    }
  }

  const handleUpdatePOStatus = async (poId, newStatus) => {
    try {
      Swal.fire({
        title: 'กำลังอัปเดต...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      await poService.updatePOStatus(poId, newStatus)
      
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'อัปเดตสถานะ PO เรียบร้อย',
        timer: 1500,
        showConfirmButton: false
      })

      await fetchPOs()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตสถานะ PO ได้'
      })
    }
  }

  const handleReceivePO = async (po) => {
    try {
      Swal.fire({
        title: 'กำลังโหลด...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const poDetail = await poService.getPO(po.poid)
      Swal.close()

      if (!poDetail) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูล PO',
          text: 'ไม่สามารถดึงข้อมูล PO ได้'
        })
        return
      }

      // Get product units
      const productUnits = {}
      for (const item of poDetail.items || []) {
        try {
          const { data: product } = await supabase
            .from('products')
            .select('Unit')
            .eq('ProductID', item.productid)
            .maybeSingle()
          if (product) {
            productUnits[item.productid] = product.Unit || 'ชิ้น'
          }
        } catch (error) {
          console.error('Error fetching product unit:', error)
        }
      }

      // Initialize received items - start with 0 received quantity
      const initialReceivedItems = (poDetail.items || []).map(item => {
        // Check if item was already received (for partial receives)
        const alreadyReceived = Number(item.receivedqty || 0)
        const remainingToReceive = Math.max(0, (item.qtyordered || 0) - alreadyReceived)
        
        return {
          productId: item.productid,
          productName: item.productname,
          orderedQty: item.qtyordered || 0,
          alreadyReceived: alreadyReceived, // Track what was already received
          receivedQty: 0, // Start with 0 - user must specify new received quantity
          remainingQty: remainingToReceive, // Remaining quantity to receive
          price: item.priceperunit || 0,
          unit: productUnits[item.productid] || 'ชิ้น'
        }
      })

      console.log('[PurchaseOrder] Initializing receive PO modal:', {
        poId: poDetail.poid,
        itemsCount: poDetail.items?.length,
        initialReceivedItemsCount: initialReceivedItems.length,
        initialReceivedItems: initialReceivedItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          orderedQty: item.orderedQty,
          alreadyReceived: item.alreadyReceived,
          remainingQty: item.remainingQty,
          receivedQty: item.receivedQty
        }))
      })
      
      setSelectedPO(poDetail)
      setReceivedItems(initialReceivedItems)
      setIsReceivePOModalOpen(true)
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูล PO ได้'
      })
    }
  }

  const handleReceivedQtyChange = (productId, value) => {
    // Handle both number (for +/- buttons) and string (for input)
    // If value is '0' or empty string, set to 0 (will be displayed as empty in input)
    let numValue
    if (typeof value === 'string') {
      // If empty string or '0', set to 0
      if (value === '' || value === '0') {
        numValue = 0
      } else {
        numValue = parseInt(value) || 0
      }
    } else {
      numValue = value || 0
    }
    
    setReceivedItems(prev => {
      const updated = prev.map(item => {
        if (item.productId === productId) {
          // Don't allow changes if item is already fully received
          if (item.remainingQty === 0) {
            return item // Keep as is, don't allow changes
          }
          // Limit to remaining quantity (ordered - already received)
          const maxQty = item.remainingQty ?? item.orderedQty
          const newQty = Math.max(0, Math.min(numValue, maxQty))
          return { ...item, receivedQty: newQty }
        }
        return item
      })
      return updated
    })
  }

  const handleReceivedQtyDelta = (productId, delta) => {
    setReceivedItems(prev => prev.map(item => {
      if (item.productId === productId) {
        // Don't allow changes if item is already fully received
        if (item.remainingQty === 0) {
          return item // Keep as is, don't allow changes
        }
        // Limit to remaining quantity (ordered - already received)
        const maxQty = item.remainingQty ?? item.orderedQty
        const newQty = Math.max(0, Math.min(item.receivedQty + delta, maxQty))
        return { ...item, receivedQty: newQty }
      }
      return item
    }))
  }

  const confirmReceivePO = async () => {
    if (!selectedPO || !receivedItems || receivedItems.length === 0) return

    // Check if at least one item has received quantity > 0
    const hasReceived = receivedItems.some(item => item.receivedQty > 0)
    if (!hasReceived) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวนที่ได้รับ',
        text: 'กรุณาระบุจำนวนสินค้าที่ได้รับอย่างน้อย 1 รายการ'
      })
      return
    }

    // Filter items that will be received
    const itemsToReceive = receivedItems.filter(item => item.receivedQty > 0)
    // Only count items that are NOT fully received yet (remainingQty > 0) and have receivedQty === 0
    const itemsNotReceived = receivedItems.filter(item => 
      item.receivedQty === 0 && item.remainingQty > 0
    )

    const { isConfirmed } = await Swal.fire({
      title: 'ยืนยันการรับสินค้า',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการรับสินค้าจาก PO <strong>${selectedPO.poid}</strong> หรือไม่?</p>
          <p class="text-sm text-gray-600 mb-2">จะรับสินค้า <strong>${itemsToReceive.length}</strong> รายการ</p>
          ${itemsNotReceived.length > 0 ? `<p class="text-sm text-orange-600 mb-2">สินค้าที่ยังไม่ได้รับ (${itemsNotReceived.length} รายการ) จะคงค้างใน PO</p>` : ''}
          <p class="text-sm text-gray-600">ระบบจะอัปเดตสต็อกสินค้าอัตโนมัติและบันทึก Stock Log</p>
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
        title: 'กำลังรับสินค้า...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const receivedItemsData = itemsToReceive.map(item => ({
        productId: item.productId,
        receivedQty: item.receivedQty || 0,
        productName: item.productName,
        unit: item.unit
      }))

      console.log('[PurchaseOrder] Sending receive data to poService:', {
        poId: selectedPO.poid,
        receivedItemsCount: receivedItemsData.length,
        receivedItemsData: receivedItemsData.map(item => ({
          productId: item.productId,
          receivedQty: item.receivedQty
        })),
        userEmail: user.email
      })

      try {
        const result = await poService.receivePO(selectedPO.poid, receivedItemsData, user.email)
        console.log('[PurchaseOrder] ✓ PO receive completed successfully:', result)
      } catch (receiveError) {
        console.error('[PurchaseOrder] ✗ Error receiving PO:', {
          error: receiveError,
          message: receiveError.message,
          stack: receiveError.stack,
          poId: selectedPO.poid,
          receivedItemsData
        })
        throw receiveError // Re-throw to show error to user
      }
      
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: itemsNotReceived.length > 0 
          ? `รับสินค้า ${itemsToReceive.length} รายการเรียบร้อย (${itemsNotReceived.length} รายการยังคงค้าง)`
          : 'รับสินค้าครบทุกรายการและอัปเดตสต็อกเรียบร้อย',
        timer: 2000,
        showConfirmButton: false
      })

      setIsReceivePOModalOpen(false)
      setSelectedPO(null)
      setReceivedItems([])
      await fetchPOs()
      await fetchProducts() // Refresh products to update stock
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถรับสินค้าได้'
      })
    }
  }

  const handleCancelRemainingItems = async () => {
    if (!selectedPO) return

    const itemsNotReceived = receivedItems.filter(item => item.receivedQty === 0)
    
    if (itemsNotReceived.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'ไม่มีสินค้าที่เหลือ',
        text: 'สินค้าทั้งหมดได้รับแล้ว'
      })
      return
    }

    const { value: note, isConfirmed } = await Swal.fire({
      title: 'ยกเลิกสินค้าที่เหลือ',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการยกเลิกสินค้าที่ยังไม่ได้รับ (<strong>${itemsNotReceived.length}</strong> รายการ) หรือไม่?</p>
          <p class="text-sm text-gray-600 mb-2">รายการ:</p>
          <ul class="text-sm text-gray-700 list-disc list-inside mb-4">
            ${itemsNotReceived.slice(0, 5).map(item => `<li>${item.productName} (${item.orderedQty} ${item.unit || 'ชิ้น'})</li>`).join('')}
            ${itemsNotReceived.length > 5 ? `<li>... และอีก ${itemsNotReceived.length - 5} รายการ</li>` : ''}
          </ul>
        </div>
      `,
      input: 'textarea',
      inputPlaceholder: 'ระบุเหตุผลในการยกเลิกสินค้าที่เหลือ (ไม่บังคับ)',
      inputAttributes: {
        rows: 3
      },
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626'
    })

    if (!isConfirmed) return

    try {
      Swal.fire({
        title: 'กำลังยกเลิก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      await poService.cancelRemainingItems(
        selectedPO.poid, 
        itemsNotReceived, 
        note || 'ยกเลิกโดยผู้ใช้',
        user.email
      )

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'ยกเลิกสินค้าที่เหลือเรียบร้อย',
        timer: 2000,
        showConfirmButton: false
      })

      setIsReceivePOModalOpen(false)
      setSelectedPO(null)
      setReceivedItems([])
      await fetchPOs()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถยกเลิกสินค้าได้'
      })
    }
  }

  const handleViewPODetail = async (po) => {
    try {
      Swal.fire({
        title: 'กำลังโหลด...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const poDetail = await poService.getPO(po.poid)
      Swal.close()

      if (!poDetail) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูล PO',
          text: 'ไม่สามารถดึงข้อมูล PO ได้'
        })
        return
      }

      setSelectedPO(poDetail)
      setIsPODetailModalOpen(true)
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูล PO ได้'
      })
    }
  }

  const closeCreatePOModal = () => {
    setPoQtyDraft({})
    setIsPOModalOpen(false)
  }

  const addPOItem = (product) => {
    clearPoQtyDraft(product.id)
    const existing = poItems.find(item => item.productId === product.id)
    if (existing) {
      setPoItems(poItems.map(item => 
        item.productId === product.id 
          ? { ...item, qty: item.qty + 1 }
          : item
      ))
    } else {
      setPoItems([...poItems, {
        productId: product.id,
        productName: product.name,
        qty: 1,
        price: product.price || 0
      }])
    }
  }

  const clearPoQtyDraft = (productId) => {
    setPoQtyDraft((d) => {
      if (!(productId in d)) return d
      const next = { ...d }
      delete next[productId]
      return next
    })
  }

  const updatePOItemQty = (productId, delta) => {
    clearPoQtyDraft(productId)
    setPoItems(poItems.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, item.qty + delta)
        return { ...item, qty: newQty }
      }
      return item
    }).filter(item => item.qty > 0))
  }

  const removePOItem = (productId) => {
    clearPoQtyDraft(productId)
    setPoItems(poItems.filter(item => item.productId !== productId))
  }

  const MAX_PO_LINE_QTY = 999_999

  const handlePoQtyInputChange = (productId, raw) => {
    const digitsOnly = raw.replace(/\D/g, '')
    setPoQtyDraft((d) => ({ ...d, [productId]: digitsOnly }))
    if (digitsOnly === '') return
    const n = parseInt(digitsOnly, 10)
    if (!Number.isFinite(n) || n < 1) return
    const clamped = Math.min(n, MAX_PO_LINE_QTY)
    setPoItems((prev) =>
      prev.map((it) => (it.productId === productId ? { ...it, qty: clamped } : it))
    )
  }

  // Filter POs
  const filteredPOs = useMemo(() => {
    let filtered = purchaseOrders

    // Filter by search term
    if (searchTerm.trim() !== '') {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(po => 
        po.poid.toLowerCase().includes(searchLower) ||
        (po.supplier && po.supplier.toLowerCase().includes(searchLower)) ||
        (po.notes && po.notes.toLowerCase().includes(searchLower))
      )
    }

    // Filter by status
    if (statusFilter !== 'All') {
      filtered = filtered.filter(po => {
        const status = po.status || ''
        // When filtering by 'อนุมัติแล้ว', also include 'รับบางส่วน' (partially received)
        if (statusFilter === 'อนุมัติแล้ว') {
          return status === 'อนุมัติแล้ว' || status === 'รับบางส่วน'
        }
        // When filtering by 'รับแล้ว', also include 'รับบางส่วน' (partially received)
        if (statusFilter === 'รับแล้ว') {
          return status === 'รับแล้ว' || status === 'รับบางส่วน'
        }
        // For other filters, match exactly
        return status === statusFilter
      })
    }

    // Sort by createddate (newest first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.createddate || a.CreatedDate || a.created_at || 0)
      const dateB = new Date(b.createddate || b.CreatedDate || b.created_at || 0)
      return dateB - dateA // Newest first
    })

    return filtered
  }, [purchaseOrders, searchTerm, statusFilter])

  // Group POs by supplier
  const posBySupplier = useMemo(() => {
    const grouped = {}
    filteredPOs.forEach(po => {
      const supplier = po.supplier || 'ไม่ระบุ'
      if (!grouped[supplier]) {
        grouped[supplier] = []
      }
      grouped[supplier].push(po)
    })
    
    // Sort POs within each supplier group by createddate (newest first)
    Object.keys(grouped).forEach(supplier => {
      grouped[supplier].sort((a, b) => {
        const dateA = new Date(a.createddate || a.CreatedDate || a.created_at || 0)
        const dateB = new Date(b.createddate || b.CreatedDate || b.created_at || 0)
        return dateB - dateA // Newest first
      })
    })
    
    // Create sorted array of suppliers by their newest PO date
    const sortedSuppliers = Object.keys(grouped).sort((supplierA, supplierB) => {
      // Get the newest PO date from each supplier group
      const getNewestDate = (supplier) => {
        const pos = grouped[supplier]
        if (pos.length === 0) return 0
        const dates = pos.map(po => new Date(po.createddate || po.CreatedDate || po.created_at || 0))
        return Math.max(...dates)
      }
      
      const dateA = getNewestDate(supplierA)
      const dateB = getNewestDate(supplierB)
      return dateB - dateA // Newest first
    })
    
    // Create new object with sorted suppliers
    const sortedGrouped = {}
    sortedSuppliers.forEach(supplier => {
      sortedGrouped[supplier] = grouped[supplier]
    })
    
    return sortedGrouped
  }, [filteredPOs])

  // Filter products for PO modal
  const filteredProducts = useMemo(() => {
    if (!poProductSearch.trim()) return products
    const searchLower = poProductSearch.toLowerCase()
    return products.filter(p => 
      p.name.toLowerCase().includes(searchLower) ||
      (p.category || '').toLowerCase().includes(searchLower) ||
      (p.supplier || '').toLowerCase().includes(searchLower)
    )
  }, [products, poProductSearch])

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  if (loading && purchaseOrders.length === 0) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />

      <div className="flex">
        <Sidebar user={user} />

        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold text-gray-900">Purchase Order (PO)</h1>
              <div className="flex gap-2">
                <button
                  onClick={fetchPOs}
                  className="text-sm text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded hover:bg-blue-100 transition flex items-center gap-2"
                >
                  <Icon icon="fa-sync" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPoQtyDraft({})
                    setPoItems([])
                    setPoSupplier('')
                    setPoExpectedDate('')
                    setPoNotes('')
                    setIsPOModalOpen(true)
                  }}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition shadow-sm flex items-center gap-2"
                >
                  <Icon icon="fa-plus" />
                  สร้าง PO ใหม่
                </button>
              </div>
            </div>

            {/* Search & Filter */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหา PO ID, ซัพพลายเออร์, หรือหมายเหตุ..."
                  className="w-full pl-10 p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-gray-800 outline-none transition"
                />
              </div>
              {/* Status Filter */}
              <div className="flex gap-2 flex-wrap">
                {['All', 'รออนุมัติ', 'อนุมัติแล้ว', 'รับแล้ว', 'ยกเลิก'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                      statusFilter === status
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* PO List - Grouped by Supplier */}
            {filteredPOs.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                ยังไม่มี Purchase Order
              </div>
            ) : (
              <div className="space-y-6">
                {Object.keys(posBySupplier).map(supplier => (
                  <div key={supplier} className="bg-gradient-to-r from-gray-50 to-white rounded-xl border-2 border-gray-200 overflow-hidden">
                    {/* Supplier Header */}
                    <div className="bg-gray-800 text-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon icon="fa-building" className="text-xl" />
                          <div>
                            <h3 className="font-bold text-lg">{supplier}</h3>
                            <p className="text-xs text-gray-300 mt-1">
                              {posBySupplier[supplier].length} PO
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-300">ยอดรวมทั้งหมด</p>
                          <p className="text-xl font-bold">
                            ฿{posBySupplier[supplier].reduce((sum, po) => sum + Number(po.totalamount || 0), 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* PO Items */}
                    <div className="p-4 space-y-3">
                      {posBySupplier[supplier].map(po => (
                        <div key={po.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-bold text-base text-gray-800 uppercase">{po.poid}</h4>
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  po.status === 'รออนุมัติ' ? 'bg-yellow-100 text-yellow-800' :
                                  po.status === 'อนุมัติแล้ว' ? 'bg-blue-100 text-blue-800' :
                                  po.status === 'รับแล้ว' ? 'bg-green-100 text-green-800' :
                                  po.status === 'รับบางส่วน' ? 'bg-orange-100 text-orange-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {po.status}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 space-y-1">
                                <p>สร้างเมื่อ: {formatDate(po.createddate)} | โดย: {po.createdby}</p>
                                {po.expecteddate && (
                                  <p>วันที่คาดว่าจะได้รับ: {formatDate(po.expecteddate)}</p>
                                )}
                                {po.notes && (
                                  <p className="text-gray-400 italic">หมายเหตุ: {po.notes}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-emerald-700 mb-2">
                                ฿{Number(po.totalamount || 0).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 justify-end pt-3 border-t mt-3">
                            {po.status === 'รออนุมัติ' && (
                              <>
                                <button
                                  onClick={() => handleUpdatePOStatus(po.poid, 'อนุมัติแล้ว')}
                                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1"
                                >
                                  <Icon icon="fa-check" />
                                  อนุมัติ
                                </button>
                                <button
                                  onClick={() => handleUpdatePOStatus(po.poid, 'ยกเลิก')}
                                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                                >
                                  <Icon icon="fa-times" />
                                  ยกเลิก
                                </button>
                              </>
                            )}
                            {(po.status === 'อนุมัติแล้ว' || po.status === 'กำลังจัดส่ง' || po.status === 'รับบางส่วน') && (
                              <button
                                onClick={() => handleReceivePO(po)}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition flex items-center gap-1"
                              >
                                <Icon icon="fa-check-circle" />
                                {po.status === 'รับบางส่วน' ? 'รับสินค้าต่อ' : 'รับสินค้า'}
                              </button>
                            )}
                            <button
                              onClick={() => handleViewPODetail(po)}
                              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-200 transition flex items-center gap-1"
                            >
                              <Icon icon="fa-eye" />
                              ดูรายละเอียด
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create PO Modal */}
      {isPOModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">สร้าง PO ใหม่</h2>
                <button
                  type="button"
                  onClick={closeCreatePOModal}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ซัพพลายเออร์ *</label>
                    <div className="flex gap-2">
                      <select
                        value={poSupplier}
                        onChange={(e) => setPoSupplier(e.target.value)}
                        className="flex-1 border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        required
                      >
                        <option value="">-- เลือกซัพพลายเออร์ --</option>
                        {suppliers.map((supplier, idx) => (
                          <option key={idx} value={supplier}>
                            {supplier}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setNewSupplierName('')
                          setIsAddSupplierModalOpen(true)
                        }}
                        className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                        title="เพิ่มซัพพลายเออร์ใหม่"
                      >
                        <Icon icon="fa-plus" />
                        เพิ่ม
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">วันที่คาดว่าจะได้รับ</label>
                    <input
                      type="date"
                      value={poExpectedDate}
                      onChange={(e) => setPoExpectedDate(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">หมายเหตุ</label>
                  <textarea
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    rows={2}
                    placeholder="หมายเหตุ (ถ้ามี)"
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                {/* Product Search */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหาสินค้า</label>
                  <div className="relative">
                    <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={poProductSearch}
                      onChange={(e) => setPoProductSearch(e.target.value)}
                      placeholder="ค้นหาสินค้า..."
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {/* Products List */}
                <div className="border-2 border-gray-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2">
                    {filteredProducts.slice(0, 20).map(product => (
                      <button
                        key={product.id}
                        onClick={() => addPOItem(product)}
                        className="text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition border border-gray-200"
                      >
                        <div className="font-bold text-sm">{product.name}</div>
                        <div className="text-xs text-gray-500">฿{product.price.toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PO Items */}
                {poItems.length > 0 && (
                  <div className="border-2 border-gray-200 rounded-lg p-4">
                    <h3 className="font-bold text-gray-700 mb-3">รายการสินค้า</h3>
                    <div className="space-y-2">
                      {poItems.map(item => (
                        <div key={item.productId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <div className="font-bold text-sm">{item.productName}</div>
                            <div className="text-xs text-gray-500">฿{item.price.toLocaleString()} x {item.qty} = ฿{(item.price * item.qty).toLocaleString()}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updatePOItemQty(item.productId, -1)}
                              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 transition"
                            >
                              <Icon icon="fa-minus" />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              aria-label={`จำนวน ${item.productName}`}
                              className="w-14 min-w-[3.25rem] text-center font-bold border border-gray-300 rounded py-1 px-1 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                              value={
                                poQtyDraft[item.productId] !== undefined
                                  ? poQtyDraft[item.productId]
                                  : String(item.qty)
                              }
                              onFocus={() => {
                                setPoQtyDraft((d) => ({
                                  ...d,
                                  [item.productId]: String(item.qty)
                                }))
                              }}
                              onChange={(e) =>
                                handlePoQtyInputChange(item.productId, e.target.value)
                              }
                              onBlur={(e) => {
                                const trimmed = e.target.value.replace(/\D/g, '')
                                const n =
                                  trimmed === ''
                                    ? 1
                                    : Math.max(
                                        1,
                                        Math.min(
                                          MAX_PO_LINE_QTY,
                                          parseInt(trimmed, 10) || 1
                                        )
                                      )
                                setPoItems((prev) =>
                                  prev.map((it) =>
                                    it.productId === item.productId
                                      ? { ...it, qty: n }
                                      : it
                                  )
                                )
                                clearPoQtyDraft(item.productId)
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => updatePOItemQty(item.productId, 1)}
                              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 transition"
                            >
                              <Icon icon="fa-plus" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removePOItem(item.productId)}
                              className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
                            >
                              <Icon icon="fa-trash" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between font-bold text-lg">
                        <span>ยอดรวม:</span>
                        <span className="text-emerald-600">
                          ฿{poItems.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={handleCreatePO}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    สร้าง PO
                  </button>
                  <button
                    type="button"
                    onClick={closeCreatePOModal}
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

      {/* PO Detail Modal */}
      {isPODetailModalOpen && selectedPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">รายละเอียด {selectedPO.poid}</h2>
                <button
                  onClick={() => {
                    setIsPODetailModalOpen(false)
                    setSelectedPO(null)
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p><strong>ซัพพลายเออร์:</strong> {selectedPO.supplier}</p>
                  <p><strong>สถานะ:</strong> {selectedPO.status}</p>
                  <p><strong>ยอดรวม:</strong> ฿{Number(selectedPO.totalamount || 0).toLocaleString()}</p>
                  <p><strong>สร้างเมื่อ:</strong> {formatDate(selectedPO.createddate)}</p>
                  <p><strong>สร้างโดย:</strong> {selectedPO.createdby}</p>
                  {selectedPO.expecteddate && (
                    <p><strong>วันที่คาดว่าจะได้รับ:</strong> {formatDate(selectedPO.expecteddate)}</p>
                  )}
                  {selectedPO.notes && (
                    <p><strong>หมายเหตุ:</strong> {selectedPO.notes}</p>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-bold text-gray-700 mb-3">รายการสินค้า</h3>
                  <div className="space-y-2">
                    {selectedPO.items && selectedPO.items.map((item, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold">{item.productname}</div>
                        <div className="text-sm text-gray-600">
                          {item.qtyordered} x ฿{Number(item.priceperunit || 0).toLocaleString()} = ฿{Number(item.subtotal || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      setIsPODetailModalOpen(false)
                      setSelectedPO(null)
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive PO Modal */}
      {isReceivePOModalOpen && selectedPO && selectedPO.items && selectedPO.items.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">รับสินค้า {selectedPO.poid}</h2>
                <button
                  onClick={() => {
                    setIsReceivePOModalOpen(false)
                    setSelectedPO(null)
                    setReceivedItems([])
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p><strong>ซัพพลายเออร์:</strong> {selectedPO.supplier}</p>
                  <p><strong>ยอดรวม:</strong> ฿{Number(selectedPO.totalamount || 0).toLocaleString()}</p>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-bold text-gray-700 mb-3">ระบุจำนวนสินค้าที่ได้รับ</h3>
                  <div className="space-y-3">
                    {receivedItems.map((item, idx) => {
                      const totalReceived = (item.alreadyReceived || 0) + item.receivedQty
                      const maxQty = item.remainingQty ?? item.orderedQty
                      const isFullyReceived = totalReceived >= item.orderedQty
                      const isNotReceived = item.receivedQty === 0 && (item.alreadyReceived || 0) === 0
                      const isPartialReceived = item.receivedQty > 0 && totalReceived < item.orderedQty
                      
                      return (
                        <div key={idx} className={`p-4 rounded-lg border-2 ${
                          isFullyReceived ? 'bg-green-50 border-green-200' :
                          isNotReceived ? 'bg-gray-50 border-gray-200' :
                          'bg-yellow-50 border-yellow-200'
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">{item.productName}</div>
                              <div className="text-sm text-gray-600 mt-1">
                                สั่ง: <span className="font-bold">{item.orderedQty}</span> {item.unit || 'ชิ้น'}
                                {item.alreadyReceived > 0 && (
                                  <span className="ml-2 text-green-600 font-bold">
                                    (รับแล้ว: {item.alreadyReceived} {item.unit || 'ชิ้น'})
                                  </span>
                                )}
                              </div>
                              {item.remainingQty > 0 && (
                                <div className="text-xs text-orange-600 mt-1 font-bold">
                                  คงเหลือที่ต้องรับ: {item.remainingQty} {item.unit || 'ชิ้น'}
                                </div>
                              )}
                              {item.remainingQty === 0 && item.alreadyReceived > 0 && (
                                <div className="text-xs text-green-600 mt-1 font-bold">
                                  ✓ รับครบแล้ว
                                </div>
                              )}
                            </div>
                            {isFullyReceived && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">
                                รับครบ
                              </span>
                            )}
                            {isNotReceived && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">
                                ยังไม่ได้รับ
                              </span>
                            )}
                            {isPartialReceived && (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">
                                รับบางส่วน
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 mt-3">
                            <label className="text-sm font-bold text-gray-700 whitespace-nowrap">รับจริง:</label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleReceivedQtyDelta(item.productId, -1)}
                                className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 transition flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={item.receivedQty <= 0 || item.remainingQty === 0}
                              >
                                <Icon icon="fa-minus" className="text-xs" />
                              </button>
                              <input
                                type="text"
                                maxLength={10}
                                value={item.receivedQty === 0 ? '' : item.receivedQty}
                                onChange={(e) => {
                                  const val = e.target.value
                                  // Allow empty string or numbers
                                  if (val === '' || val === '0') {
                                    handleReceivedQtyChange(item.productId, 0)
                                  } else if (/^\d+$/.test(val)) {
                                    // Only allow positive integers
                                    handleReceivedQtyChange(item.productId, val)
                                  }
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value
                                  const numVal = val === '' || val === '0' ? 0 : (parseInt(val) || 0)
                                  if (numVal !== (item.receivedQty || 0)) {
                                    handleReceivedQtyChange(item.productId, numVal)
                                  }
                                }}
                                disabled={item.remainingQty === 0}
                                className="w-24 px-2 py-2 border-2 border-emerald-500 rounded text-center font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300"
                                placeholder="0"
                              />
                              <button
                                onClick={() => handleReceivedQtyDelta(item.productId, 1)}
                                className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 transition flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={item.receivedQty >= maxQty || item.remainingQty === 0}
                              >
                                <Icon icon="fa-plus" className="text-xs" />
                              </button>
                              <span className="text-sm text-gray-600">/ {maxQty} {item.unit || 'ชิ้น'}</span>
                            </div>
                            {item.remainingQty > 0 && item.receivedQty < maxQty && (
                              <button
                                onClick={() => handleReceivedQtyChange(item.productId, maxQty)}
                                className="ml-auto px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200 transition"
                              >
                                รับครบ ({maxQty} {item.unit || 'ชิ้น'})
                              </button>
                            )}
                            {item.remainingQty === 0 && item.alreadyReceived > 0 && (
                              <span className="ml-auto px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                                ✓ รับครบแล้ว
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <Icon icon="fa-info-circle" className="mr-2" />
                    คุณสามารถรับสินค้าบางรายการได้ สินค้าที่ยังไม่ได้รับจะคงค้างใน PO จนกว่าจะรับครบ
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <Icon icon="fa-exclamation-triangle" className="mr-2" />
                    ระบบจะอัปเดตสต็อกสินค้าและบันทึก Stock Log อัตโนมัติหลังจากยืนยัน
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={confirmReceivePO}
                    className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition flex items-center justify-center gap-2"
                  >
                    <Icon icon="fa-check" />
                    ยืนยันการรับสินค้า
                  </button>
                  {receivedItems.some(item => item.receivedQty === 0) && (
                    <button
                      onClick={handleCancelRemainingItems}
                      className="px-4 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition flex items-center gap-2"
                    >
                      <Icon icon="fa-times" />
                      ยกเลิกสินค้าที่เหลือ
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsReceivePOModalOpen(false)
                      setSelectedPO(null)
                      setReceivedItems([])
                    }}
                    className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">เพิ่มซัพพลายเออร์ใหม่</h2>
                <button
                  onClick={() => {
                    setIsAddSupplierModalOpen(false)
                    setNewSupplierName('')
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อซัพพลายเออร์ *</label>
                  <input
                    type="text"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddSupplier()
                      }
                    }}
                    placeholder="ระบุชื่อซัพพลายเออร์"
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleAddSupplier}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    เพิ่มซัพพลายเออร์
                  </button>
                  <button
                    onClick={() => {
                      setIsAddSupplierModalOpen(false)
                      setNewSupplierName('')
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
