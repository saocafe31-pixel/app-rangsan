import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../utils/supabase'
import { productService } from '../services/productService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import {
  PROMOTION_TYPE_LABELS,
  PROMOTION_TARGET_CUSTOMER_TYPE_LABELS,
  computePromotionMoneyDiscount,
  formatPromotionCondition,
  promotionDateInputToIsoRange
} from '../utils/promotionUtils'

const PROMOTION_TYPE_HELP = {
  buy_x_get_y: 'เมื่อซื้อสินค้า X ครบจำนวนที่กำหนด ระบบเพิ่มสินค้าแถม Y ในตะกร้าอัตโนมัติ (หน้าชำระเงิน)',
  discount_percentage: 'หัก % จากยอดสินค้า X ในตะกร้า (เฉพาะชิ้นที่ต้องจ่าย ไม่รวมแถม)',
  discount_fixed: 'หักจำนวนเงินต่อชิ้น จากสินค้า X (เช่น ลด 10 บาท/ชิ้น × จำนวนที่ซื้อ)',
  target_unit_price:
    'กำหนดราคาขายต่อชิ้น (เช่น 290 บาท/ชิ้น) — ส่วนลด = (ราคาปกติ − ราคาโปร) × จำนวน',
  second_item_discount:
    'ซื้อสินค้า X อย่างน้อย 2 ชิ้น — ชิ้นที่ 2, 4, 6 … ได้ส่วนลด (บาท/ชิ้น หรือ %) ตามที่ตั้งไว้'
}

export default function AdminPromotions({ user }) {
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [products, setProducts] = useState([])
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [getProductSearchTerm, setGetProductSearchTerm] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [showGetProductDropdown, setShowGetProductDropdown] = useState(false)
  const [promotionForm, setPromotionForm] = useState({
    Name: '',
    Type: 'buy_x_get_y', // 'buy_x_get_y', 'discount_percentage', 'discount_fixed'
    ProductID: '',
    GetProductID: '', // สินค้า Y สำหรับ buy_x_get_y
    BuyQuantity: 0,
    GetQuantity: 0,
    DiscountPercentage: 0,
    DiscountAmount: 0,
    MinPurchase: 0,
    MaxDiscount: 0,
    ValidFrom: '',
    ValidUntil: '',
    Status: 'active',
    Description: '',
    UsageLimit: 0,
    TotalUsageLimit: 0,
    TargetCustomerType: 'all',
    PromotionProductLimit: 0,
    secondItemDiscountMode: 'percent'
  })

  // Helper function to handle number input - removes leading zero when user starts typing
  const handleNumberInput = (value, isFloat = false) => {
    if (value === '' || value === null || value === undefined) {
      return ''
    }
    const stringValue = String(value)
    // If value starts with 0 and has more digits (not decimal), remove leading zero
    if (stringValue.length > 1 && stringValue[0] === '0' && stringValue[1] !== '.') {
      const cleaned = stringValue.replace(/^0+/, '') || ''
      return cleaned
    }
    return stringValue
  }

  useEffect(() => {
    fetchPromotions()
    fetchProducts()
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.product-dropdown-container')) {
        setShowProductDropdown(false)
        setShowGetProductDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchProducts = async () => {
    try {
      const allProducts = await productService.getAllProducts(user)
      setProducts(allProducts || [])
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const fetchPromotions = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .order('id', { ascending: false })

      if (error) throw error

      setPromotions(data || [])
    } catch (error) {
      console.error('Error fetching promotions:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูลโปรโมชั่นได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAddPromotion = () => {
    setEditingPromotion(null)
    setPromotionForm({
      Name: '',
      Type: 'buy_x_get_y',
      ProductID: '',
      BuyQuantity: 0,
      GetQuantity: 0,
      DiscountPercentage: 0,
      DiscountAmount: 0,
      MinPurchase: 0,
      MaxDiscount: 0,
      ValidFrom: '',
      ValidUntil: '',
      Status: 'active',
      Description: '',
      UsageLimit: 0,
      TotalUsageLimit: 0,
      TargetCustomerType: 'all',
      PromotionProductLimit: 0,
      secondItemDiscountMode: 'percent'
    })
    setShowModal(true)
  }

  const handleEditPromotion = (promotion) => {
    setEditingPromotion(promotion)
    setProductSearchTerm('')
    setGetProductSearchTerm('')
    setPromotionForm({
      Name: promotion.Name || '',
      Type: promotion.Type || 'buy_x_get_y',
      ProductID: promotion.ProductID || '',
      GetProductID: promotion.GetProductID || '',
      BuyQuantity: promotion.BuyQuantity || 0,
      GetQuantity: promotion.GetQuantity || 0,
      DiscountPercentage: promotion.DiscountPercentage || 0,
      DiscountAmount: promotion.DiscountAmount || 0,
      MinPurchase: promotion.MinPurchase || 0,
      MaxDiscount: promotion.MaxDiscount || 0,
      ValidFrom: promotion.ValidFrom ? promotion.ValidFrom.toString().split('T')[0] : '',
      ValidUntil: promotion.ValidUntil ? promotion.ValidUntil.toString().split('T')[0] : '',
      Status: promotion.Status || 'active',
      Description: promotion.Description || '',
      UsageLimit: promotion.UsageLimit || 0,
      TotalUsageLimit: promotion.TotalUsageLimit || 0,
      TargetCustomerType: promotion.TargetCustomerType || 'all',
      PromotionProductLimit: promotion.PromotionProductLimit || 0,
      secondItemDiscountMode:
        promotion.Type === 'second_item_discount' && !(Number(promotion.DiscountPercentage) > 0)
          ? 'fixed'
          : 'percent'
    })
    setShowModal(true)
  }

  const handleSavePromotion = async () => {
    // Validation
    if (!promotionForm.Name || promotionForm.Name.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกชื่อโปรโมชั่น'
      })
      return
    }

    if (!promotionForm.ProductID || promotionForm.ProductID.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณาเลือกสินค้า'
      })
      return
    }

    // Validate based on type
    if (promotionForm.Type === 'buy_x_get_y') {
      if (promotionForm.BuyQuantity <= 0) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกข้อมูล',
          text: 'กรุณากรอกจำนวนที่ต้องซื้อที่มากกว่า 0'
        })
        return
      }
      if (promotionForm.GetQuantity <= 0) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกข้อมูล',
          text: 'กรุณากรอกจำนวนที่ได้เพิ่มที่มากกว่า 0'
        })
        return
      }
    } else if (promotionForm.Type === 'discount_percentage') {
      if (promotionForm.DiscountPercentage <= 0 || promotionForm.DiscountPercentage > 100) {
        Swal.fire({
          icon: 'warning',
          title: 'ข้อมูลไม่ถูกต้อง',
          text: 'ส่วนลดแบบเปอร์เซ็นต์ต้องอยู่ระหว่าง 1-100%'
        })
        return
      }
    } else if (promotionForm.Type === 'discount_fixed') {
      if (promotionForm.DiscountAmount <= 0) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกข้อมูล',
          text: 'กรุณากรอกจำนวนเงินส่วนลดต่อชิ้นที่มากกว่า 0'
        })
        return
      }
    } else if (promotionForm.Type === 'target_unit_price') {
      if (promotionForm.DiscountAmount < 0) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกข้อมูล',
          text: 'กรุณากรอกราคาพิเศษต่อชิ้น (0 = ฟรี)'
        })
        return
      }
    } else if (promotionForm.Type === 'second_item_discount') {
      if (promotionForm.secondItemDiscountMode === 'percent') {
        if (promotionForm.DiscountPercentage <= 0 || promotionForm.DiscountPercentage > 100) {
          Swal.fire({
            icon: 'warning',
            title: 'ข้อมูลไม่ถูกต้อง',
            text: 'กรุณากรอกเปอร์เซ็นต์ส่วนลดชิ้นที่ 2 ระหว่าง 1–100%'
          })
          return
        }
      } else if (promotionForm.DiscountAmount <= 0) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกข้อมูล',
          text: 'กรุณากรอกจำนวนเงินส่วนลดต่อชิ้นที่ 2 ที่มากกว่า 0'
        })
        return
      }
    }

    if (promotionForm.ValidFrom && promotionForm.ValidUntil && promotionForm.ValidFrom > promotionForm.ValidUntil) {
      Swal.fire({
        icon: 'warning',
        title: 'วันที่ไม่ถูกต้อง',
        text: 'วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด'
      })
      return
    }

    if (Number(promotionForm.PromotionProductLimit) < 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: 'จำนวนสินค้า X ที่จัดโปรต้องไม่ติดลบ'
      })
      return
    }

    try {
      const isSecondItem = promotionForm.Type === 'second_item_discount'
      const secondPercent =
        isSecondItem && promotionForm.secondItemDiscountMode === 'percent'
          ? Number(promotionForm.DiscountPercentage) || 0
          : 0
      const secondFixed =
        isSecondItem && promotionForm.secondItemDiscountMode === 'fixed'
          ? Number(promotionForm.DiscountAmount) || 0
          : 0

      const promotionData = {
        Name: promotionForm.Name.trim(),
        Type: promotionForm.Type,
        ProductID: promotionForm.ProductID.trim(),
        GetProductID: promotionForm.GetProductID?.trim() || null,
        BuyQuantity: Number(promotionForm.BuyQuantity) || 0,
        GetQuantity: Number(promotionForm.GetQuantity) || 0,
        DiscountPercentage: isSecondItem
          ? secondPercent
          : Number(promotionForm.DiscountPercentage) || 0,
        DiscountAmount: isSecondItem ? secondFixed : Number(promotionForm.DiscountAmount) || 0,
        MinPurchase: Number(promotionForm.MinPurchase) || 0,
        MaxDiscount: Number(promotionForm.MaxDiscount) || 0,
        ValidFrom: promotionDateInputToIsoRange(promotionForm.ValidFrom, 'from'),
        ValidUntil: promotionDateInputToIsoRange(promotionForm.ValidUntil, 'until'),
        Status: promotionForm.Status,
        Description: promotionForm.Description || '',
        UsageLimit: Number(promotionForm.UsageLimit) || 0,
        TotalUsageLimit: Number(promotionForm.TotalUsageLimit) || 0,
        TargetCustomerType: promotionForm.TargetCustomerType || 'all',
        PromotionProductLimit: Number(promotionForm.PromotionProductLimit) || 0
      }

      if (editingPromotion) {
        const { error } = await supabase
          .from('promotions')
          .update(promotionData)
          .eq('id', editingPromotion.id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'อัปเดตโปรโมชั่นเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })
      } else {
        const { error } = await supabase
          .from('promotions')
          .insert(promotionData)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'เพิ่มโปรโมชั่นเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })
      }

      setShowModal(false)
      fetchPromotions()
    } catch (error) {
      console.error('Error saving promotion:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกได้'
      })
    }
  }

  const handleDeletePromotion = async (promotion) => {
    const promotionName = promotion.Name || 'โปรโมชั่นนี้'
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `คุณต้องการลบโปรโมชั่น "${promotionName}" หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('promotions')
          .delete()
          .eq('id', promotion.id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'ลบสำเร็จ',
          text: 'ลบโปรโมชั่นเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        })

        fetchPromotions()
      } catch (error) {
        console.error('Error deleting promotion:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถลบได้'
        })
      }
    }
  }

  const handleToggleStatus = async (promotion) => {
    try {
      const currentStatus = promotion.Status || 'active'
      const newStatus = currentStatus.toLowerCase() === 'active' ? 'inactive' : 'active'
      const { error } = await supabase
        .from('promotions')
        .update({ Status: newStatus })
        .eq('id', promotion.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสำเร็จ',
        text: `เปลี่ยนสถานะเป็น ${newStatus === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'} แล้ว`,
        timer: 1500,
        showConfirmButton: false
      })

      fetchPromotions()
    } catch (error) {
      console.error('Error toggling promotion status:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตได้'
      })
    }
  }

  const filteredPromotions = promotions.filter(promotion => {
    const name = promotion.Name || ''
    const productId = promotion.ProductID || ''
    const description = promotion.Description || ''
    const status = promotion.Status || ''
    
    const matchesSearch = !searchTerm || 
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      productId.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const getTypeLabel = (type) => PROMOTION_TYPE_LABELS[type] || type
  const getTargetCustomerTypeLabel = (type) =>
    PROMOTION_TARGET_CUSTOMER_TYPE_LABELS[type || 'all'] || PROMOTION_TARGET_CUSTOMER_TYPE_LABELS.all

  const handlePromotionTypeChange = (nextType) => {
    setPromotionForm((f) => ({
      ...f,
      Type: nextType,
      BuyQuantity: nextType === 'buy_x_get_y' ? f.BuyQuantity : 0,
      GetQuantity: nextType === 'buy_x_get_y' ? f.GetQuantity : 0,
      GetProductID: nextType === 'buy_x_get_y' ? f.GetProductID : '',
      DiscountPercentage:
        nextType === 'discount_percentage' || nextType === 'second_item_discount'
          ? f.DiscountPercentage
          : 0,
      MaxDiscount:
        nextType === 'discount_percentage' || nextType === 'second_item_discount' ? f.MaxDiscount : 0,
      DiscountAmount:
        nextType === 'discount_fixed' ||
        nextType === 'target_unit_price' ||
        nextType === 'second_item_discount'
          ? f.DiscountAmount
          : 0,
      secondItemDiscountMode:
        nextType === 'second_item_discount' ? f.secondItemDiscountMode || 'percent' : 'percent'
    }))
  }

  const getSelectedProduct = () => {
    return products.find(p => p.id === promotionForm.ProductID)
  }

  const getSelectedGetProduct = () => {
    return products.find(p => p.id === promotionForm.GetProductID)
  }

  const filteredProducts = products.filter(product => {
    if (!productSearchTerm) return true
    const searchLower = productSearchTerm.toLowerCase()
    return (
      (product.id || '').toLowerCase().includes(searchLower) ||
      (product.name || '').toLowerCase().includes(searchLower)
    )
  })

  const filteredGetProducts = products.filter(product => {
    if (!getProductSearchTerm) return true
    const searchLower = getProductSearchTerm.toLowerCase()
    return (
      (product.id || '').toLowerCase().includes(searchLower) ||
      (product.name || '').toLowerCase().includes(searchLower)
    )
  })

  const PREVIEW_QTY = 2
  const promotionCheckoutPreview = useMemo(() => {
    const product = getSelectedProduct()
    const t = promotionForm.Type
    if (
      !product ||
      !['discount_percentage', 'discount_fixed', 'target_unit_price', 'second_item_discount'].includes(t)
    ) {
      return null
    }
    const isSecond = t === 'second_item_discount'
    const promo = {
      id: 'preview',
      Type: t,
      DiscountPercentage:
        isSecond && promotionForm.secondItemDiscountMode === 'fixed'
          ? 0
          : Number(promotionForm.DiscountPercentage) || 0,
      DiscountAmount:
        isSecond && promotionForm.secondItemDiscountMode === 'percent'
          ? 0
          : Number(promotionForm.DiscountAmount) || 0,
      MaxDiscount: Number(promotionForm.MaxDiscount) || 0
    }
    const unitPrice = Number(product.price) || 0
    const item = { id: product.id, price: unitPrice, qty: PREVIEW_QTY }
    const discount = computePromotionMoneyDiscount(promo, item)
    const subtotal = unitPrice * PREVIEW_QTY
    return {
      qty: PREVIEW_QTY,
      unitPrice,
      subtotal,
      discount,
      payAfter: Math.max(0, subtotal - discount)
    }
  }, [promotionForm, products])

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
              <h1 className="text-2xl font-bold text-gray-900">จัดการโปรโมชั่น</h1>
              <button
                onClick={handleAddPromotion}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition flex items-center gap-2"
              >
                <Icon icon="fa-plus" />
                เพิ่มโปรโมชั่นใหม่
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
                      placeholder="ค้นหาตามชื่อโปรโมชั่น, รหัสสินค้า, หรือรายละเอียด..."
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

            {/* Promotions Table */}
            {filteredPromotions.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Icon icon="fa-inbox" className="text-6xl text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">ไม่พบข้อมูลโปรโมชั่น</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">ชื่อโปรโมชั่น</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">ประเภท</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">กลุ่มลูกค้า</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">รหัสสินค้า</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">เงื่อนไข</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่เริ่มต้น</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่สิ้นสุด</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">สินค้าโปร</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">จำนวนการใช้งาน</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredPromotions.map((promotion) => {
                        const name = promotion.Name || ''
                        const type = promotion.Type || ''
                        const productId = promotion.ProductID || ''
                        const status = promotion.Status || ''
                        const description = promotion.Description || ''
                        const product = products.find((p) => p.id === productId)
                        const productStock = Math.max(0, Number(product?.stock) || 0)
                        const productLimit = Math.max(0, Number(promotion.PromotionProductLimit) || 0)
                        const productUsed = Math.max(0, Number(promotion.PromotionProductUsed) || 0)
                        const productRemaining =
                          productLimit > 0
                            ? Math.max(0, productLimit - productUsed)
                            : productStock
                        
                        return (
                          <tr key={promotion.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-gray-900">{name}</div>
                              {description && (
                                <div className="text-xs text-gray-500">{description}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {getTypeLabel(type)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {getTargetCustomerTypeLabel(promotion.TargetCustomerType)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {productId}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <div className="space-y-1">
                                {type === 'buy_x_get_y' && (
                                  <>
                                    <div>ซื้อ {promotion.BuyQuantity || 0} แถม {promotion.GetQuantity || 0}</div>
                                  </>
                                )}
                                {type === 'discount_percentage' && (
                                  <>
                                    <div>ส่วนลด {promotion.DiscountPercentage || 0}%</div>
                                    {promotion.MaxDiscount > 0 && (
                                      <div className="text-xs">สูงสุด ฿{Number(promotion.MaxDiscount).toLocaleString()}</div>
                                    )}
                                  </>
                                )}
                                {type === 'discount_fixed' && (
                                  <>
                                    <div>ลด ฿{Number(promotion.DiscountAmount || 0).toLocaleString()} ต่อชิ้น</div>
                                  </>
                                )}
                                {type === 'target_unit_price' && (
                                  <>
                                    <div>ราคา ฿{Number(promotion.DiscountAmount || 0).toLocaleString()} / ชิ้น</div>
                                  </>
                                )}
                                {type === 'second_item_discount' && (
                                  <div>{formatPromotionCondition(promotion)}</div>
                                )}
                                {promotion.MinPurchase > 0 && (
                                  <div className="text-xs">ซื้อขั้นต่ำ: ฿{Number(promotion.MinPurchase).toLocaleString()}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(promotion.ValidFrom)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(promotion.ValidUntil)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                              <div className="text-sm font-semibold text-gray-900">
                                ใช้แล้ว {productUsed.toLocaleString()} ชิ้น
                              </div>
                              {productLimit > 0 ? (
                                <div className="text-gray-500">
                                  เหลือ {productRemaining.toLocaleString()} / {productLimit.toLocaleString()} ชิ้น
                                </div>
                              ) : (
                                <div className="text-gray-500">
                                  ตามสต็อก: {productRemaining.toLocaleString()} ชิ้น
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                              <div className="text-sm font-semibold text-gray-900">
                                ใช้แล้ว {(promotion.UsageCount || 0).toLocaleString()} ครั้ง
                              </div>
                              {(promotion.TotalUsageLimit || 0) > 0 && (
                                <div className="text-gray-500">รวมสูงสุด {promotion.TotalUsageLimit} ครั้ง</div>
                              )}
                              {(promotion.UsageLimit || 0) > 0 && (
                                <div className="text-gray-500">ต่อคน {promotion.UsageLimit} ครั้ง</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => handleToggleStatus(promotion)}
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
                                  onClick={() => handleEditPromotion(promotion)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                                >
                                  <Icon icon="fa-edit" />
                                </button>
                                <button
                                  onClick={() => handleDeletePromotion(promotion)}
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

      {/* Promotion Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                {editingPromotion ? 'แก้ไขโปรโมชั่น' : 'เพิ่มโปรโมชั่นใหม่'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Icon icon="fa-times" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อโปรโมชั่น *
                </label>
                <input
                  type="text"
                  value={promotionForm.Name}
                  onChange={(e) => setPromotionForm({ ...promotionForm, Name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="เช่น ซื้อ 10 แถม 1"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทโปรโมชั่น *
                </label>
                <select
                  value={promotionForm.Type}
                  onChange={(e) => handlePromotionTypeChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="buy_x_get_y">ซื้อ X แถม Y</option>
                  <option value="discount_percentage">ส่วนลดเปอร์เซ็นต์</option>
                  <option value="discount_fixed">ส่วนลดต่อชิ้น (บาท)</option>
                  <option value="target_unit_price">ราคาพิเศษต่อชิ้น (บาท)</option>
                  <option value="second_item_discount">ชิ้นที่ 2 ลด (บาท/%)</option>
                </select>
                {PROMOTION_TYPE_HELP[promotionForm.Type] && (
                  <p className="mt-2 text-xs leading-snug text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    {PROMOTION_TYPE_HELP[promotionForm.Type]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  แสดงโปรโมชั่นให้ *
                </label>
                <select
                  value={promotionForm.TargetCustomerType}
                  onChange={(e) =>
                    setPromotionForm({ ...promotionForm, TargetCustomerType: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="regular">ลูกค้าปกติ</option>
                  <option value="franchise">แฟรนไชส์</option>
                </select>
              </div>

              {/* ProductID */}
              <div className="product-dropdown-container">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รหัสสินค้า (X) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหารหัสหรือชื่อสินค้า..."
                    value={productSearchTerm || (getSelectedProduct() ? `${getSelectedProduct().id} - ${getSelectedProduct().name}` : '')}
                    onChange={(e) => {
                      setProductSearchTerm(e.target.value)
                      setShowProductDropdown(true)
                      if (!e.target.value) {
                        setPromotionForm({ ...promotionForm, ProductID: '' })
                      }
                    }}
                    onFocus={() => {
                      if (productSearchTerm || !getSelectedProduct()) {
                        setShowProductDropdown(true)
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  {showProductDropdown && (productSearchTerm || !getSelectedProduct()) && filteredProducts.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredProducts.slice(0, 10).map((product) => (
                        <div
                          key={product.id}
                          onClick={() => {
                            setPromotionForm({ ...promotionForm, ProductID: product.id })
                            setProductSearchTerm('')
                            setShowProductDropdown(false)
                          }}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">{product.id}</div>
                          <div className="text-sm text-gray-600">{product.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {getSelectedProduct() && !productSearchTerm && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-medium">สินค้า:</span> {getSelectedProduct().name}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวนสินค้า X ที่จัดโปร (0 = ใช้ตามสต็อกจริง)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    promotionForm.PromotionProductLimit === 0
                      ? ''
                      : promotionForm.PromotionProductLimit
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    setPromotionForm({
                      ...promotionForm,
                      PromotionProductLimit: v === '' ? 0 : parseInt(v, 10) || 0
                    })
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="เช่น 100"
                />
                {getSelectedProduct() && (
                  <p className="mt-2 text-xs text-gray-500">
                    สต็อกปัจจุบันสินค้า X: {Number(getSelectedProduct().stock || 0).toLocaleString()} ชิ้น
                  </p>
                )}
              </div>

              {/* Buy X Get Y Fields */}
              {promotionForm.Type === 'buy_x_get_y' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      จำนวนที่ต้องซื้อ (X) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={promotionForm.BuyQuantity === 0 ? '' : String(promotionForm.BuyQuantity)}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        // Allow empty string
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          setPromotionForm({ ...promotionForm, BuyQuantity: 0 })
                          return
                        }
                        // Only allow numbers
                        const numbersOnly = inputValue.replace(/[^0-9]/g, '')
                        if (numbersOnly === '') {
                          setPromotionForm({ ...promotionForm, BuyQuantity: 0 })
                          return
                        }
                        // Remove leading zeros
                        const cleaned = numbersOnly.replace(/^0+/, '') || '0'
                        const numValue = parseInt(cleaned) || 0
                        setPromotionForm({ ...promotionForm, BuyQuantity: numValue })
                      }}
                      onFocus={(e) => {
                        // If value is 0, select all text so user can type new number
                        if (promotionForm.BuyQuantity === 0) {
                          e.target.select()
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="เช่น 10"
                    />
                  </div>
                  <div className="product-dropdown-container">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      สินค้าที่ได้เพิ่ม (Y) * (ว่าง = สินค้าเดียวกัน)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ค้นหารหัสหรือชื่อสินค้า..."
                        value={getProductSearchTerm || (getSelectedGetProduct() ? `${getSelectedGetProduct().id} - ${getSelectedGetProduct().name}` : (!promotionForm.GetProductID ? 'สินค้าเดียวกัน (X)' : ''))}
                        onChange={(e) => {
                          setGetProductSearchTerm(e.target.value)
                          setShowGetProductDropdown(true)
                          if (!e.target.value) {
                            setPromotionForm({ ...promotionForm, GetProductID: '' })
                          }
                        }}
                        onFocus={() => {
                          if (getProductSearchTerm || !getSelectedGetProduct()) {
                            setShowGetProductDropdown(true)
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      {showGetProductDropdown && (getProductSearchTerm || !getSelectedGetProduct()) && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div
                            onClick={() => {
                              setPromotionForm({ ...promotionForm, GetProductID: '' })
                              setGetProductSearchTerm('')
                              setShowGetProductDropdown(false)
                            }}
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                          >
                            <div className="font-medium text-gray-900">สินค้าเดียวกัน (X)</div>
                          </div>
                          {filteredGetProducts.length > 0 && filteredGetProducts.slice(0, 10).map((product) => (
                            <div
                              key={product.id}
                              onClick={() => {
                                setPromotionForm({ ...promotionForm, GetProductID: product.id })
                                setGetProductSearchTerm('')
                                setShowGetProductDropdown(false)
                              }}
                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-900">{product.id}</div>
                              <div className="text-sm text-gray-600">{product.name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {getSelectedGetProduct() && !getProductSearchTerm && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">สินค้า Y:</span> {getSelectedGetProduct().name}
                      </div>
                    )}
                    {!promotionForm.GetProductID && !getProductSearchTerm && (
                      <div className="mt-2 text-sm text-gray-500">
                        <span className="font-medium">หมายเหตุ:</span> ถ้าไม่เลือก จะใช้สินค้าเดียวกันกับ X
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      จำนวนที่ได้เพิ่ม (Y) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={promotionForm.GetQuantity === 0 ? '' : String(promotionForm.GetQuantity)}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        // Allow empty string
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          setPromotionForm({ ...promotionForm, GetQuantity: 0 })
                          return
                        }
                        // Only allow numbers
                        const numbersOnly = inputValue.replace(/[^0-9]/g, '')
                        if (numbersOnly === '') {
                          setPromotionForm({ ...promotionForm, GetQuantity: 0 })
                          return
                        }
                        // Remove leading zeros
                        const cleaned = numbersOnly.replace(/^0+/, '') || '0'
                        const numValue = parseInt(cleaned) || 0
                        setPromotionForm({ ...promotionForm, GetQuantity: numValue })
                      }}
                      onFocus={(e) => {
                        // If value is 0, select all text so user can type new number
                        if (promotionForm.GetQuantity === 0) {
                          e.target.select()
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="เช่น 1"
                    />
                  </div>
                </>
              )}

              {/* Discount Percentage Fields */}
              {promotionForm.Type === 'discount_percentage' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      เปอร์เซ็นต์ส่วนลด (%) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.01"
                      value={promotionForm.DiscountPercentage === 0 ? '' : promotionForm.DiscountPercentage}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          setPromotionForm({ ...promotionForm, DiscountPercentage: 0 })
                          return
                        }
                        // Remove leading zeros (but keep decimal point)
                        const cleaned = inputValue.replace(/^0+(?=\d)/, '') || inputValue
                        const numValue = parseFloat(cleaned) || 0
                        setPromotionForm({ ...promotionForm, DiscountPercentage: numValue })
                      }}
                      onFocus={(e) => {
                        if (promotionForm.DiscountPercentage === 0) {
                          e.target.select()
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="เช่น 10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ส่วนลดสูงสุด (บาท) (0 = ไม่จำกัด)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={promotionForm.MaxDiscount === 0 ? '' : promotionForm.MaxDiscount}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          setPromotionForm({ ...promotionForm, MaxDiscount: 0 })
                          return
                        }
                        // Remove leading zeros (but keep decimal point)
                        const cleaned = inputValue.replace(/^0+(?=\d)/, '') || inputValue
                        const numValue = parseFloat(cleaned) || 0
                        setPromotionForm({ ...promotionForm, MaxDiscount: numValue })
                      }}
                      onFocus={(e) => {
                        if (promotionForm.MaxDiscount === 0) {
                          e.target.select()
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="เช่น 100"
                    />
                  </div>
                </>
              )}

              {/* Discount Fixed Fields */}
              {promotionForm.Type === 'discount_fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ส่วนลดต่อชิ้น (บาท) *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    หักต่อชิ้นที่ซื้อ (เช่น ลด 10 บาท × 3 ชิ้น = ลด 30 บาท) — ไม่ใช่ครั้งเดียวต่อออเดอร์
                  </p>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                      value={promotionForm.DiscountAmount === 0 ? '' : promotionForm.DiscountAmount}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          setPromotionForm({ ...promotionForm, DiscountAmount: 0 })
                          return
                        }
                        // Remove leading zeros (but keep decimal point)
                        const cleaned = inputValue.replace(/^0+(?=\d)/, '') || inputValue
                        const numValue = parseFloat(cleaned) || 0
                        setPromotionForm({ ...promotionForm, DiscountAmount: numValue })
                      }}
                      onFocus={(e) => {
                        if (promotionForm.DiscountAmount === 0) {
                          e.target.select()
                        }
                      }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="เช่น 50"
                  />
                </div>
              )}

              {promotionForm.Type === 'target_unit_price' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ราคาพิเศษต่อชิ้น (บาท) *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    ใช้เมื่อต้องการขายในราคาเดียว เช่น ลดเหลือ 290 บาท/ชิ้น (ส่วนลดคำนวณจากราคาปกติ − ราคานี้)
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promotionForm.DiscountAmount === 0 ? '' : promotionForm.DiscountAmount}
                    onChange={(e) => {
                      const inputValue = e.target.value
                      if (inputValue === '' || inputValue === null || inputValue === undefined) {
                        setPromotionForm({ ...promotionForm, DiscountAmount: 0 })
                        return
                      }
                      const cleaned = inputValue.replace(/^0+(?=\d)/, '') || inputValue
                      const numValue = parseFloat(cleaned) || 0
                      setPromotionForm({ ...promotionForm, DiscountAmount: numValue })
                    }}
                    onFocus={(e) => {
                      if (promotionForm.DiscountAmount === 0) {
                        e.target.select()
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="เช่น 290"
                  />
                  {getSelectedProduct() && (
                    <p className="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      ราคาปกติสินค้า X: ฿{Number(getSelectedProduct().price || 0).toLocaleString()} / ชิ้น
                    </p>
                  )}
                </div>
              )}

              {promotionForm.Type === 'second_item_discount' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">รูปแบบส่วนลดชิ้นที่ 2 *</label>
                    <div className="flex gap-4 text-sm mt-1">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="secondItemDiscountMode"
                          checked={promotionForm.secondItemDiscountMode === 'percent'}
                          onChange={() =>
                            setPromotionForm((f) => ({
                              ...f,
                              secondItemDiscountMode: 'percent',
                              DiscountAmount: 0
                            }))
                          }
                        />
                        เปอร์เซ็นต์ (%)
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="secondItemDiscountMode"
                          checked={promotionForm.secondItemDiscountMode === 'fixed'}
                          onChange={() =>
                            setPromotionForm((f) => ({
                              ...f,
                              secondItemDiscountMode: 'fixed',
                              DiscountPercentage: 0,
                              MaxDiscount: 0
                            }))
                          }
                        />
                        จำนวนเงิน (บาท/ชิ้น)
                      </label>
                    </div>
                  </div>
                  {promotionForm.secondItemDiscountMode === 'percent' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          เปอร์เซ็นต์ลดชิ้นที่ 2 (%) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="0.01"
                          value={
                            promotionForm.DiscountPercentage === 0
                              ? ''
                              : promotionForm.DiscountPercentage
                          }
                          onChange={(e) => {
                            const v = e.target.value
                            setPromotionForm({
                              ...promotionForm,
                              DiscountPercentage: v === '' ? 0 : parseFloat(v) || 0
                            })
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="เช่น 50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ส่วนลดสูงสุด (บาท) (0 = ไม่จำกัด)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={promotionForm.MaxDiscount === 0 ? '' : promotionForm.MaxDiscount}
                          onChange={(e) => {
                            const v = e.target.value
                            setPromotionForm({
                              ...promotionForm,
                              MaxDiscount: v === '' ? 0 : parseFloat(v) || 0
                            })
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="100"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ลดต่อชิ้นที่ 2,4,6… (บาท) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={promotionForm.DiscountAmount === 0 ? '' : promotionForm.DiscountAmount}
                        onChange={(e) => {
                          const v = e.target.value
                          setPromotionForm({
                            ...promotionForm,
                            DiscountAmount: v === '' ? 0 : parseFloat(v) || 0
                          })
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="เช่น 30"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จำกัดครั้งต่อคน (0 = ไม่จำกัด)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={promotionForm.UsageLimit === 0 ? '' : promotionForm.UsageLimit}
                    onChange={(e) => {
                      const v = e.target.value
                      setPromotionForm({
                        ...promotionForm,
                        UsageLimit: v === '' ? 0 : parseInt(v, 10) || 0
                      })
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="เช่น 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จำกัดครั้งรวมทั้งโปร (0 = ไม่จำกัด)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={promotionForm.TotalUsageLimit === 0 ? '' : promotionForm.TotalUsageLimit}
                    onChange={(e) => {
                      const v = e.target.value
                      setPromotionForm({
                        ...promotionForm,
                        TotalUsageLimit: v === '' ? 0 : parseInt(v, 10) || 0
                      })
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="เช่น 100"
                  />
                </div>
              </div>

              {/* MinPurchase */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ยอดซื้อขั้นต่ำ (บาท) (0 = ไม่จำกัด)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                      value={promotionForm.MinPurchase === 0 ? '' : promotionForm.MinPurchase}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          setPromotionForm({ ...promotionForm, MinPurchase: 0 })
                          return
                        }
                        // Remove leading zeros (but keep decimal point)
                        const cleaned = inputValue.replace(/^0+(?=\d)/, '') || inputValue
                        const numValue = parseFloat(cleaned) || 0
                        setPromotionForm({ ...promotionForm, MinPurchase: numValue })
                      }}
                      onFocus={(e) => {
                        if (promotionForm.MinPurchase === 0) {
                          e.target.select()
                        }
                      }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="เช่น 500"
                />
              </div>

              {/* ValidFrom */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่เริ่มต้น
                </label>
                <input
                  type="date"
                  value={promotionForm.ValidFrom}
                  onChange={(e) => setPromotionForm({ ...promotionForm, ValidFrom: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* ValidUntil */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่สิ้นสุด
                </label>
                <p className="text-xs text-gray-500 mb-1">นับถึงสิ้นวัน (23:59) ของวันที่เลือก</p>
                <input
                  type="date"
                  value={promotionForm.ValidUntil}
                  onChange={(e) => setPromotionForm({ ...promotionForm, ValidUntil: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  สถานะ
                </label>
                <select
                  value={promotionForm.Status}
                  onChange={(e) => setPromotionForm({ ...promotionForm, Status: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="active">ใช้งาน</option>
                  <option value="inactive">ปิดใช้งาน</option>
                </select>
              </div>

              {promotionCheckoutPreview && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-semibold mb-1">ตัวอย่างบนหน้าชำระเงิน ({promotionCheckoutPreview.qty} ชิ้น)</p>
                  <p>
                    ราคาปกติ ฿{promotionCheckoutPreview.unitPrice.toLocaleString()}/ชิ้น ×{' '}
                    {promotionCheckoutPreview.qty} = ฿{promotionCheckoutPreview.subtotal.toLocaleString()}
                  </p>
                  <p className="font-medium">
                    ส่วนลดโปร (ประมาณ): ฿{promotionCheckoutPreview.discount.toLocaleString()} → จ่าย ฿
                    {promotionCheckoutPreview.payAfter.toLocaleString()}
                  </p>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียด
                </label>
                <textarea
                  value={promotionForm.Description}
                  onChange={(e) => setPromotionForm({ ...promotionForm, Description: e.target.value })}
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="รายละเอียดโปรโมชั่น..."
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSavePromotion}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
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

