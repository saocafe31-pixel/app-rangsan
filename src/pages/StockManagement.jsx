import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { productService } from '../services/productService'
import { imageService } from '../services/imageService'
import { generateProductQrDataUrl, downloadQrImage } from '../utils/productQr'
import { supplierService } from '../services/supplierService'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { allowedViewerEmailsToFormText, mergeEmailIntoAllowedViewerText, parseAllowedViewerEmailsFromText } from '../utils/helpers'
import {
  MAX_PRICE_TIERS,
  emptyPriceTierFormRow,
  validatePriceTierFormRows,
  priceTiersToFormRows
} from '../utils/priceTiers'
import { fetchCustomersForVisibilityPicker } from '../services/userDirectoryService'
import { getEffectiveStock } from '../utils/orderBundleLineUtils'

const STOCK_VIEW_ALL = 'all'
const STOCK_VIEW_BY_SUPPLIER = 'by_supplier'
const SUPPLIER_UNASSIGNED_LABEL = 'ไม่ระบุซัพพลาย'

function getProductSupplierName(product) {
  const name = String(product?.supplier || product?.Supplier || '').trim()
  return name || SUPPLIER_UNASSIGNED_LABEL
}

function emptyOptionValueRow() {
  return { label: '', price: '0' }
}

function emptyOptionRow() {
  return { name: '', required: true, valueRows: [emptyOptionValueRow()] }
}

function toOptionRowsFromProductOptions(productOptions) {
  if (!Array.isArray(productOptions)) return []
  return productOptions
    .map((o) => ({
      name: o?.name || '',
      required: Boolean(o?.required),
      valueRows: Array.isArray(o?.values) && o.values.length > 0
        ? o.values.map((v) => ({
            label: String(v?.label ?? v ?? '').trim(),
            price: String(Math.max(0, Number(v?.price) || 0))
          }))
        : [emptyOptionValueRow()]
    }))
    .filter((o) => o.name || (o.valueRows || []).some((v) => String(v?.label || '').trim()))
}

function buildProductOptionsPayload(optionRows) {
  return (optionRows || [])
    .map((row) => {
      const name = String(row?.name || '').trim()
      const values = (row?.valueRows || [])
        .map((v) => ({
          label: String(v?.label || '').trim(),
          price: Math.max(0, Number(v?.price) || 0)
        }))
        .filter((v) => v.label)
      return { name, required: Boolean(row?.required), values }
    })
    .filter((o) => o.name && o.values.length > 0)
}

function emptyForm() {
  return {
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
    allowedViewerEmailsText: '',
    orderStep: '1',
    productOptionRows: [],
    priceTierRows: []
  }
}

export default function StockManagement({ user }) {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false)
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [sortBy, setSortBy] = useState('id') // 'id' | 'name'
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'
  const [stockViewMode, setStockViewMode] = useState(STOCK_VIEW_ALL)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const itemsPerPage = 20
  const [visibilityPickList, setVisibilityPickList] = useState([])
  const [visibilityPickLoading, setVisibilityPickLoading] = useState(false)
  const [visibilitySelectSeq, setVisibilitySelectSeq] = useState(0)

  useEffect(() => {
    fetchProducts()
    fetchCategories()
    fetchSuppliers()
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

  // Debounced search (โหมดทั้งหมด = ค้นหาจาก API · โหมดซัพ = กรองในเครื่อง)
  useEffect(() => {
    if (stockViewMode === STOCK_VIEW_BY_SUPPLIER) {
      setIsSearching(false)
      return
    }

    if (searchTerm.trim() === '') {
      fetchProducts()
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(() => {
      searchProducts(searchTerm)
    }, 500)

    return () => clearTimeout(timeout)
  }, [searchTerm, stockViewMode])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      // Fetch all products without pagination limit
      const data = await productService.getAllProducts(user, '')
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
      setIsSearching(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('Category')
        .not('Category', 'is', null)
        .neq('Category', '')

      if (error) {
        console.error('Error fetching categories:', error)
        return
      }

      // Get unique categories
      const uniqueCategories = new Set()
      if (data) {
        data.forEach(product => {
          const category = product.Category || product.category
          if (category && category.trim() !== '') {
            uniqueCategories.add(category.trim())
          }
        })
      }

      const categoriesArray = Array.from(uniqueCategories).sort()
      setCategories(categoriesArray)
    } catch (error) {
      console.error('Error fetching categories:', error)
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

  const handleAddCategory = async () => {
    if (!newCategoryName || newCategoryName.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุชื่อหมวดหมู่',
        text: 'กรุณากรอกชื่อหมวดหมู่'
      })
      return
    }

    const trimmedName = newCategoryName.trim()
    
    // Check if category already exists
    if (categories.includes(trimmedName)) {
      Swal.fire({
        icon: 'info',
        title: 'หมวดหมู่มีอยู่แล้ว',
        text: `หมวดหมู่ "${trimmedName}" มีอยู่ในระบบแล้ว`
      })
      setNewCategoryName('')
      setIsAddCategoryModalOpen(false)
      setFormData({ ...formData, category: trimmedName })
      return
    }

    try {
      // Add to categories list
      const updatedCategories = [...categories, trimmedName].sort()
      setCategories(updatedCategories)
      
      // Set as selected category
      setFormData({ ...formData, category: trimmedName })
      
      // Close modal
      setIsAddCategoryModalOpen(false)
      setNewCategoryName('')
      
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มหมวดหมู่สำเร็จ',
        text: `เพิ่มหมวดหมู่ "${trimmedName}" เรียบร้อย`,
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error adding category:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มหมวดหมู่ได้'
      })
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
      setFormData({ ...formData, supplier: trimmedName })
      return
    }

    try {
      // Add to suppliers list
      const updatedSuppliers = [...suppliers, trimmedName].sort()
      setSuppliers(updatedSuppliers)
      
      // Set as selected supplier
      setFormData({ ...formData, supplier: trimmedName })
      
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

  const searchProducts = async (term) => {
    setIsSearching(true)
    try {
      // Fetch all matching products without pagination limit when searching
      const data = await productService.getAllProducts(user, term)
      setProducts(data)
      setCurrentPage(1) // Reset to first page when searching
    } catch (error) {
      console.error('Error searching products:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถค้นหาสินค้าได้'
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleEditStock = async (product) => {
    if (product.isBundle === true) {
      Swal.fire({
        icon: 'info',
        title: 'สต็อกชุดสินค้า',
        html: '<p class="text-gray-700">สต็อกของชุดเชื่อมกับ<strong>สินค้าหลัก</strong> — กรุณาไปแก้ที่สินค้าหลักในรายการสินค้า</p>',
        confirmButtonText: 'ตกลง'
      })
      return
    }
    const { value: newStock } = await Swal.fire({
      title: `แก้ไขสต็อก: ${product.name}`,
      input: 'number',
      inputValue: product.stock,
      inputAttributes: {
        min: 0,
        step: 1
      },
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      inputValidator: (value) => {
        if (value === '' || value === null || value === undefined) {
          return 'กรุณาระบุจำนวนสต็อก'
        }
        if (parseInt(value) < 0) {
          return 'จำนวนสต็อกต้องมากกว่าหรือเท่ากับ 0'
        }
      }
    })

    if (newStock !== undefined && newStock !== null) {
      try {
        Swal.fire({
          title: 'กำลังอัปเดต...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        })

        await productService.updateStock(product.id, parseInt(newStock))
        
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ',
          text: 'สต็อกอัปเดตแล้ว',
          timer: 1500,
          showConfirmButton: false
        })

        // Refresh products
        await fetchProducts()
      } catch (error) {
        console.error('Error updating stock:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถอัปเดตสต็อกได้'
        })
      }
    }
  }

  const handleRestock = async (product) => {
    if (product.isBundle === true) {
      Swal.fire({
        icon: 'info',
        title: 'เติมสต็อกชุด',
        html: '<p class="text-gray-700">ชุดสินค้าใช้สต็อกของ<strong>สินค้าหลัก</strong> — กรุณาไปแก้ที่สินค้าหลัก</p>',
        confirmButtonText: 'ตกลง'
      })
      return
    }
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

        // Refresh products
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

  const handleAddProduct = () => {
    setFormData(emptyForm())
    setEditingProduct(null)
    setShowAddModal(true)
  }

  const handleEditProduct = (product) => {
    if (product.isBundle === true) {
      navigate(`/admin/bundle-composer?edit=${encodeURIComponent(product.id)}`)
      return
    }
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
      allowedViewerEmailsText: allowedViewerEmailsToFormText(product.allowedViewerEmails),
      orderStep: String(product.orderStep ?? 1),
      productOptionRows: toOptionRowsFromProductOptions(product.productOptions),
      priceTierRows: priceTiersToFormRows(product.priceTiers)
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

    const productOptions = buildProductOptionsPayload(formData.productOptionRows)

    const bundleLinesPayload = []

    const tierCheck = validatePriceTierFormRows(formData.orderStep, formData.priceTierRows)
    if (!tierCheck.ok) {
      Swal.fire({ icon: 'warning', title: 'ราคาขั้นบันไดไม่ถูกต้อง', text: tierCheck.message })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังบันทึก...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      if (editingProduct) {
        const newId = (formData.id || '').trim()
        if (!newId) {
          Swal.close()
          Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสสินค้า' })
          return
        }
        await productService.updateProduct(editingProduct.id, {
          id: newId,
          name: formData.name,
          price: Number(formData.price),
          cost: formData.cost ? Number(formData.cost) : undefined,
          stock: Number(formData.stock) || 0,
          image: formData.image,
          category: formData.category,
          detail: formData.detail,
          supplier: formData.supplier,
          unit: formData.unit,
          weight: formData.weight ? Number(formData.weight) : 0,
          minStock: Number(formData.minStock) || 5,
          franchisePrice: formData.franchisePrice ? Number(formData.franchisePrice) : Number(formData.price),
          franchiseAvailable: formData.saleToFranchise !== false,
          visibleOnHome: formData.visibleOnHome !== false,
          saleToFranchise: formData.saleToFranchise !== false,
          saleToRegular: formData.saleToRegular !== false,
          saleRestrictedToUsers: formData.saleRestrictedToUsers === true,
          allowedViewerEmailsText: formData.allowedViewerEmailsText || '',
          orderStep: Math.max(1, parseInt(formData.orderStep, 10) || 1),
          isBundle: false,
          bundleFlexible: false,
          bundleComponentSumEqualsPrimary: false,
          bundlePrimaryProductId: '',
          productOptions,
          bundleLines: bundleLinesPayload,
          priceTiers: tierCheck.tiers
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
          isBundle: false,
          bundleFlexible: false,
          bundleComponentSumEqualsPrimary: false,
          bundlePrimaryProductId: '',
          productOptions,
          bundleLines: bundleLinesPayload,
          priceTiers: tierCheck.tiers
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
      await fetchProducts()
      await fetchCategories() // Refresh categories list
      await fetchSuppliers() // Refresh suppliers list
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกสินค้าได้'
      })
    }
  }

  const handleDeleteProduct = async () => {
    if (!editingProduct) return

    const { isConfirmed } = await Swal.fire({
      title: 'ยืนยันการลบสินค้า',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการลบสินค้า <strong>${editingProduct.name}</strong> (${editingProduct.id}) หรือไม่?</p>
          <p class="text-sm text-red-600 font-bold">การลบสินค้าจะไม่สามารถกู้คืนได้</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบสินค้า',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280'
    })

    if (!isConfirmed) return

    try {
      Swal.fire({
        title: 'กำลังลบสินค้า...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      await productService.deleteProduct(editingProduct.id)

      Swal.fire({
        icon: 'success',
        title: 'ลบสินค้าสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })

      setShowEditModal(false)
      setEditingProduct(null)
      await fetchProducts()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถลบสินค้าได้'
      })
    }
  }

  const stockLookupForBundles = useMemo(() => {
    const m = new Map()
    ;(products || []).forEach((p) => {
      const id = String(p?.id || p?.ProductID || '').trim()
      if (id) m.set(id, Math.max(0, Number(p.stock) || 0))
    })
    return m
  }, [products])

  const supplierSummaries = useMemo(() => {
    const map = new Map()
    ;(products || []).forEach((p) => {
      const supplierName = getProductSupplierName(p)
      const stock =
        p.isBundle === true ? getEffectiveStock(p, stockLookupForBundles) : Math.max(0, Number(p.stock) || 0)
      const minStock = Number(p.minStock) || 5
      const isLow = stock < 10 || stock < minStock

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
  }, [products, stockLookupForBundles])

  const supplierCardsFiltered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return supplierSummaries
    return supplierSummaries.filter((s) => s.name.toLowerCase().includes(q))
  }, [supplierSummaries, searchTerm])

  const productsForListing = useMemo(() => {
    let list = products || []
    if (stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier) {
      list = list.filter((p) => getProductSupplierName(p) === selectedSupplier)
    }
    const q = searchTerm.trim().toLowerCase()
    if (q && stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier) {
      list = list.filter((p) => {
        const name = String(p.name || p.ProductName || '').toLowerCase()
        const id = String(p.id || p.ProductID || '').toLowerCase()
        return name.includes(q) || id.includes(q)
      })
    }
    return list
  }, [products, stockViewMode, selectedSupplier, searchTerm])

  // จัดเรียงตามรหัสสินค้า หรือ ชื่อ
  const filteredProducts = useMemo(
    () =>
      [...productsForListing].sort((a, b) => {
        const aVal = sortBy === 'id' ? (a.id || a.ProductID || '') : (a.name || a.ProductName || '')
        const bVal = sortBy === 'id' ? (b.id || b.ProductID || '') : (b.name || b.ProductName || '')
        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()
        const cmp = aStr.localeCompare(bStr, 'th')
        return sortOrder === 'asc' ? cmp : -cmp
      }),
    [productsForListing, sortBy, sortOrder]
  )

  const showProductTable =
    stockViewMode === STOCK_VIEW_ALL || (stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier)

  const handleStockViewModeChange = (mode) => {
    setStockViewMode(mode)
    setSelectedSupplier(null)
    setCurrentPage(1)
    if (mode === STOCK_VIEW_BY_SUPPLIER) {
      if (searchTerm.trim()) setSearchTerm('')
      fetchProducts()
    }
  }

  const handleSelectSupplier = (supplierName) => {
    setSelectedSupplier(supplierName)
    setCurrentPage(1)
    setSearchTerm('')
  }

  const handleBackToSuppliers = () => {
    setSelectedSupplier(null)
    setCurrentPage(1)
    setSearchTerm('')
  }

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const displayedProducts = useMemo(() => {
    const slice = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    return slice.map((p) =>
      p.isBundle === true ? { ...p, stock: getEffectiveStock(p, stockLookupForBundles) } : p
    )
  }, [filteredProducts, currentPage, itemsPerPage, stockLookupForBundles])

  if (loading && products.length === 0) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />

      <div className="flex">
        <Sidebar user={user} />

        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
              <h1 className="text-2xl font-bold text-gray-900">จัดการสต็อก</h1>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={() => navigate('/admin/stock/qr-codes')}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition"
                >
                  <Icon icon="fa-qrcode" />
                  <span>QR Code รายการสินค้า</span>
                </button>
                <Link
                  to="/admin/bundle-composer"
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
                >
                  <Icon icon="fa-cubes" />
                  <span>จัดชุดสินค้า</span>
                </Link>
                <button
                  onClick={handleAddProduct}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
                >
                  <Icon icon="fa-plus" />
                  <span>เพิ่มสินค้าใหม่</span>
                </button>
              </div>
            </div>

            {/* Search + มุมมอง */}
            <div className="sticky top-16 z-40 bg-gray-50 py-4 -mx-6 px-6 border-b border-gray-200 shadow-sm mb-6 space-y-3">
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
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder={
                    stockViewMode === STOCK_VIEW_BY_SUPPLIER && !selectedSupplier
                      ? 'ค้นหาชื่อซัพพลายเออร์...'
                      : stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier
                        ? `ค้นหาสินค้าใน "${selectedSupplier}"...`
                        : 'ค้นหาชื่อสินค้าเพื่อจัดการสต็อก...'
                  }
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white shadow-sm"
                />
                <Icon icon="fa-search" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                {isSearching && stockViewMode === STOCK_VIEW_ALL && (
                  <Icon icon="fa-spinner" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                )}
              </div>
            </div>

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
                  {filteredProducts.length.toLocaleString()} รายการสินค้า
                </span>
              </div>
            )}

            {stockViewMode === STOCK_VIEW_BY_SUPPLIER && !selectedSupplier && (
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
                            <span>สต็อกรวม (ชิ้น)</span>
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
            )}

            {/* Products Table */}
            {showProductTable && (
            <>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="bg-gray-100 font-bold uppercase text-xs text-gray-600">
                  <tr>
                    <th className="p-4">รูปภาพ</th>
                    <th className="p-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('id')
                          setSortOrder((prev) => (sortBy === 'id' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'))
                        }}
                        className="flex items-center gap-1 hover:text-emerald-600 transition text-left"
                      >
                        รหัสสินค้า
                        {sortBy === 'id' && (sortOrder === 'asc' ? <Icon icon="fa-sort-up" /> : <Icon icon="fa-sort-down" />)}
                        {sortBy !== 'id' && <Icon icon="fa-sort" className="text-gray-300" />}
                      </button>
                    </th>
                    <th className="p-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('name')
                          setSortOrder((prev) => (sortBy === 'name' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'))
                        }}
                        className="flex items-center gap-1 hover:text-emerald-600 transition text-left"
                      >
                        ชื่อสินค้า
                        {sortBy === 'name' && (sortOrder === 'asc' ? <Icon icon="fa-sort-up" /> : <Icon icon="fa-sort-down" />)}
                        {sortBy !== 'name' && <Icon icon="fa-sort" className="text-gray-300" />}
                      </button>
                    </th>
                    <th className="p-4 text-center">คงเหลือ</th>
                    <th className="p-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isSearching && searchTerm.trim() !== '' && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        <Icon icon="fa-spinner" className="animate-spin text-2xl mb-2 mx-auto" />
                        <p>กำลังค้นหา...</p>
                      </td>
                    </tr>
                  )}
                  {!isSearching && searchTerm.trim() !== '' && displayedProducts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        <Icon icon="fa-search" className="text-2xl mb-2 mx-auto" />
                        <p>ไม่พบสินค้าที่ค้นหา</p>
                      </td>
                    </tr>
                  )}
                  {(!isSearching || searchTerm.trim() === '') && displayedProducts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        <Icon icon="fa-box" className="text-2xl mb-2 mx-auto opacity-50" />
                        <p>ไม่พบสินค้า</p>
                      </td>
                    </tr>
                  )}
                  {(!isSearching || searchTerm.trim() === '') && displayedProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="p-4">
                        {product.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Icon icon="fa-image" className="text-gray-400 text-xl" />
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-gray-700">{product.id || product.ProductID || '-'}</span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold">{product.name}</div>
                        {(product.isBundle || (product.productOptions || []).length > 0) && (
                          <div className="text-[10px] font-bold text-amber-800 mt-1 space-x-1">
                            {product.isBundle && (
                              <span className="bg-amber-100 px-1 rounded">
                                {product.bundleComponentSumEqualsPrimary
                                  ? 'ชุด·ผลรวม=หลัก'
                                  : product.bundleFlexible
                                    ? 'ชุด·กำหนดเอง'
                                    : 'ชุด'}
                              </span>
                            )}
                            {(product.productOptions || []).length > 0 && (
                              <span className="bg-slate-100 text-slate-700 px-1 rounded">มีตัวเลือก</span>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] text-gray-400 uppercase mt-1">{product.category}</div>
                        {product.isBundle === true && (
                          <p className="text-[10px] text-amber-800 mt-1 font-semibold">คงเหลือชุด = สินค้าหลัก — แก้สต็อกที่สินค้าหลัก</p>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            product.stock < 10
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {product.stock} {product.unit || 'ชิ้น'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs flex items-center gap-1 font-bold"
                          >
                            <Icon icon="fa-edit" />
                            แก้ไขสินค้า
                          </button>
                          <button
                            type="button"
                            onClick={() => product.isBundle !== true && handleEditStock(product)}
                            disabled={product.isBundle === true}
                            title={product.isBundle === true ? 'ไปแก้ที่สินค้าหลัก' : ''}
                            className={`p-2 rounded transition text-xs flex items-center gap-1 border font-bold ${
                              product.isBundle === true
                                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-600'
                            }`}
                          >
                            <Icon icon="fa-box" />
                            {product.isBundle === true ? 'แก้ที่สินค้าหลัก' : 'แก้สต็อก'}
                          </button>
                          <button
                            type="button"
                            onClick={() => product.isBundle !== true && handleRestock(product)}
                            disabled={product.isBundle === true}
                            title={product.isBundle === true ? 'ไปแก้ที่สินค้าหลัก' : ''}
                            className={`p-2 rounded transition text-xs flex items-center gap-1 font-bold ${
                              product.isBundle === true
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            <Icon icon="fa-plus" />
                            {product.isBundle === true ? 'ไปแก้ที่สินค้าหลัก' : 'เติมของ'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <Icon icon="fa-chevron-left" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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

      {/* Add/Edit Product Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
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
                      placeholder={editingProduct ? '' : 'ว่างไว้เพื่อสร้างอัตโนมัติ'}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
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
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ต้นทุน</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">สต็อก</label>
                    {editingProduct?.isBundle === true ? (
                      <div>
                        <input
                          type="number"
                          readOnly
                          value={formData.stock}
                          className="w-full border-2 border-gray-100 rounded-lg p-3 bg-gray-100 text-gray-600 cursor-not-allowed outline-none"
                        />
                        <p className="text-xs text-amber-800 mt-1 font-semibold">ชุดสินค้า: สต็อกตามสินค้าหลัก — ไปแก้ที่สินค้าหลัก</p>
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    )}
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
                  <label className="block text-sm font-bold text-gray-700 mb-2">ขั้นตอนการสั่ง (หน่วย)</label>
                  <p className="text-xs text-gray-500 mb-1">จำนวนขั้นต่ำต่อครั้งที่ลูกค้าสั่งซื้อ (เช่น 1000 = สั่งทีละ 1,000 หน่วย) การเบิก/ตัดสต็อกยังเป็นทีละ 1 หน่วย</p>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.orderStep}
                    onChange={(e) => setFormData({ ...formData, orderStep: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="1"
                  />
                </div>

                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
                  <div className="font-bold text-gray-800">ราคาขั้นบันได (ตามจำนวนในตะกร้า)</div>
                  <p className="text-xs text-gray-600">
                    สูงสุด {MAX_PRICE_TIERS} ขั้น — ราคาในแต่ละขั้น = ราคาต่อหนึ่ง OrderStep เหมือน &quot;ราคา&quot;หลัก
                    แฟรนไชส์เว้นว่างราคาแฟรนไชส์ของขั้นได้ (จะใช้ราคาขั้นนั้น) — เกณฑ์ minQty ต้อง ≥ OrderStep และเป็นทวีคูณของ OrderStep
                  </p>
                  {(formData.priceTierRows || []).map((row, tIdx) => (
                    <div
                      key={tIdx}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-amber-100 bg-white rounded p-2"
                    >
                      <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-gray-600 mb-1">minQty</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="w-full border rounded p-2 text-sm"
                          value={row.minQty}
                          onChange={(e) => {
                            const next = [...(formData.priceTierRows || [])]
                            next[tIdx] = { ...next[tIdx], minQty: e.target.value }
                            setFormData({ ...formData, priceTierRows: next })
                          }}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-gray-600 mb-1">ราคา / OrderStep</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border rounded p-2 text-sm"
                          value={row.price}
                          onChange={(e) => {
                            const next = [...(formData.priceTierRows || [])]
                            next[tIdx] = { ...next[tIdx], price: e.target.value }
                            setFormData({ ...formData, priceTierRows: next })
                          }}
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-gray-600 mb-1">ราคาแฟรนไชส์ / OrderStep (ถ้ามี)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border rounded p-2 text-sm"
                          value={row.franchisePrice}
                          placeholder="ว่างได้"
                          onChange={(e) => {
                            const next = [...(formData.priceTierRows || [])]
                            next[tIdx] = { ...next[tIdx], franchisePrice: e.target.value }
                            setFormData({ ...formData, priceTierRows: next })
                          }}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <button
                          type="button"
                          className="text-red-600 text-sm font-bold w-full text-left md:text-right"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              priceTierRows: (formData.priceTierRows || []).filter((_, i) => i !== tIdx)
                            })
                          }
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                  {(formData.priceTierRows || []).length < MAX_PRICE_TIERS ? (
                    <button
                      type="button"
                      className="text-sm font-bold text-amber-800 hover:text-amber-950"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          priceTierRows: [...(formData.priceTierRows || []), emptyPriceTierFormRow()]
                        })
                      }
                    >
                      + เพิ่มขั้นราคา
                    </button>
                  ) : null}
                </div>

                <div className="border border-slate-200 bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="font-bold text-gray-800">ตัวเลือกสินค้า (สี / ขนาด ฯลฯ)</div>
                  <p className="text-xs text-gray-600">
                    เพิ่มตัวเลือกย่อยทีละรายการ พร้อมราคาเพิ่ม (ใส่ 0 ได้ถ้าไม่ต้องบวกเพิ่ม)
                  </p>
                  {(formData.productOptionRows || []).map((row, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg bg-white p-3 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                        <div className="md:col-span-7">
                          <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อตัวเลือก</label>
                          <input
                            className="w-full border rounded p-2 text-sm"
                            value={row.name}
                            placeholder="เช่น สี / ขนาด"
                            onChange={(e) => {
                              const next = [...(formData.productOptionRows || [])]
                              next[idx] = { ...next[idx], name: e.target.value }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                        </div>
                        <label className="md:col-span-3 flex items-center gap-2 text-sm mt-5 md:mt-0">
                          <input
                            type="checkbox"
                            checked={row.required}
                            onChange={(e) => {
                              const next = [...(formData.productOptionRows || [])]
                              next[idx] = { ...next[idx], required: e.target.checked }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                          บังคับเลือก
                        </label>
                        <button
                          type="button"
                          className="md:col-span-2 text-red-600 text-sm font-bold text-left md:text-right"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              productOptionRows: (formData.productOptionRows || []).filter((_, i) => i !== idx)
                            })
                          }
                        >
                          ลบตัวเลือก
                        </button>
                      </div>

                      {(row.valueRows || []).map((vRow, vIdx) => (
                        <div key={`${idx}-${vIdx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                          <div className="md:col-span-8">
                            <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อตัวเลือกย่อย</label>
                            <input
                              className="w-full border rounded p-2 text-sm"
                              placeholder="เช่น แดง, น้ำเงิน, XL"
                              value={vRow.label}
                              onChange={(e) => {
                                const next = [...(formData.productOptionRows || [])]
                                const valueRows = [...(next[idx].valueRows || [])]
                                valueRows[vIdx] = { ...valueRows[vIdx], label: e.target.value }
                                next[idx] = { ...next[idx], valueRows }
                                setFormData({ ...formData, productOptionRows: next })
                              }}
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">ราคาเพิ่ม</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border rounded p-2 text-sm"
                              placeholder="0"
                              value={vRow.price}
                              onChange={(e) => {
                                const next = [...(formData.productOptionRows || [])]
                                const valueRows = [...(next[idx].valueRows || [])]
                                valueRows[vIdx] = { ...valueRows[vIdx], price: e.target.value }
                                next[idx] = { ...next[idx], valueRows }
                                setFormData({ ...formData, productOptionRows: next })
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            className="md:col-span-1 text-red-600 text-sm font-bold pb-2"
                            onClick={() => {
                              const next = [...(formData.productOptionRows || [])]
                              const filtered = (next[idx].valueRows || []).filter((_, i) => i !== vIdx)
                              next[idx] = { ...next[idx], valueRows: filtered.length ? filtered : [emptyOptionValueRow()] }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          >
                            ลบ
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="text-sm font-bold text-emerald-800"
                        onClick={() => {
                          const next = [...(formData.productOptionRows || [])]
                          next[idx] = {
                            ...next[idx],
                            valueRows: [...(next[idx].valueRows || []), emptyOptionValueRow()]
                          }
                          setFormData({ ...formData, productOptionRows: next })
                        }}
                      >
                        + เพิ่มตัวเลือกย่อย
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm font-bold text-emerald-800 hover:underline"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        productOptionRows: [
                          ...(formData.productOptionRows || []),
                          emptyOptionRow()
                        ]
                      })
                    }
                  >
                    + เพิ่มตัวเลือก
                  </button>
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
                    <div className="flex gap-2">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="flex-1 border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      >
                        <option value="">-- เลือกหมวดหมู่ --</option>
                        {categories.map((category, idx) => (
                          <option key={idx} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCategoryName('')
                          setIsAddCategoryModalOpen(true)
                        }}
                        className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                        title="เพิ่มหมวดหมู่ใหม่"
                      >
                        <Icon icon="fa-plus" />
                        เพิ่ม
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">หน่วย</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    >
                      <option value="ชิ้น">ชิ้น</option>
                      <option value="กล่อง">กล่อง</option>
                      <option value="ลัง">ลัง</option>
                      <option value="ถุง">ถุง</option>
                      <option value="ขวด">ขวด</option>
                      <option value="กระป๋อง">กระป๋อง</option>
                      <option value="แพ็ก">แพ็ก</option>
                      <option value="ใบ">ใบ</option>
                      <option value="กรัม">กรัม</option>
                      <option value="กิโลกรัม">กิโลกรัม</option>
                      <option value="ลิตร">ลิตร</option>
                      <option value="มิลลิลิตร">มิลลิลิตร</option>
                    </select>
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
                      step="0.01"
                      min="0"
                      value={formData.franchisePrice}
                      onChange={(e) => setFormData({ ...formData, franchisePrice: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      placeholder="0.00"
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

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ซัพพลายเออร์</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      className="flex-1 border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
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

                <div className="space-y-3 border-2 border-gray-200 rounded-xl p-4 bg-gray-50">
                  <p className="text-sm font-bold text-gray-800">การแสดงในหน้าแคตตาล็อกและกลุ่มลูกค้า</p>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="stock-visible-home"
                      checked={formData.visibleOnHome !== false}
                      onChange={(e) => setFormData({ ...formData, visibleOnHome: e.target.checked })}
                      className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="stock-visible-home" className="text-sm font-bold text-gray-700 leading-snug">
                      แสดงสินค้าในหน้าแคตตาล็อก (หน้าหลัก)
                      <span className="block text-xs font-normal text-gray-500 mt-0.5">ปิดตัวนี้เพื่อซ่อนรายการจากหน้าหลัก (ยังแก้ไขในสต็อกได้)</span>
                    </label>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="stock-restricted-emails"
                      checked={formData.saleRestrictedToUsers === true}
                      onChange={(e) =>
                        setFormData({ ...formData, saleRestrictedToUsers: e.target.checked })
                      }
                      className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="stock-restricted-emails" className="text-sm font-bold text-gray-700 leading-snug">
                      จำกัดเฉพาะผู้ใช้ที่ระบุอีเมล
                      <span className="block text-xs font-normal text-gray-500 mt-0.5">
                        เมื่อเปิด จะมองเห็นได้เฉพาะอีเมลในรายการด้านล่าง (ไม่ใช้ตัวเลือกแฟรนไชส์/ทั่วไป)
                      </span>
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
                          ลูกค้าที่อยู่ในรายการจะเห็นราคาตามประเภทบัญชีของตัวเอง (แฟรนไชส์ = ราคาแฟรนไชส์, ลูกค้าทั่วไป = ราคาปกติ)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          รายการอีเมล (คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่ — แก้ไขหรือพิมพ์เพิ่มได้)
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
                          id="stock-sale-franchise"
                          checked={formData.saleToFranchise !== false}
                          onChange={(e) =>
                            setFormData({ ...formData, saleToFranchise: e.target.checked })
                          }
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <label htmlFor="stock-sale-franchise" className="text-sm font-bold text-gray-700">
                          เปิดให้ลูกค้าแฟรนไชส์
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="stock-sale-regular"
                          checked={formData.saleToRegular !== false}
                          onChange={(e) =>
                            setFormData({ ...formData, saleToRegular: e.target.checked })
                          }
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <label htmlFor="stock-sale-regular" className="text-sm font-bold text-gray-700">
                          เปิดให้ลูกค้าทั่วไป
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4 flex-wrap">
                  {editingProduct && (
                    <>
                      <button
                        onClick={async () => {
                          const id = (formData.id || editingProduct.id || '').trim()
                          if (!id) {
                            Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสสินค้าก่อน', timer: 1500, showConfirmButton: false })
                            return
                          }
                          try {
                            const dataUrl = await generateProductQrDataUrl(id)
                            if (dataUrl) {
                              const name = (formData.name || editingProduct.name || id).replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, '_')
                              downloadQrImage(dataUrl, `qr-${name}-${id}.png`)
                              Swal.fire({ icon: 'success', title: 'ดาวน์โหลด QR แล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                            }
                          } catch (e) {
                            Swal.fire({ icon: 'error', title: 'สร้าง QR ไม่สำเร็จ', text: e.message })
                          }
                        }}
                        className="px-4 py-3 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition flex items-center gap-2"
                      >
                        <Icon icon="fa-qrcode" />
                        ดาวน์โหลด QR สินค้า
                      </button>
                      <button
                        onClick={handleDeleteProduct}
                        className="px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition flex items-center gap-2"
                      >
                        <Icon icon="fa-trash" />
                        ลบสินค้า
                      </button>
                    </>
                  )}
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

      {/* Add Category Modal */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">เพิ่มหมวดหมู่ใหม่</h2>
                <button
                  onClick={() => {
                    setIsAddCategoryModalOpen(false)
                    setNewCategoryName('')
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อหมวดหมู่ *</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddCategory()
                      }
                    }}
                    placeholder="ระบุชื่อหมวดหมู่"
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleAddCategory}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    เพิ่มหมวดหมู่
                  </button>
                  <button
                    onClick={() => {
                      setIsAddCategoryModalOpen(false)
                      setNewCategoryName('')
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
