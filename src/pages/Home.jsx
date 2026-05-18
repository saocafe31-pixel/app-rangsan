import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProducts } from '../hooks/useProducts'
import { useCart } from '../hooks/useCart'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import ProductCard from '../components/products/ProductCard'
import BundleSelectionModal from '../components/products/BundleSelectionModal'
import Cart from '../components/orders/Cart'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import { supabase } from '../utils/supabase'
import {
  normalizeProducts,
  filterProductsForStorefront,
  escapeForIlikeExact,
  buildProductTextSearchOrFilter,
  makeCartLineId,
  escapeHtml
} from '../utils/helpers'
import { maxBundleOrderQty } from '../utils/bundleUtils'
import { cartWouldAddDifferentSupplier } from '../utils/cartSupplierUtils'
import { getPricingShapeForBundlePrimary } from '../utils/priceTiers'
import { collectBundlePrimaryProductIds, getEffectiveStock } from '../utils/orderBundleLineUtils'
import { getUiTexts } from '../services/shopSettingsService'
import { productService } from '../services/productService'

export default function Home({ user, setUser }) {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedSupplier, setSelectedSupplier] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSearching, setIsSearching] = useState(false)
  const [isFiltering, setIsFiltering] = useState(false)
  const [allSuppliers, setAllSuppliers] = useState(['All'])
  const [filteredProductsFromDB, setFilteredProductsFromDB] = useState([])
  const [uiTexts, setUiTexts] = useState({ welcome_message: '', footer_text: '' })
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [bundleModalOpen, setBundleModalOpen] = useState(false)
  const [bundleModalProduct, setBundleModalProduct] = useState(null)
  const [bundleModalMembers, setBundleModalMembers] = useState([])
  const [bundleModalInitialSelections, setBundleModalInitialSelections] = useState(null)
  const [bundleModalInitialOptions, setBundleModalInitialOptions] = useState(null)
  const [bundleEditLineId, setBundleEditLineId] = useState('')
  const itemsPerPage = 50

  useEffect(() => {
    getUiTexts().then(setUiTexts)
  }, [])
  
  const { products, loading, hasMore, search, loadMore, refresh } = useProducts(user)
  const { cart, addToCart, updateQuantity, removeFromCart, getItemCount, clearCart, updateCartStock } = useCart(user)
  
  const mergedCatalogById = useMemo(() => {
    const m = new Map()
    ;(products || []).forEach((p) => {
      const id = String(p?.id || '').trim()
      if (id) m.set(id, p)
    })
    ;(filteredProductsFromDB || []).forEach((p) => {
      const id = String(p?.id || '').trim()
      if (id) m.set(id, p)
    })
    return m
  }, [products, filteredProductsFromDB])

  const filteredProductsBase = useMemo(() => {
    const sourceProducts =
      selectedSupplier !== 'All' || (searchTerm && searchTerm.trim() !== '')
        ? filteredProductsFromDB
        : products
    let filtered = sourceProducts
    if (selectedCategory !== 'All') {
      filtered = filtered.filter((p) => p.category === selectedCategory)
    }
    return [...filtered].sort((a, b) =>
      String(a?.id || '').localeCompare(String(b?.id || ''), 'th', {
        numeric: true,
        sensitivity: 'base'
      })
    )
  }, [products, filteredProductsFromDB, selectedCategory, selectedSupplier, searchTerm])

  const missingPrimaryIds = useMemo(() => {
    const ids = collectBundlePrimaryProductIds(filteredProductsBase)
    return [...new Set(ids)].filter((id) => id && !mergedCatalogById.has(id))
  }, [filteredProductsBase, mergedCatalogById])

  const missingPrimaryKey = missingPrimaryIds.slice().sort().join(',')

  const [fetchedPrimaryStock, setFetchedPrimaryStock] = useState({})

  useEffect(() => {
    if (!missingPrimaryIds.length) {
      setFetchedPrimaryStock({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('ProductID, Stock')
          .in('ProductID', missingPrimaryIds)
        if (error) throw error
        const next = {}
        ;(data || []).forEach((row) => {
          const id = String(row.ProductID ?? row.productid ?? '').trim()
          if (id) next[id] = Math.max(0, Number(row.Stock ?? row.stock) || 0)
        })
        if (!cancelled) setFetchedPrimaryStock(next)
      } catch (e) {
        console.warn('[Home] primary stock fetch', e)
        if (!cancelled) setFetchedPrimaryStock({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [missingPrimaryKey])

  const primaryStockLookup = useMemo(() => {
    const map = new Map()
    mergedCatalogById.forEach((p, id) => {
      map.set(id, Math.max(0, Number(p?.stock) || 0))
    })
    Object.entries(fetchedPrimaryStock).forEach(([k, v]) => {
      map.set(k, Math.max(0, Number(v) || 0))
    })
    return map
  }, [mergedCatalogById, fetchedPrimaryStock])

  const filteredProducts = useMemo(() => {
    return (filteredProductsBase || []).map((p) => {
      if (p?.isBundle || p?.is_bundle) {
        return { ...p, stock: getEffectiveStock(p, primaryStockLookup) }
      }
      return p
    })
  }, [filteredProductsBase, primaryStockLookup])

  const productsForCartUpdate = useMemo(() => {
    return (products || []).map((p) =>
      p?.isBundle || p?.is_bundle ? { ...p, stock: getEffectiveStock(p, primaryStockLookup) } : p
    )
  }, [products, primaryStockLookup])

  // Update cart stock when catalog / primary lookup changes (สต็อกชุด = หลัก)
  useEffect(() => {
    if (productsForCartUpdate.length > 0 && cart.length > 0) {
      updateCartStock(productsForCartUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsForCartUpdate])

  // Listen for order placed event to refresh products
  useEffect(() => {
    const handleOrderPlaced = () => {
      console.log('Order placed event received, refreshing products...')
      // Small delay to ensure database is updated
      setTimeout(() => {
        refresh() // Force refresh products to get updated stock
      }, 500)
    }

    window.addEventListener('orderPlaced', handleOrderPlaced)

    return () => {
      window.removeEventListener('orderPlaced', handleOrderPlaced)
    }
  }, [refresh])

  // Fetch all suppliers from products table on mount (don't wait for products to load)
  useEffect(() => {
    const fetchAllSuppliers = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('Supplier')
          .not('Supplier', 'is', null)
          .neq('Supplier', '')

        if (error) {
          console.error('Error fetching suppliers:', error)
          return
        }

        const uniqueSuppliersSet = new Set()
        if (data) {
          data.forEach((product) => {
            const supplier = product.Supplier || product.supplier
            if (supplier && String(supplier).trim() !== '') {
              uniqueSuppliersSet.add(String(supplier).trim())
            }
          })
        }

        // Convert to sorted array and add 'All' option
        const suppliersArray = ['All', ...Array.from(uniqueSuppliersSet).sort()]
        setAllSuppliers(suppliersArray)
      } catch (error) {
        console.error('Error fetching suppliers:', error)
      }
    }

    fetchAllSuppliers()
  }, []) // Only run once on mount

  // Refresh products when navigating back to home page
  useEffect(() => {
    // Refresh when component mounts or when user changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh when tab becomes visible
        refresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Initial refresh on mount
    refresh()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]) // Refresh when user changes
  
  // Get unique categories and suppliers
  const uniqueCategories = useMemo(() => {
    const cats = ['All', ...new Set(products.map(p => p.category).filter(Boolean))]
    return cats
  }, [products])
  
  // Use suppliers from database (allSuppliers) instead of waiting for products to load
  // Also merge with suppliers from loaded products to ensure we have all suppliers
  const uniqueSuppliers = useMemo(() => {
    const suppliersSet = new Set(allSuppliers) // Start with suppliers from database
    
    // Add suppliers from loaded products (in case new suppliers were added)
    products.forEach(p => {
      if (p.supplier && p.supplier.trim() !== '') {
        suppliersSet.add(p.supplier.trim())
      }
    })
    
    // Convert to sorted array, ensuring 'All' is first
    const suppliersArray = Array.from(suppliersSet)
    if (!suppliersArray.includes('All')) {
      suppliersArray.unshift('All')
    } else {
      // Move 'All' to the front
      const allIndex = suppliersArray.indexOf('All')
      if (allIndex > 0) {
        suppliersArray.splice(allIndex, 1)
        suppliersArray.unshift('All')
      }
    }
    
    return suppliersArray.sort((a, b) => {
      if (a === 'All') return -1
      if (b === 'All') return 1
      return a.localeCompare(b)
    })
  }, [allSuppliers, products])
  
  // Fetch products from database when supplier is selected or search term is entered
  useEffect(() => {
    const fetchFilteredProducts = async () => {
      // Only fetch from DB if supplier is selected or search term exists
      const shouldFetchFromDB = selectedSupplier !== 'All' || (searchTerm && searchTerm.trim() !== '')
      
      if (!shouldFetchFromDB) {
        setFilteredProductsFromDB([])
        setIsFiltering(false)
        return
      }

      setIsFiltering(true)
      try {
        let query = supabase
          .from('products')
          .select('*')

        // ค้นหาข้อความ — ต้อง quote ค่าให้ PostgREST ไม่งั้นคำที่มี "." (เช่น 1.9) จะทำให้ or() พัง
        if (searchTerm && searchTerm.trim()) {
          const orClause = buildProductTextSearchOrFilter(searchTerm)
          if (orClause) query = query.or(orClause)
        }

        // กรองซัพ: ilike แบบเทียบทั้งสตริงไม่ match ถ้า DB มีช่องว่างหัวท้าย — ใช้ %...% + ไม่สนตัวพิมพ์
        if (selectedSupplier !== 'All') {
          const supInner = escapeForIlikeExact(selectedSupplier.trim())
          query = query.ilike('Supplier', `%${supInner}%`)
        }

        // Order by ProductName
        query = query.order('ProductName', { ascending: true })

        const { data, error } = await query

        if (error) {
          console.error('Error fetching filtered products:', error)
          setFilteredProductsFromDB([])
          return
        }

        // Get userType from user object
        const userType = user?.userType || user?.customerType || 'regular'
        const normalized = filterProductsForStorefront(
          normalizeProducts(data || [], userType),
          user
        )
        setFilteredProductsFromDB(normalized)
      } catch (error) {
        console.error('Error fetching filtered products:', error)
        setFilteredProductsFromDB([])
      } finally {
        setIsFiltering(false)
      }
    }

    // Debounce the fetch
    const timeoutId = setTimeout(() => {
      fetchFilteredProducts()
    }, 300) // Wait 300ms after user stops typing/selecting

    return () => clearTimeout(timeoutId)
  }, [selectedSupplier, searchTerm, user])

  const isBrowseMode =
    selectedSupplier === 'All' && !(searchTerm && searchTerm.trim() !== '')

  // โหมดดูทั้งหมด: โหลดทีละ 50 จากเซิร์ฟเวอร์ — แสดงทุกรายการที่โหลดมาแล้ว
  // ค้นหา/เลือกซัพ: ใช้ชุดจาก DB ครบชุด — ห้าม slice ตาม hasMore ของโหมดดูทั้งหมด
  const displayedProducts = useMemo(() => {
    if (!isBrowseMode) {
      return filteredProducts
    }
    if (hasMore) {
      return filteredProducts
    }
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return filteredProducts.slice(start, end)
  }, [filteredProducts, currentPage, hasMore, isBrowseMode])
  
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategory, selectedSupplier, searchTerm])
  
  // Handle search change - no longer need to call search() since we fetch from DB in useEffect
  const handleSearchChange = (value) => {
    setSearchTerm(value)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    // Search is handled by useEffect that watches searchTerm
  }

  const openBundleProductModal = useCallback(
    async (product, options = {}) => {
      if (!product?.isBundle) return false
      const bundleIds = Array.isArray(product.bundleLines)
        ? product.bundleLines.map((l) => String(l?.productId || '').trim()).filter(Boolean)
        : []
      if (bundleIds.length === 0) {
        await Swal.fire({ icon: 'error', title: 'Bundle ตั้งค่าไม่ครบ', text: 'ไม่พบรายการสมาชิกชุด' })
        return false
      }
      const rows = []
      for (const pid of bundleIds) {
        const found =
          (products || []).find((p) => String(p?.id || '').trim() === pid) ||
          (filteredProducts || []).find((p) => String(p?.id || '').trim() === pid)
        if (found) {
          rows.push(found)
          continue
        }
        try {
          const one = await productService.getProduct(pid)
          if (one) rows.push(one)
        } catch {
          // ignore missing component row
        }
      }
      setBundleModalProduct(product)
      setBundleModalMembers(rows)
      setBundleModalInitialSelections(
        options.initialSelections && typeof options.initialSelections === 'object'
          ? options.initialSelections
          : null
      )
      setBundleModalInitialOptions(
        options.initialSelectedOptions && typeof options.initialSelectedOptions === 'object'
          ? options.initialSelectedOptions
          : null
      )
      setBundleEditLineId(String(options.editLineId || '').trim())
      setBundleModalOpen(true)
      return true
    },
    [products, filteredProducts]
  )

  const handleConfirmBundle = useCallback(
    async (payload) => {
      const p = bundleModalProduct
      if (!p || !payload) return
      const primary = bundleModalMembers.find((x) => x.id === p.bundlePrimaryProductId)
      const tierBasis = getPricingShapeForBundlePrimary(p, primary)
      const lineProduct = { ...p, tierBasis: tierBasis || undefined }

      if (cartWouldAddDifferentSupplier(cart, lineProduct)) {
        const confirmAdd = await Swal.fire({
          icon: 'question',
          title: 'สินค้าคนละ Supplier',
          text: 'สินค้านี้อยู่คนละ Supplier กับสินค้าในตะกร้า ต้องการเพิ่มลงตะกร้าหรือไม่? เมื่อชำระเงินสามารถเลือกชำระรวมหรือแยกตาม Supplier ได้',
          showCancelButton: true,
          confirmButtonText: 'เพิ่มลงตะกร้า',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#16a34a'
        })
        if (!confirmAdd.isConfirmed) return
      }

      if (bundleEditLineId) {
        removeFromCart(bundleEditLineId)
      }

      if (payload.mode === 'flexible') {
        addToCart(lineProduct, Number(payload.primaryQty || 0), {
          selectedOptions: payload.selectedOptions || {},
          bundleFlexible: true,
          bundleSelections: payload.bundleSelections || {},
          bundlePrimaryProductId: p.bundlePrimaryProductId || '',
          bundleSelectionSummary: payload.summary || '',
          tierBasis: tierBasis || undefined
        })
      } else {
        addToCart(lineProduct, Number(payload.orderQty || 0), {
          selectedOptions: payload.selectedOptions || {}
        })
      }

      setBundleModalOpen(false)
      setBundleModalProduct(null)
      setBundleModalMembers([])
      setBundleModalInitialSelections(null)
      setBundleModalInitialOptions(null)
      setBundleEditLineId('')
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มลงตะกร้าแล้ว',
        timer: 1200,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      })
    },
    [bundleModalProduct, bundleModalMembers, cart, addToCart, bundleEditLineId, removeFromCart]
  )

  const handleReconfigureBundleFromCart = useCallback(
    async (item) => {
      if (!item?.isBundle || !item?.bundleFlexible) return
      setShowCart(false)
      await openBundleProductModal(item, {
        initialSelections:
          item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : null,
        initialSelectedOptions:
          item.selectedOptions && typeof item.selectedOptions === 'object' ? item.selectedOptions : null,
        editLineId: item.cartLineId || ''
      })
    },
    [openBundleProductModal]
  )
  
  const handleAddToCart = async (product) => {
    if (product.isBundle) {
      await openBundleProductModal(product)
      return
    }

    const optionDefs = product.productOptions || []
    let selectedOptions = {}
    if (optionDefs.length > 0) {
      const selectsHtml = optionDefs
        .map((o, i) => {
          const opts = (o.values || [])
            .map((v) => {
              const label = String(v?.label ?? v ?? '').trim()
              const extra = Math.max(0, Number(v?.price) || 0)
              const suffix = extra > 0 ? ` (+฿${extra.toLocaleString()})` : ''
              return `<option value="${escapeHtml(label)}">${escapeHtml(label + suffix)}</option>`
            })
            .join('')
          return `<div class="text-left mb-3"><label class="block text-sm font-bold text-gray-700 mb-1">${escapeHtml(o.name)}${
            o.required ? ' <span class="text-red-500">*</span>' : ''
          }</label><select id="po-opt-${i}" class="w-full border rounded p-2 text-gray-900">${opts}</select></div>`
        })
        .join('')
      const optRes = await Swal.fire({
        title: 'เลือกตัวเลือก',
        html: `<div class="text-sm text-gray-600 mb-2 text-left">${escapeHtml(product.name)}</div>${selectsHtml}`,
        showCancelButton: true,
        confirmButtonText: 'ดำเนินการต่อ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        focusConfirm: false,
        preConfirm: () => {
          const out = {}
          for (let i = 0; i < optionDefs.length; i++) {
            const sel = document.getElementById(`po-opt-${i}`)
            const v = sel ? String(sel.value).trim() : ''
            if (optionDefs[i].required && !v) {
              Swal.showValidationMessage(`กรุณาเลือก ${optionDefs[i].name}`)
              return false
            }
            if (v) out[optionDefs[i].name] = v
          }
          return out
        }
      })
      if (!optRes.isConfirmed || !optRes.value) return
      selectedOptions = optRes.value
    }

    let effProduct = { ...product }
    if (product.isBundle && !product.bundleFlexible && Array.isArray(product.bundleLines) && product.bundleLines.length > 0) {
      const map = new Map()
      products.forEach((p) => p?.id && map.set(p.id, p))
      filteredProducts.forEach((p) => p?.id && map.set(p.id, p))
      const maxB = maxBundleOrderQty(product, product.bundleLines, map)
      if (maxB <= 0) {
        Swal.fire({
          icon: 'warning',
          title: 'ขออภัย',
          text: 'ส่วนประกอบในชุดไม่พอสำหรับสั่งซื้อ',
          confirmButtonText: 'ตกลง'
        })
        return
      }
      const primaryShown = Math.max(0, Number(product.stock) || 0)
      effProduct = { ...product, stock: Math.min(primaryShown, maxB) }
    }

    if (effProduct.stock <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ขออภัย',
        text: product.isBundle ? 'ส่วนประกอบในชุดไม่พอสำหรับสั่งซื้อ' : 'สินค้าหมดสต็อก',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    const lineKey = makeCartLineId(product.id, selectedOptions)
    const existingItem = cart.find(
      (item) => (item.cartLineId || makeCartLineId(item.id, item.selectedOptions || {})) === lineKey
    )
    const currentQtyInCart = existingItem ? existingItem.qty : 0
    const availableStock = effProduct.stock - currentQtyInCart

    if (availableStock <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'เกินสต็อก',
        text: `สินค้านี้มีในตะกร้า ${currentQtyInCart} ${effProduct.unit || 'ชิ้น'} แล้ว และสั่งได้อีกไม่เกิน ${effProduct.stock} ${effProduct.unit || 'ชิ้น'}`,
        confirmButtonText: 'ตกลง'
      })
      return
    }

    const orderStep = Math.max(1, effProduct.orderStep || 1)
    const defaultQty = Math.min(orderStep, availableStock)
    const { value: quantity } = await Swal.fire({
      title: effProduct.name,
      text:
        orderStep > 1
          ? `สั่งได้ทีละ ${orderStep} ${effProduct.unit || 'ชิ้น'} (เหลือ ${availableStock} ${effProduct.unit || 'ชิ้น'}${
              currentQtyInCart > 0 ? `, มีในตะกร้า ${currentQtyInCart} ${effProduct.unit || 'ชิ้น'}` : ''
            })`
          : `ระบุจำนวน (เหลือ ${availableStock} ${effProduct.unit || 'ชิ้น'}${
              currentQtyInCart > 0 ? `, มีในตะกร้า ${currentQtyInCart} ${effProduct.unit || 'ชิ้น'}` : ''
            })`,
      input: 'number',
      inputValue: defaultQty,
      inputAttributes: {
        min: orderStep,
        max: availableStock,
        step: orderStep
      },
      showCancelButton: true,
      confirmButtonText: 'เพิ่มลงตะกร้า',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      inputValidator: (value) => {
        if (!value || parseInt(value, 10) <= 0) {
          return 'กรุณาระบุจำนวนที่มากกว่า 0'
        }
        const qty = parseInt(value, 10)
        if (qty > availableStock) {
          return `ระบุจำนวนได้ไม่เกิน ${availableStock} (รวมกับที่มีในตะกร้าแล้ว)`
        }
        if (qty % orderStep !== 0) {
          return `สินค้านี้สั่งได้ทีละ ${orderStep} ${effProduct.unit || 'ชิ้น'} เท่านั้น (เช่น ${orderStep}, ${orderStep * 2}, ...)`
        }
      }
    })

    if (quantity && parseInt(quantity, 10) > 0) {
      let qty = parseInt(quantity, 10)
      const step = effProduct.orderStep || 1
      qty = Math.round(qty / step) * step
      if (qty < step) qty = step
      if (qty > availableStock) {
        Swal.fire({
          icon: 'warning',
          title: 'เกินสต็อก',
          text: `ระบุจำนวนได้ไม่เกิน ${availableStock} (รวมกับที่มีในตะกร้าแล้ว)`,
          confirmButtonText: 'ตกลง'
        })
        return
      }
      if (cartWouldAddDifferentSupplier(cart, effProduct)) {
        const confirmAdd = await Swal.fire({
          icon: 'question',
          title: 'สินค้าคนละ Supplier',
          text: 'สินค้านี้อยู่คนละ Supplier กับสินค้าในตะกร้า ต้องการเพิ่มลงตะกร้าหรือไม่? เมื่อชำระเงินสามารถเลือกชำระรวมหรือแยกตาม Supplier ได้ และระบบจะสร้างเลขออเดอร์แยกกันต่อ Supplier',
          showCancelButton: true,
          confirmButtonText: 'เพิ่มลงตะกร้า',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#16a34a'
        })
        if (!confirmAdd.isConfirmed) return
      }
      addToCart(effProduct, qty, { selectedOptions })
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มลงตะกร้าแล้ว',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      })
    }
  }
  
  const handleProductClick = (product) => {
    handleAddToCart(product)
  }

  const handleCheckout = () => {
    if (cart.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ตะกร้าว่าง',
        text: 'กรุณาเพิ่มสินค้าลงตะกร้าก่อน',
        confirmButtonText: 'ตกลง'
      })
      return
    }
    setShowCart(false)
    navigate('/checkout')
  }

  // Check if user is franchise (has sidebar)
  const isFranchise = user?.userType === 'franchise' || user?.customerType === 'franchise'
  
  return (
    <div className={`min-h-screen bg-gray-50 ${isFranchise ? '' : 'pb-20'}`}>
      <Header 
        user={user} 
        cartItemCount={getItemCount()} 
        onCartClick={() => setShowCart(true)} 
      />
      {isFranchise && <Sidebar user={user} onMobileOpenChange={setSidebarMobileOpen} />}

      <div className={`max-w-7xl mx-auto px-4 py-6 transition-[margin] duration-300 ${isFranchise ? 'ml-0 md:ml-64' : ''} ${isFranchise && sidebarMobileOpen ? 'md:ml-64 ml-64' : ''}`}>
        {uiTexts.welcome_message && (
          <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-700">
            {uiTexts.welcome_message}
          </div>
        )}
        {/* Search and Filters - Sticky */}
        <div className="sticky top-16 z-40 flex flex-col gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100 -mx-4 px-4">
          {/* Search Bar */}
          <div className="relative">
            <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า..."
                className="w-full pl-10 pr-10 p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-gray-800 outline-none transition"
              />
              {isSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Icon icon="fa-spinner" className="animate-spin" />
                </span>
              )}
            </div>
          </div>
          
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {uniqueCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-gray-800 text-white shadow'
                    : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          
          {/* Supplier Filter */}
          <div className="relative">
            <select
              className="w-full p-2 pl-3 pr-10 border rounded-lg bg-gray-50 text-sm appearance-none outline-none focus:ring-2 focus:ring-gray-800 transition text-gray-700"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              {uniqueSuppliers.map((sup) => (
                <option key={sup} value={sup}>
                  {sup === 'All' ? 'ร้านค้า/ซัพพลายเออร์ทั้งหมด' : sup}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
              <Icon icon="fa-chevron-down" className="text-xs" />
            </div>
          </div>
        </div>

        {/* Loading State */}
        {(isSearching || isFiltering) && (searchTerm.trim() !== '' || selectedSupplier !== 'All') && (
          <div className="text-center py-8 text-gray-500">
            <Icon icon="fa-spinner" className="animate-spin text-2xl mb-2" />
            <p>กำลังค้นหา...</p>
          </div>
        )}
        
        {/* No Results */}
        {!isSearching && !isFiltering && (searchTerm.trim() !== '' || selectedSupplier !== 'All') && filteredProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Icon icon="fa-search" className="text-2xl mb-2" />
            <p>ไม่พบสินค้าที่ค้นหา</p>
          </div>
        )}
        
        {/* Products Grid */}
        {(!isSearching && !isFiltering) && (
          <>
            {loading && products.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
                <p className="mt-4 text-gray-600">กำลังโหลดสินค้า...</p>
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl">
                <Icon icon="fa-box-open" className="text-5xl text-gray-300 mb-4" />
                <p className="text-gray-600">ไม่พบสินค้า</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                  {displayedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={handleAddToCart}
                      onCardClick={handleProductClick}
                      user={user}
                    />
                  ))}
                </div>

                {/* Load More Button - Server-side pagination */}
                {hasMore && !isSearching && !isFiltering && isBrowseMode && (
                  <div className="flex justify-center mt-6 mb-8">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                    >
                      {loading ? (
                        <>
                          <Icon icon="fa-spinner" className="animate-spin" />
                          <span>กำลังโหลด...</span>
                        </>
                      ) : (
                        <>
                          <Icon icon="fa-arrow-down" />
                          <span>แสดงเพิ่มเติม (50 รายการ)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Client-side Pagination - Only show when not loading more from server */}
                {!hasMore && isBrowseMode && filteredProducts.length > itemsPerPage && (
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 px-2 pb-8 border-t border-gray-200 pt-4 text-gray-500">
                    <div className="text-xs">
                      แสดง {Math.min((currentPage - 1) * itemsPerPage + 1, filteredProducts.length)} - {Math.min(currentPage * itemsPerPage, filteredProducts.length)} จาก {filteredProducts.length} รายการ
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                      >
                        <Icon icon="fa-chevron-left" />
                      </button>
                      <span className="px-3 py-1 text-sm bg-white border rounded flex items-center">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                      >
                        <Icon icon="fa-chevron-right" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {uiTexts.footer_text && (
          <footer className="mt-8 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
            {uiTexts.footer_text}
          </footer>
        )}
      </div>

      {/* Cart Modal */}
      {showCart && (
        <Cart
          cart={cart}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onClose={() => setShowCart(false)}
          onCheckout={handleCheckout}
          onReconfigureBundle={handleReconfigureBundleFromCart}
          user={user}
        />
      )}

      <BundleSelectionModal
        open={bundleModalOpen}
        product={bundleModalProduct}
        memberProducts={bundleModalMembers}
        user={user}
        onClose={() => {
          setBundleModalOpen(false)
          setBundleModalProduct(null)
          setBundleModalMembers([])
          setBundleModalInitialSelections(null)
          setBundleModalInitialOptions(null)
          setBundleEditLineId('')
        }}
        initialSelections={bundleModalInitialSelections}
        initialSelectedOptions={bundleModalInitialOptions}
        onConfirm={handleConfirmBundle}
      />

      {/* Bottom Navigation - Only for regular users */}
      {!isFranchise && <Sidebar user={user} />}
    </div>
  )
}
