import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { orderService } from '../services/orderService'
import { imageService } from '../services/imageService'
import { productService } from '../services/productService'
import { creditService } from '../services/creditService'
import { getFeaturesSettings } from '../services/shopSettingsService'
import { invalidateByPrefix } from '../utils/cache'
import { supabase } from '../utils/supabase'
import { useCart } from '../hooks/useCart'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import {
  groupCartItemsBySupplier,
  linePaidSubtotal,
  cartLineWeightGrams,
  getSelectedOptionsExtraPerUnit,
  getDistinctSupplierKeysInCart,
  getItemSupplierKey
} from '../utils/cartSupplierUtils'
import { shippingCostForWeightGrams } from '../utils/shippingRates'
import { CENTRAL_SUPPLIER_LABEL, normalizeSupplierName } from '../utils/orderSupplierUtils'
import {
  sortSupplierGroupsForCheckout,
  parseAllowedSupplierKeys,
  validateCouponSupplierScope,
  promotionAllowedForProductSupplier,
  discountSplitRatios,
  unionAllowedKeysFromPromotions,
  eligibleSubtotalForCoupon
} from '../utils/couponSupplierSplitUtils'
import { computeBundleStockMoves, getEffectiveStock } from '../utils/orderBundleLineUtils'
import {
  computePromotionMoneyDiscount,
  getPromotionPaidQty,
  isPromotionWithinUsageLimits,
  isPromotionWithinValidDates
} from '../utils/promotionUtils'

const PROMPTPAY_ID = '0105567121929'

function splitMoneyPool(pool, ratios) {
  const n = ratios.length
  if (n === 0) return []
  if (pool === 0) return ratios.map(() => 0)
  const rs = ratios.map((r) => Math.max(0, r))
  const s = rs.reduce((a, b) => a + b, 0)
  if (s <= 0) return Array(n).fill(Math.round((pool / n) * 100) / 100)
  const out = []
  let acc = 0
  for (let i = 0; i < n - 1; i++) {
    const v = Math.round(((pool * rs[i]) / s) * 100) / 100
    out.push(v)
    acc += v
  }
  out.push(Math.round((pool - acc) * 100) / 100)
  return out
}

function newOrderId() {
  return `ORD${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

function newCheckoutBatchId() {
  return `BATCH${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export default function Checkout({ user }) {
  const navigate = useNavigate()
  const { cart, clearCart, setCart } = useCart(user)
  const [features, setFeatures] = useState({ allowCoupon: true, allowPromotion: true, showCreditTopUp: true })
  const [formData, setFormData] = useState({
    address: user?.address || '',
    discountCode: '',
    shippingMethod: 'delivery', // 'delivery' or 'pickup'
    paymentMethod: 'transfer' // 'transfer' or 'credit'
  })
  const [discount, setDiscount] = useState(null)
  const [promotions, setPromotions] = useState([]) // โปรโมชั่นที่ใช้ได้
  const [promotionDiscount, setPromotionDiscount] = useState(0) // ส่วนลดจากโปรโมชั่น
  const [freeItems, setFreeItems] = useState([]) // สินค้าแถมจากโปรโมชั่น
  const [shippingCost, setShippingCost] = useState(0)
  const [shippingRatesRaw, setShippingRatesRaw] = useState(null)
  const [slipFile, setSlipFile] = useState(null)
  const [slipPreview, setSlipPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [creditBalance, setCreditBalance] = useState(0)
  const [shippingSettings, setShippingSettings] = useState({
    pickupEnabled: true,
    deliveryEnabled: true
  })
  const [isFromPO, setIsFromPO] = useState(false)
  const [poOrderData, setPoOrderData] = useState(null)
  const [promptPayQrUrl, setPromptPayQrUrl] = useState(null)
  const [promptPayQrError, setPromptPayQrError] = useState(null)
  const qrLoadTimeoutRef = useRef(null)
  const placeOrderLockRef = useRef(false)
  /** ชำระรวม = สลิปเดียว / หักเครดิตครั้งเดียว; แยก = สลิปหรือหักเครดิตต่อ Supplier */
  const [checkoutPayMode, setCheckoutPayMode] = useState('combined')
  /** key = supplierKey → { file, preview } */
  const [supplierSlips, setSupplierSlips] = useState({})

  const getSubtotal = () => cart.reduce((sum, item) => sum + linePaidSubtotal(item), 0)

  const getTotalWeight = () => {
    return cart.reduce((sum, item) => sum + cartLineWeightGrams(item), 0)
  }

  const calculateShipping = async () => {
    if (formData.shippingMethod === 'pickup') {
      setShippingCost(0)
      setShippingRatesRaw(null)
      return
    }

    const weightAll = getTotalWeight()
    if (weightAll <= 0) {
      setShippingCost(0)
      setShippingRatesRaw(null)
      return
    }

    const fallbackPerGram = (w) => Math.max(0, Math.ceil(Number(w) / 1000) * 50)

    try {
      const { data: rates, error } = await supabase
        .from('shipping_rates')
        .select('*')
        .order('MinWeight', { ascending: true })

      if (error) {
        console.error('Error fetching shipping rates:', error)
        setShippingRatesRaw([])
        const groupsErr = isFromPO
          ? [{ items: cart }]
          : sortSupplierGroupsForCheckout(groupCartItemsBySupplier(cart))
        if (!isFromPO && groupsErr.length > 1) {
          let sum = 0
          for (const g of groupsErr) {
            const w = g.items.reduce((s, i) => s + cartLineWeightGrams(i), 0)
            sum += fallbackPerGram(w)
          }
          setShippingCost(sum)
        } else {
          setShippingCost(fallbackPerGram(weightAll))
        }
        return
      }

      const raw = rates || []
      setShippingRatesRaw(raw)

      const groups = isFromPO
        ? [{ items: cart }]
        : sortSupplierGroupsForCheckout(groupCartItemsBySupplier(cart))

      if (!isFromPO && groups.length > 1) {
        let sum = 0
        for (const g of groups) {
          const w = g.items.reduce((s, i) => s + cartLineWeightGrams(i), 0)
          const { cost, usedTable } = shippingCostForWeightGrams(w, raw)
          sum += usedTable ? Math.max(0, cost) : fallbackPerGram(w)
        }
        setShippingCost(sum)
        return
      }

      const { cost, usedTable } = shippingCostForWeightGrams(weightAll, raw)
      if (!usedTable) {
        setShippingCost(fallbackPerGram(weightAll))
        return
      }
      setShippingCost(Math.max(0, cost))
    } catch (error) {
      console.error('Error calculating shipping:', error)
      setShippingRatesRaw([])
      setShippingCost(fallbackPerGram(weightAll))
    }
  }

  useEffect(() => {
    calculateShipping()
    checkPromotions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, formData.shippingMethod, features.allowPromotion, isFromPO])

  useEffect(() => {
    getFeaturesSettings().then(setFeatures)
  }, [])

  useEffect(() => {
    if (!features.showCreditTopUp && formData.paymentMethod === 'credit') {
      setFormData((f) => ({ ...f, paymentMethod: 'transfer' }))
    }
  }, [features.showCreditTopUp])

  const subtotal = getSubtotal()
  const discountAmount = discount?.amount || 0
  const total = subtotal - discountAmount - promotionDiscount + shippingCost

  const supplierGroups = useMemo(() => {
    if (!cart.length) return []
    if (isFromPO) return [{ supplierKey: '_po', supplierLabel: '', items: [...cart] }]
    return sortSupplierGroupsForCheckout(groupCartItemsBySupplier(cart))
  }, [cart, isFromPO])

  const multiSupplier = !isFromPO && supplierGroups.length > 1

  const splitAllocations = useMemo(() => {
    if (!supplierGroups.length) return []
    const stats = supplierGroups.map((g) => ({
      ...g,
      paidSubtotal: g.items.reduce((s, i) => s + linePaidSubtotal(i), 0),
      weight: g.items.reduce((s, i) => s + cartLineWeightGrams(i), 0)
    }))
    const supplierKeys = stats.map((g) => g.supplierKey)
    const paidList = stats.map((g) => g.paidSubtotal)
    const multi = supplierKeys.length > 1
    const hasCentral = supplierKeys.some((k) => normalizeSupplierName(k) === CENTRAL_SUPPLIER_LABEL)

    const discRatios = discountSplitRatios(supplierKeys, paidList, {
      multiSupplier: multi,
      hasCentralSupplier: hasCentral,
      allowedKeys: discount?.allowedSupplierKeys ?? null
    })
    const discShares = splitMoneyPool(discountAmount, discRatios)

    const promoAllowed =
      unionAllowedKeysFromPromotions(promotions) ?? discount?.allowedSupplierKeys ?? null
    const promoRatios = discountSplitRatios(supplierKeys, paidList, {
      multiSupplier: multi,
      hasCentralSupplier: hasCentral,
      allowedKeys: promoAllowed
    })
    const promoShares = splitMoneyPool(promotionDiscount, promoRatios)

    let shipShares
    if (formData.shippingMethod === 'pickup' || shippingCost === 0) {
      shipShares = stats.map(() => 0)
    } else if (!isFromPO && multi && Array.isArray(shippingRatesRaw) && shippingRatesRaw.length > 0) {
      shipShares = stats.map((g) => {
        const { cost, usedTable } = shippingCostForWeightGrams(g.weight, shippingRatesRaw)
        return usedTable ? Math.max(0, cost) : Math.max(0, Math.ceil(g.weight / 1000) * 50)
      })
    } else if (!isFromPO && multi) {
      const wSum = stats.reduce((a, g) => a + g.weight, 0)
      shipShares =
        wSum <= 0
          ? splitMoneyPool(shippingCost, stats.map(() => 1))
          : splitMoneyPool(shippingCost, stats.map((g) => g.weight))
    } else {
      shipShares =
        stats.length <= 1
          ? [shippingCost]
          : splitMoneyPool(
              shippingCost,
              stats.reduce((a, g) => a + g.weight, 0) <= 0
                ? stats.map(() => 1)
                : stats.map((g) => g.weight)
            )
    }
    return stats.map((g, i) => {
      const orderTotal = g.paidSubtotal - discShares[i] - promoShares[i] + shipShares[i]
      return {
        ...g,
        discountShare: discShares[i],
        promotionShare: promoShares[i],
        shippingShare: shipShares[i],
        orderTotal: Math.max(0, Math.round(orderTotal * 100) / 100)
      }
    })
  }, [
    supplierGroups,
    discountAmount,
    promotionDiscount,
    shippingCost,
    formData.shippingMethod,
    discount?.allowedSupplierKeys,
    promotions,
    shippingRatesRaw,
    isFromPO
  ])

  useEffect(() => {
    if (isFromPO || supplierGroups.length <= 1) {
      setCheckoutPayMode('combined')
    }
  }, [isFromPO, supplierGroups.length])

  const cartSupplierFingerprint = useMemo(() => {
    if (isFromPO || !cart.length) return '_po'
    return groupCartItemsBySupplier(cart)
      .map((g) => g.supplierKey)
      .sort()
      .join(',')
  }, [cart, isFromPO])

  useEffect(() => {
    setSupplierSlips({})
  }, [checkoutPayMode, cartSupplierFingerprint])

  useEffect(() => {
    const hidePromptPay =
      formData.paymentMethod !== 'transfer' ||
      total <= 0 ||
      (multiSupplier && checkoutPayMode === 'separate')
    if (hidePromptPay) {
      setPromptPayQrUrl(null)
      setPromptPayQrError(null)
      if (qrLoadTimeoutRef.current) clearTimeout(qrLoadTimeoutRef.current)
      return
    }
    setPromptPayQrError(null)
    let cancelled = false
    qrLoadTimeoutRef.current = setTimeout(() => {
      if (!cancelled) setPromptPayQrError('โหลดนานเกินไป')
    }, 5000)
    // ใช้ browser build ของ qrcode (lib หลักเป็นของ Node ใช้ pngjs ไม่รันในเบราว์เซอร์)
    Promise.all([
      import('promptpay-qr'),
      import('qrcode/lib/browser.js')
    ])
      .then(([ppModule, qrModule]) => {
        if (cancelled) return
        // promptpay-qr export เป็น module.exports = generatePayload → อยู่ที่ default
        const generatePayload = ppModule.default || ppModule.generatePayload
        const qr = qrModule.default || qrModule
        if (typeof generatePayload !== 'function') {
          setPromptPayQrError('ไม่พบฟังก์ชันสร้าง QR')
          return
        }
        if (typeof qr?.toDataURL !== 'function') {
          setPromptPayQrError('ไลบรารี QR ไม่พร้อม')
          return
        }
        const amount = Number(total.toFixed(2))
        const payload = generatePayload(PROMPTPAY_ID, { amount })
        return qr.toDataURL(payload, { width: 280, margin: 2 })
      })
      .then((dataUrl) => {
        if (cancelled) return
        if (dataUrl) {
          setPromptPayQrUrl(dataUrl)
          setPromptPayQrError(null)
        } else {
          setPromptPayQrError('สร้าง QR ไม่สำเร็จ')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[Checkout] PromptPay QR error:', err)
          setPromptPayQrError('ไม่สามารถสร้าง QR ได้ (โอนเข้าบัญชีด้านล่างแทน)')
        }
      })
      .finally(() => {
        if (qrLoadTimeoutRef.current) {
          clearTimeout(qrLoadTimeoutRef.current)
          qrLoadTimeoutRef.current = null
        }
      })
    return () => {
      cancelled = true
      if (qrLoadTimeoutRef.current) clearTimeout(qrLoadTimeoutRef.current)
    }
  }, [formData.paymentMethod, total, multiSupplier, checkoutPayMode])

  // ตรวจสอบโปรโมชั่นที่ใช้ได้
  const checkPromotions = async () => {
    if (!features.allowPromotion) {
      setPromotions([])
      setPromotionDiscount(0)
      setFreeItems([])
      return
    }
    console.log('[PROMO CHECK] ===== Starting promotion check =====')
    console.log('[PROMO CHECK] Cart items:', cart?.map(item => ({ id: item.id, name: item.name, qty: item.qty, isFree: item.isFree, freeQty: item.freeQty, promotionId: item.promotionId })))
    
    if (!cart || cart.length === 0) {
      console.log('[PROMO CHECK] Cart is empty, clearing promotions')
      setPromotions([])
      setPromotionDiscount(0)
      setFreeItems([])
      return
    }

    try {
      const now = new Date()
      console.log('[PROMO CHECK] Current time:', now.toISOString())
      
      // ดึงโปรโมชั่นที่ active เท่านั้น (ตรวจสอบวันที่ใน JavaScript)
      const { data: activePromotions, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('Status', 'active')
      
      console.log('[PROMO CHECK] Active promotions from DB:', activePromotions?.length || 0)

      if (error) {
        console.error('Error fetching promotions:', error)
        return
      }

      if (!activePromotions || activePromotions.length === 0) {
        setPromotions([])
        setPromotionDiscount(0)
        setFreeItems([])
        return
      }

      const subtotal = getSubtotal()
      console.log('[PROMO CHECK] Subtotal:', subtotal)

      const needsPerUserUsageCheck = activePromotions.some((p) => (p.UsageLimit || 0) > 0)
      let userPromoOrderRows = []
      if (needsPerUserUsageCheck && user?.email) {
        const { data: orderRows, error: usageError } = await supabase
          .from('order')
          .select('OrderID, DiscountInfo')
          .eq('UserEmail', user.email)
          .not('DiscountInfo', 'is', null)
        if (!usageError && orderRows) userPromoOrderRows = orderRows
      }

      const cartKeysPromo = getDistinctSupplierKeysInCart(cart)
      const multiSupPromo = cartKeysPromo.length > 1
      const hasCentralPromo = cartKeysPromo.some((k) => normalizeSupplierName(k) === CENTRAL_SUPPLIER_LABEL)
      
      const applicablePromotions = []
      let totalPromotionDiscount = 0
      const newFreeItems = []

      for (const promotion of activePromotions) {
        console.log(`[PROMO CHECK] ===== Checking promotion: ${promotion.Name} (ID: ${promotion.id}, Type: ${promotion.Type}) =====`)
        
        if (!isPromotionWithinValidDates(promotion, now)) {
          console.log(`[PROMO CHECK] ${promotion.Name} - Outside valid date range`)
          continue
        }

        if (!isPromotionWithinUsageLimits(promotion, { userOrderRows: userPromoOrderRows })) {
          console.log(`[PROMO CHECK] ${promotion.Name} - Usage limit reached (per user or total)`)
          continue
        }

        // ตรวจสอบยอดซื้อขั้นต่ำ
        const minPurchase = promotion.MinPurchase || 0
        if (minPurchase > 0 && subtotal < minPurchase) {
          console.log(`[PROMO CHECK] ${promotion.Name} - Min purchase not met (required: ${minPurchase}, current: ${subtotal})`)
          continue
        }

        // ตรวจสอบว่ามี ProductID หรือไม่
        if (!promotion.ProductID) {
          console.log(`[PROMO CHECK] ${promotion.Name} - No ProductID`)
          continue
        }

        // ตรวจสอบสินค้าในตะกร้า - ต้องตรงกับ ProductID
        const cartItem = cart.find(item => item.id === promotion.ProductID)
        if (!cartItem) {
          console.log(`[PROMO CHECK] ${promotion.Name} - Product ${promotion.ProductID} not in cart`)
          continue
        }
        
        // ตรวจสอบว่ามีจำนวนสินค้าในตะกร้ามากกว่า 0
        if (!cartItem.qty || cartItem.qty <= 0) {
          console.log(`[PROMO CHECK] ${promotion.Name} - Product ${promotion.ProductID} has invalid quantity: ${cartItem.qty}`)
          continue
        }

        const promoAllowedKeys = parseAllowedSupplierKeys(promotion.AllowedSupplierKeys)
        if (
          !promotionAllowedForProductSupplier({
            multiSupplier: multiSupPromo,
            hasCentralSupplier: hasCentralPromo,
            allowedKeys: promoAllowedKeys,
            productSupplierKey: getItemSupplierKey(cartItem)
          })
        ) {
          console.log(
            `[PROMO CHECK] ${promotion.Name} - Supplier scope: product supplier not allowed for multi-supplier cart`
          )
          continue
        }

        if (promotion.Type === 'buy_x_get_y') {
          // ตรวจสอบว่ามีสินค้า X ครบจำนวน BuyQuantity หรือไม่
          const buyQuantity = promotion.BuyQuantity || 0
          const getQuantity = promotion.GetQuantity || 0
          
          // ตรวจสอบว่ามี BuyQuantity และ GetQuantity ที่ถูกต้อง
          if (buyQuantity <= 0 || getQuantity <= 0) {
            console.log(`[PROMO CHECK] ${promotion.Name} - Invalid BuyQuantity (${buyQuantity}) or GetQuantity (${getQuantity})`)
            continue
          }
          
          // ตรวจสอบว่ามีสินค้าในตะกร้าครบจำนวนที่ต้องซื้อ
          // สำหรับสินค้าแถม ให้ใช้เฉพาะจำนวนที่ต้องจ่าย (ไม่รวมสินค้าแถม)
          // แต่ต้องตรวจสอบว่า freeQty มาจากโปรโมชั่นนี้หรือไม่
          const paidQty = getPromotionPaidQty(cartItem, promotion.id)

          console.log(`[PROMO CHECK] ${promotion.Name} - Product: ${promotion.ProductID}, BuyQuantity: ${buyQuantity}, Cart Qty: ${cartItem.qty}, Paid Qty: ${paidQty}, IsFree: ${cartItem.isFree}, FreeQty: ${cartItem.freeQty}, PromotionId: ${cartItem.promotionId}`)
          
          // ตรวจสอบว่าจำนวนที่ต้องจ่ายต้องมากกว่าหรือเท่ากับ BuyQuantity
          if (paidQty < buyQuantity) {
            console.log(`[PROMO CHECK] ${promotion.Name} - Not enough quantity. Required: ${buyQuantity}, Have: ${paidQty}`)
            continue
          }
          
          // คำนวณจำนวนครั้งที่ได้โปรโมชั่น (ถ้าซื้อ 10 แถม 1 และมี 25 ชิ้น = ได้ 2 ครั้ง)
          // ใช้เฉพาะจำนวนที่ต้องจ่าย (ไม่รวมสินค้าแถม)
          const times = Math.floor(paidQty / buyQuantity)
          
          if (times <= 0) {
            console.log(`[PROMO CHECK] ${promotion.Name} - Cannot calculate times. PaidQty: ${paidQty}, BuyQuantity: ${buyQuantity}`)
            continue
          }
          
          const totalFreeQty = times * getQuantity
          
          if (totalFreeQty <= 0) {
            console.log(`[PROMO CHECK] ${promotion.Name} - Invalid totalFreeQty: ${totalFreeQty}`)
            continue
          }
          
          // หาสินค้า Y (ถ้าไม่ระบุ = สินค้าเดียวกัน)
          const getProductID = promotion.GetProductID || promotion.ProductID
          
          // หาสินค้า Y จาก products
          try {
            const getProduct = await productService.getProduct(getProductID)
            if (!getProduct) {
              console.log(`[PROMO CHECK] ${promotion.Name} - Product ${getProductID} not found`)
              continue
            }
            
            // ตรวจสอบว่ามีสินค้า Y ในตะกร้าหรือไม่
            const existingFreeItem = newFreeItems.find(item => item.id === getProductID)
            
            if (existingFreeItem) {
              existingFreeItem.qty += totalFreeQty
            } else {
              newFreeItems.push({
                ...getProduct,
                qty: totalFreeQty,
                isFree: true, // ระบุว่าเป็นสินค้าแถม
                promotionId: promotion.id,
                promotionName: promotion.Name
              })
            }
            
            console.log(`[PROMO CHECK] ${promotion.Name} - APPLIED! Times: ${times}, FreeQty: ${totalFreeQty}`)
            applicablePromotions.push({
              ...promotion,
              appliedTimes: times,
              freeQuantity: totalFreeQty
            })
          } catch (error) {
            console.error(`[PROMO CHECK] Error fetching product ${getProductID} for promotion:`, error)
            continue
          }
        } else if (
          promotion.Type === 'discount_percentage' ||
          promotion.Type === 'discount_fixed' ||
          promotion.Type === 'target_unit_price' ||
          promotion.Type === 'second_item_discount'
        ) {
          const discountAmount = computePromotionMoneyDiscount(promotion, cartItem)
          if (discountAmount > 0) {
            console.log(`[PROMO CHECK] ${promotion.Name} - APPLIED! Discount: ${discountAmount.toFixed(2)}`)
            totalPromotionDiscount += discountAmount
            applicablePromotions.push({
              ...promotion,
              discountAmount
            })
          } else {
            console.log(`[PROMO CHECK] ${promotion.Name} - No discount calculated`)
          }
        } else {
          console.log(`[PROMO CHECK] ${promotion.Name} - Unknown type: ${promotion.Type}`)
        }
      }

      // ตรวจสอบและลบสินค้าแถมที่ไม่ได้มาจากโปรโมชั่นที่ใช้ได้
      setCart(prevCart => {
        const updatedCart = [...prevCart]
        let hasChanges = false
        
        // ลบสินค้าแถมที่ไม่ได้มาจากโปรโมชั่นที่ใช้ได้
        const validPromotionIds = applicablePromotions.map(p => p.id)
        console.log('[PROMO CHECK] Valid promotion IDs:', validPromotionIds)
        const itemsToRemove = []
        
        for (let i = updatedCart.length - 1; i >= 0; i--) {
          const item = updatedCart[i]
          // ตรวจสอบสินค้าแถมทั้งหมด (ไม่ว่าจะมี promotionId หรือไม่)
          if (item.isFree || item.freeQty > 0) {
            console.log(`[PROMO CHECK] Found free item: ${item.name}, isFree: ${item.isFree}, freeQty: ${item.freeQty}, promotionId: ${item.promotionId}`)
            
            // ถ้าไม่มี promotionId หรือ promotionId ไม่ได้อยู่ในรายการที่ใช้ได้ ให้ลบออก
            const hasValidPromotion = item.promotionId && validPromotionIds.includes(item.promotionId)
            
            if (!hasValidPromotion) {
              console.log(`[PROMO CHECK] Removing free item - promotion ${item.promotionId || 'undefined'} not in valid list`)
              // ลบสินค้าแถมออก หรือถ้าเป็นสินค้าเดียวกัน ให้ลบเฉพาะส่วนแถม
              if (item.freeQty && item.freeQty > 0) {
                const paidQty = item.qty - item.freeQty
                if (paidQty > 0) {
                  // ถ้ายังมีสินค้าที่ต้องจ่าย ให้เก็บไว้แต่ลบส่วนแถม
                  console.log(`[PROMO CHECK] Removing free portion, keeping paid qty: ${paidQty}`)
                  updatedCart[i] = {
                    ...item,
                    qty: paidQty,
                    isFree: false,
                    freeQty: 0,
                    promotionId: null,
                    promotionName: null
                  }
                } else {
                  // ถ้าไม่มีสินค้าที่ต้องจ่ายแล้ว ให้ลบออก
                  console.log(`[PROMO CHECK] Removing entire item (no paid qty)`)
                  itemsToRemove.push(i)
                }
                hasChanges = true
              } else if (item.isFree) {
                // ถ้าเป็นสินค้าแถมทั้งหมด (ไม่มี freeQty แต่ isFree = true) ให้ลบออก
                console.log(`[PROMO CHECK] Removing entire free item (isFree=true but no freeQty)`)
                itemsToRemove.push(i)
                hasChanges = true
              }
            } else {
              console.log(`[PROMO CHECK] Keeping free item - promotion ${item.promotionId} is valid`)
            }
          }
        }
        
        // ลบสินค้าที่ต้องลบ
        itemsToRemove.forEach(index => {
          updatedCart.splice(index, 1)
        })
        
        // เพิ่มสินค้าแถมใหม่จากโปรโมชั่นที่ใช้ได้
        if (newFreeItems.length > 0) {
          for (const freeItem of newFreeItems) {
            const existingIndex = updatedCart.findIndex(item => item.id === freeItem.id)
            
            if (existingIndex >= 0) {
              // ถ้ามีสินค้านี้ในตะกร้าแล้ว
              const existingItem = updatedCart[existingIndex]
              
              // ตรวจสอบว่าจำนวนแถมที่ควรได้ตรงกับที่มีอยู่หรือไม่
              const currentFreeQty = existingItem.freeQty || 0
              const expectedFreeQty = freeItem.qty
              
              if (currentFreeQty !== expectedFreeQty) {
                // อัปเดตจำนวนแถม
                const paidQty = existingItem.isFree ? (existingItem.qty - currentFreeQty) : existingItem.qty
                updatedCart[existingIndex] = {
                  ...existingItem,
                  qty: paidQty + expectedFreeQty,
                  isFree: true,
                  freeQty: expectedFreeQty,
                  promotionId: freeItem.promotionId,
                  promotionName: freeItem.promotionName
                }
                hasChanges = true
              }
            } else {
              // ถ้ายังไม่มีในตะกร้า ให้เพิ่มใหม่
              updatedCart.push(freeItem)
              hasChanges = true
            }
          }
        }
        
        if (hasChanges) {
          console.log('[PROMO CHECK] Cart updated:', updatedCart.map(item => ({ id: item.id, name: item.name, qty: item.qty, isFree: item.isFree, freeQty: item.freeQty })))
        }
        return hasChanges ? updatedCart : prevCart
      })
      
      console.log('[PROMO CHECK] ===== Final Results =====')
      console.log('[PROMO CHECK] Applicable promotions:', applicablePromotions.length, applicablePromotions.map(p => p.Name))
      console.log('[PROMO CHECK] Total promotion discount:', totalPromotionDiscount)
      console.log('[PROMO CHECK] New free items:', newFreeItems.length)
      setPromotions(applicablePromotions)
      setPromotionDiscount(totalPromotionDiscount)
      console.log('[PROMO CHECK] ===== Promotion check completed =====')
    } catch (error) {
      console.error('Error checking promotions:', error)
    }
  }

  // Load PO order data from sessionStorage if exists
  useEffect(() => {
    const poData = sessionStorage.getItem('poOrderData')
    if (poData) {
      try {
        const parsed = JSON.parse(poData)
        if (parsed.fromPO && parsed.items) {
          setPoOrderData(parsed)
          setIsFromPO(true)
          
          // Load products to get full product info
          const loadProductsForPO = async () => {
            try {
              const products = await productService.getAllProducts(user, '')
              const poCartItems = parsed.items.map(item => {
                const product = products.find(p => p.id === item.productId)
                if (product) {
                  return {
                    ...product,
                    qty: item.qty,
                    stock: product.stock || 0 // Use current stock from main products
                  }
                }
                // Fallback if product not found
                return {
                  id: item.productId,
                  name: item.productName,
                  price: item.price,
                  qty: item.qty,
                  stock: 0,
                  unit: item.unit || 'ชิ้น'
                }
              })
              
              // Set cart with PO items
              setCart(poCartItems)
              
              // Clear sessionStorage after loading
              sessionStorage.removeItem('poOrderData')
            } catch (error) {
              console.error('Error loading products for PO:', error)
              Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถโหลดข้อมูลสินค้าจาก PO ได้'
              })
            }
          }
          
          loadProductsForPO()
        }
      } catch (error) {
        console.error('Error parsing PO order data:', error)
        sessionStorage.removeItem('poOrderData')
      }
    }
  }, [user, setCart])

  // Fetch shipping settings
  useEffect(() => {
    const fetchShippingSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('key', 'shipping')
          .maybeSingle()

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          console.error('Error fetching shipping settings:', error)
        }

        if (data && data.value) {
          const settings = {
            pickupEnabled: data.value.pickupEnabled !== false,
            deliveryEnabled: data.value.deliveryEnabled !== false
          }
          setShippingSettings(settings)
          
          // Set default shipping method based on available options
          if (!settings.pickupEnabled && settings.deliveryEnabled) {
            setFormData(prev => ({ ...prev, shippingMethod: 'delivery' }))
          } else if (settings.pickupEnabled && !settings.deliveryEnabled) {
            setFormData(prev => ({ ...prev, shippingMethod: 'pickup' }))
          } else if (!settings.pickupEnabled && !settings.deliveryEnabled) {
            // Both disabled - default to delivery
            setFormData(prev => ({ ...prev, shippingMethod: 'delivery' }))
          }
        }
      } catch (error) {
        console.error('Error fetching shipping settings:', error)
      }
    }
    
    fetchShippingSettings()
  }, [])

  // Fetch credit balance and listen for updates
  useEffect(() => {
    if (user && user.role !== 'admin') {
      const fetchCredit = () => {
        creditService.getUserCredit(user.email).then(credit => {
          setCreditBalance(credit.balance || 0)
        }).catch(err => {
          console.error('Error fetching credit:', err)
        })
      }
      
      fetchCredit()
      
      // Refresh credit balance when tab becomes active
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchCredit()
        }
      }
      
      // Listen for custom event when credit is updated
      const handleCreditUpdated = (event) => {
        // Refresh if event is for current user or no specific user
        if (!event.detail?.userEmail || event.detail.userEmail === user.email) {
          fetchCredit()
        }
      }
      
      // Polling: Refresh credit balance every 10 seconds
      const intervalId = setInterval(() => {
        fetchCredit()
      }, 10000)
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('creditUpdated', handleCreditUpdated)
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('creditUpdated', handleCreditUpdated)
        clearInterval(intervalId)
      }
    }
  }, [user])

  const handleCheckCoupon = async () => {
    if (!formData.discountCode) return

    try {
      // Use ilike for case-insensitive comparison (Status can be 'Active', 'active', etc.)
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('Code', formData.discountCode.toUpperCase())
        .ilike('Status', 'active')
        .maybeSingle()

      if (error) throw error

      if (data) {
        // ตรวจสอบวันที่เริ่มต้นและสิ้นสุด
        const now = new Date()
        const validFrom = data.ValidFrom ? new Date(data.ValidFrom) : null
        const validUntil = data.ValidUntil ? new Date(data.ValidUntil) : null

        // ตรวจสอบวันที่เริ่มต้น
        if (validFrom && now < validFrom) {
          setDiscount(null)
          Swal.fire({
            icon: 'error',
            title: 'โค้ดส่วนลดยังไม่สามารถใช้งานได้',
            text: `โค้ดนี้จะเริ่มใช้งานได้ตั้งแต่วันที่ ${validFrom.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
          })
          return
        }

        // ตรวจสอบวันที่สิ้นสุด
        if (validUntil && now > validUntil) {
          setDiscount(null)
          Swal.fire({
            icon: 'error',
            title: 'โค้ดส่วนลดหมดอายุแล้ว',
            text: `โค้ดนี้หมดอายุเมื่อวันที่ ${validUntil.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
          })
          return
        }

        // ตรวจสอบยอดซื้อขั้นต่ำ
        const subtotal = getSubtotal()
        const minPurchase = data.MinPurchase || 0
        if (minPurchase > 0 && subtotal < minPurchase) {
          setDiscount(null)
          Swal.fire({
            icon: 'error',
            title: 'ยอดซื้อไม่ถึงเกณฑ์',
            text: `ต้องซื้อขั้นต่ำ ${minPurchase.toLocaleString()} บาท (ยอดปัจจุบัน: ${subtotal.toLocaleString()} บาท)`
          })
          return
        }

        const cartKeys = getDistinctSupplierKeysInCart(cart)
        const multiSup = cartKeys.length > 1
        const hasCentral = cartKeys.some((k) => normalizeSupplierName(k) === CENTRAL_SUPPLIER_LABEL)
        const allowedParsed = parseAllowedSupplierKeys(data.AllowedSupplierKeys)
        const scope = validateCouponSupplierScope({
          multiSupplier: multiSup,
          hasCentralSupplier: hasCentral,
          allowedKeys: allowedParsed,
          cartSupplierKeys: cartKeys
        })
        if (!scope.ok) {
          setDiscount(null)
          Swal.fire({
            icon: 'error',
            title: 'ใช้โค้ดนี้ไม่ได้',
            text: scope.message
          })
          return
        }

        const baseForCoupon = eligibleSubtotalForCoupon(cart, {
          multiSupplier: multiSup,
          hasCentralSupplier: hasCentral,
          allowedKeys: allowedParsed
        })
        if (multiSup && baseForCoupon <= 0) {
          setDiscount(null)
          Swal.fire({
            icon: 'error',
            title: 'ใช้โค้ดนี้ไม่ได้',
            text: 'ไม่มีมูลค่าสินค้าในตะกร้าที่เข้าข่ายตาม Supplier ของโค้ดนี้'
          })
          return
        }

        // ตรวจสอบจำกัดครั้งการใช้ต่อคน (UsageLimit)
        const usageLimit = data.UsageLimit || 0
        if (usageLimit > 0 && user?.email) {
          const codePrefix = `Code: ${data.Code} `
          const { data: orderRows, error: usageError } = await supabase
            .from('order')
            .select('OrderID, DiscountInfo')
            .eq('UserEmail', user.email)
            .not('DiscountInfo', 'is', null)

          if (!usageError && orderRows && orderRows.length > 0) {
            const ordersUsedThisCoupon = new Set(
              orderRows
                .filter(row => row.DiscountInfo && row.DiscountInfo.startsWith(codePrefix))
                .map(row => row.OrderID)
            )
            const usedCount = ordersUsedThisCoupon.size
            if (usedCount >= usageLimit) {
              setDiscount(null)
              Swal.fire({
                icon: 'warning',
                title: 'ใช้คูปองครบจำนวนแล้ว',
                text: `คุณใช้โค้ดนี้ครบ ${usageLimit} ครั้ง/คนแล้ว ไม่สามารถใช้ซ้ำได้`
              })
              return
            }
          }
        }

        // คำนวณส่วนลด (หลายซัพ: คิดจากยอดที่เข้าข่าย supplier ของโค้ด)
        const calcBase = multiSup ? baseForCoupon : subtotal
        let discountAmount = 0
        if (data.Type === 'percentage') {
          discountAmount = (calcBase * data.Value) / 100
          // ตรวจสอบส่วนลดสูงสุด (MaxDiscount) สำหรับประเภทเปอร์เซ็นต์
          const maxDiscount = data.MaxDiscount || 0
          if (maxDiscount > 0 && discountAmount > maxDiscount) {
            discountAmount = maxDiscount
          }
        } else if (data.Type === 'fixed') {
          discountAmount = data.Value
        }

        if (discountAmount > calcBase) discountAmount = calcBase
        if (discountAmount > subtotal) discountAmount = subtotal

        setDiscount({
          code: data.Code,
          amount: discountAmount,
          type: data.Type,
          allowedSupplierKeys: allowedParsed
        })

        Swal.fire({
          icon: 'success',
          title: 'ใช้โค้ดส่วนลดสำเร็จ',
          text: `ส่วนลด ${discountAmount.toLocaleString()} บาท`,
          timer: 2000,
          showConfirmButton: false
        })
      } else {
        setDiscount(null)
        Swal.fire({
          icon: 'error',
          title: 'โค้ดส่วนลดไม่ถูกต้อง',
          text: 'กรุณาตรวจสอบโค้ดอีกครั้ง'
        })
      }
    } catch (error) {
      console.error('Error checking coupon:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถตรวจสอบโค้ดส่วนลดได้'
      })
    }
  }

  const handlePlaceOrder = async () => {
    if (placeOrderLockRef.current) return

    // ตรวจสอบที่อยู่ (เฉพาะเมื่อเลือก delivery)
    if (formData.shippingMethod === 'delivery' && !formData.address.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกที่อยู่',
        text: 'ที่อยู่จำเป็นสำหรับการจัดส่ง'
      })
      return
    }

    if (formData.paymentMethod === 'transfer') {
      if (multiSupplier && checkoutPayMode === 'separate') {
        for (const g of splitAllocations) {
          if (!supplierSlips[g.supplierKey]?.file) {
            Swal.fire({
              icon: 'warning',
              title: 'กรุณาแนบสลิปโอนเงิน',
              text: `แนบสลิปสำหรับ Supplier: ${g.supplierLabel}`
            })
            return
          }
        }
      } else if (!slipFile) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณาแนบสลิปโอนเงิน',
          text: 'กรุณาแนบหลักฐานการโอนเงินก่อนสั่งซื้อ'
        })
        return
      }
    }

    placeOrderLockRef.current = true
    setLoading(true)
    Swal.fire({
      title: 'กำลังสั่งซื้อ...',
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false
    })

    try {
      // Check stock before placing order
      Swal.fire({
        title: 'กำลังตรวจสอบสต็อก...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      const stockErrors = []
      const updatedCart = []
      let hasStockLimits = false
      
      for (const item of cart) {
        try {
          if (
            item.bundleFlexible === true &&
            item.bundleSelections &&
            typeof item.bundleSelections === 'object' &&
            !Array.isArray(item.bundleSelections)
          ) {
            for (const [pid, raw] of Object.entries(item.bundleSelections)) {
              const need = Math.round(Number(raw)) || 0
              if (need <= 0) continue
              const comp = await productService.getProduct(pid)
              if (!comp) {
                stockErrors.push(`${item.name}: ไม่พบส่วนประกอบ ${pid}`)
                continue
              }
              const st = comp.stock || 0
              if (need > st) {
                stockErrors.push(
                  `${item.name} — ${comp.name || pid}: ต้องการ ${need} มีสต็อก ${st}`
                )
              }
            }
            updatedCart.push({ ...item })
            continue
          }

          const product = await productService.getProduct(item.id)
          if (!product) {
            stockErrors.push(`${item.name}: ไม่พบสินค้า`)
            continue
          }

          const moves = computeBundleStockMoves(item, product)
          if (Object.keys(moves).length > 0) {
            const lookup = new Map()
            let moveOk = true
            for (const [pid, rawNeed] of Object.entries(moves)) {
              const need = Math.round(Number(rawNeed)) || 0
              if (need <= 0) continue
              const comp = await productService.getProduct(pid)
              if (!comp) {
                stockErrors.push(`${item.name}: ไม่พบส่วนประกอบ ${pid}`)
                moveOk = false
                continue
              }
              lookup.set(pid, comp.stock || 0)
              const st = comp.stock || 0
              if (need > st) {
                stockErrors.push(
                  `${item.name} — ${comp.name || pid}: ต้องการ ${need} มีสต็อก ${st}`
                )
                moveOk = false
              }
            }
            if (!moveOk) continue

            const effective = getEffectiveStock(product, lookup)
            if (!product.isBundle) {
              const currentStock = product.stock || 0
              if (item.qty > currentStock) {
                if (isFromPO) {
                  updatedCart.push({ ...item, qty: currentStock, stock: currentStock })
                  hasStockLimits = true
                } else {
                  stockErrors.push(
                    `${item.name}: มีสต็อกเพียง ${currentStock} ${item.unit || 'ชิ้น'} แต่ต้องการ ${item.qty} ${item.unit || 'ชิ้น'}`
                  )
                }
              } else {
                updatedCart.push({ ...item, stock: currentStock })
              }
            } else {
              updatedCart.push({ ...item, stock: effective })
            }
            continue
          }

          const currentStock = product.stock || 0
          if (item.qty > currentStock) {
            if (isFromPO) {
              // If from PO, limit to available stock instead of showing error
              updatedCart.push({ ...item, qty: currentStock, stock: currentStock })
              hasStockLimits = true
            } else {
              stockErrors.push(`${item.name}: มีสต็อกเพียง ${currentStock} ${item.unit || 'ชิ้น'} แต่ต้องการ ${item.qty} ${item.unit || 'ชิ้น'}`)
            }
          } else {
            updatedCart.push({ ...item, stock: currentStock })
          }
        } catch (error) {
          console.error(`Error checking stock for ${item.name}:`, error)
          stockErrors.push(`${item.name}: ไม่สามารถตรวจสอบสต็อกได้`)
        }
      }
      
      // Update cart if from PO and stock was limited
      if (isFromPO && hasStockLimits) {
        setCart(updatedCart)
        Swal.close()
        Swal.fire({
          icon: 'info',
          title: 'ปรับจำนวนสินค้า',
          html: 'จำนวนสินค้าบางรายการถูกปรับให้ไม่เกินสต็อกที่มี',
          confirmButtonText: 'ตกลง'
        })
        setLoading(false)
        return
      }

      if (stockErrors.length > 0) {
        Swal.close()
        Swal.fire({
          icon: 'error',
          title: 'สต็อกสินค้าไม่เพียงพอ',
          html: stockErrors.map(err => `<div class="text-left mb-2">• ${err}</div>`).join(''),
          confirmButtonText: 'ตกลง'
        })
        setLoading(false)
        return
      }

      // Check credit balance if paying with credit
      if (formData.paymentMethod === 'credit') {
        const credit = await creditService.getUserCredit(user.email)
        if (credit.balance < total) {
          Swal.close()
          Swal.fire({
            icon: 'error',
            title: 'ยอดเครดิตไม่เพียงพอ',
            html: `
              <div class="text-left">
                <p class="mb-2">ยอดเครดิตปัจจุบัน: ฿${credit.balance.toLocaleString()}</p>
                <p class="mb-2">ยอดที่ต้องชำระ: ฿${total.toLocaleString()}</p>
                <p class="text-sm">กรุณาเติมเงินก่อน</p>
              </div>
            `,
            confirmButtonText: 'ไปหน้าเติมเงิน',
            showCancelButton: true,
            cancelButtonText: 'ยกเลิก'
          }).then((result) => {
            if (result.isConfirmed) {
              navigate('/topup')
            }
          })
          return
        }
      }

      const groups = splitAllocations
      const batchId = multiSupplier ? newCheckoutBatchId() : null

      const orderLineUnitPrice = (item) => {
        const opt = getSelectedOptionsExtraPerUnit(item)
        const base = Number(item.price || 0)
        // Align with SAO pricing model: item.price is unit price after tier resolution.
        return base + opt
      }

      const mapOrderItems = (items) =>
        items.map((item) => ({
          id: item.id,
          name: item.name,
          price: orderLineUnitPrice(item),
          qty: item.qty,
          freeQty: item.freeQty || 0,
          isFree: item.isFree || false,
          promotionId: item.promotionId || null,
          image: item.image,
          selectedOptions:
            item.selectedOptions && typeof item.selectedOptions === 'object' && !Array.isArray(item.selectedOptions)
              ? item.selectedOptions
              : null,
          bundleFlexible: item.bundleFlexible === true,
          bundlePrimaryProductId: item.bundlePrimaryProductId || null,
          bundleSelections:
            item.bundleSelections && typeof item.bundleSelections === 'object' && !Array.isArray(item.bundleSelections)
              ? item.bundleSelections
              : null,
          bundleSelectionSummary: item.bundleSelectionSummary || null
        }))

      let sharedSlipURL = null
      const slipURLByKey = {}
      if (formData.paymentMethod === 'transfer') {
        if (multiSupplier && checkoutPayMode === 'separate') {
          for (const g of groups) {
            const f = supplierSlips[g.supplierKey]?.file
            if (!f) {
              Swal.close()
              Swal.fire({
                icon: 'warning',
                title: 'กรุณาแนบสลิปโอนเงิน',
                text: `แนบสลิปสำหรับ Supplier: ${g.supplierLabel}`,
                confirmButtonText: 'ตกลง'
              })
              return
            }
            slipURLByKey[g.supplierKey] = await imageService.uploadOrderSlip(f, null, user?.email)
          }
        } else {
          sharedSlipURL = await imageService.uploadOrderSlip(slipFile, null, user?.email)
        }
      }

      const baseOrderFields = {
        user: user.email,
        status: 'รอตรวจสอบ',
        address: formData.address,
        shippingMethod: formData.shippingMethod || 'delivery',
        paymentMethod: formData.paymentMethod || 'transfer',
        tracking: null,
        subdistrict: user?.subdistrict || null,
        district: user?.district || null,
        province: user?.province || null,
        postalCode: user?.postalCode || null,
        recipientPhone: user?.phone || null
      }

      Swal.fire({
        title: 'กำลังสั่งซื้อ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      const orderIds = []
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]
        const orderId = newOrderId()
        orderIds.push(orderId)
        const isFirst = i === 0
        const isLast = i === groups.length - 1
        const slipForGroup =
          formData.paymentMethod === 'transfer'
            ? multiSupplier && checkoutPayMode === 'separate'
              ? slipURLByKey[g.supplierKey]
              : sharedSlipURL
            : null

        const orderData = {
          ...baseOrderFields,
          id: orderId,
          items: mapOrderItems(g.items),
          total: g.orderTotal,
          discountCode: isFirst ? discount?.code || null : null,
          discountAmount: g.discountShare,
          promotionDiscount: g.promotionShare,
          promotions:
            isLast && promotions.length > 0
              ? promotions.map((p) => ({
                  id: p.id,
                  name: p.Name,
                  type: p.Type,
                  discountAmount: p.discountAmount || 0
                }))
              : null,
          shippingCost: g.shippingShare,
          totalWeight: g.weight,
          slipURL: slipForGroup,
          supplierTag: multiSupplier ? g.supplierLabel || g.supplierKey : null,
          checkoutBatchId: batchId
        }

        await orderService.placeOrder(orderData, {
          skipCouponUsage: multiSupplier ? !isFirst : false,
          skipPromotionUsage: multiSupplier ? !isLast : false
        })
      }

      let creditDeducted = false
      if (formData.paymentMethod === 'credit') {
        try {
          if (multiSupplier && checkoutPayMode === 'separate') {
            for (let i = 0; i < groups.length; i++) {
              await creditService.deductCredit(
                user.email,
                groups[i].orderTotal,
                orderIds[i],
                `ชำระออเดอร์ ${orderIds[i]}`
              )
            }
            creditDeducted = true
          } else {
            await creditService.deductCredit(
              user.email,
              total,
              orderIds[0],
              `ชำระออเดอร์ ${orderIds[0]}`
            )
            creditDeducted = true
          }
        } catch (creditError) {
          console.error('Error processing credit payment:', creditError)
        }
      }

      invalidateByPrefix('products_')
      invalidateByPrefix('orders_')

      window.dispatchEvent(
        new CustomEvent('orderPlaced', { detail: { orderId: orderIds[0], orderIds } })
      )

      Swal.close()

      const orderIdsText =
        orderIds.length > 1 ? orderIds.join(', ') : orderIds[0]

      if (formData.paymentMethod === 'credit' && creditDeducted) {
        Swal.fire({
          icon: 'success',
          title: 'ชำระด้วยเครดิต',
          html: `
            <div class="text-center">
              <p class="text-lg mb-2">จำนวนเงินที่ชำระ:</p>
              <p class="text-3xl font-bold text-emerald-600">฿${total.toLocaleString()}</p>
              <p class="text-sm text-gray-500 mt-2">เครดิตถูกหักจากบัญชีแล้ว</p>
            </div>
          `,
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#16a34a'
        }).then(() => {
          Swal.fire({
            icon: 'success',
            title: 'สั่งซื้อสำเร็จ!',
            html:
              orderIds.length > 1
                ? `<p class="text-left text-sm">เลขออเดอร์ (${orderIds.length} รายการ):<br/><span class="font-mono font-bold">${orderIds.join('<br/>')}</span></p>`
                : `<p>หมายเลขออเดอร์: ${orderIds[0]}</p>`,
            confirmButtonText: 'ดูประวัติการสั่งซื้อ'
          }).then((result) => {
            clearCart()
            if (result.isConfirmed) {
              navigate('/history')
            } else {
              navigate('/home')
            }
          })
        })
      } else {
        Swal.fire({
          icon: 'success',
          title: 'สั่งซื้อสำเร็จ!',
          html:
            orderIds.length > 1
              ? `<p class="text-left text-sm">เลขออเดอร์ (${orderIds.length} รายการ แยกตาม Supplier):<br/><span class="font-mono font-bold">${orderIds.join('<br/>')}</span></p>`
              : `<p>หมายเลขออเดอร์: ${orderIdsText}</p>`,
          confirmButtonText: 'ดูประวัติการสั่งซื้อ'
        }).then((result) => {
          clearCart()
          if (result.isConfirmed) {
            navigate('/history')
          } else {
            navigate('/home')
          }
        })
      }
    } catch (error) {
      Swal.close()
      console.error('Error placing order:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสั่งซื้อได้'
      })
    } finally {
      placeOrderLockRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/home')}
            className="p-2 text-gray-600 hover:text-gray-900"
          >
            <Icon icon="fa-arrow-left" className="text-xl" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">ยืนยันการสั่งซื้อ</h1>
        </div>

        {cart.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-yellow-800 text-center">
              <Icon icon="fa-exclamation-triangle" className="mr-2" />
              ตะกร้าว่าง กรุณาเพิ่มสินค้าก่อน
            </p>
            <button
              onClick={() => navigate('/home')}
              className="w-full mt-4 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition"
            >
              กลับไปเลือกสินค้า
            </button>
          </div>
        )}

        {cart.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Order Summary */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">สรุปคำสั่งซื้อ</h2>
                <div className="space-y-3">
                  {isFromPO && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-800">
                        <Icon icon="fa-info-circle" className="mr-2" />
                        ออเดอร์นี้มาจาก PO - จำนวนสินค้าถูกจำกัดตามสต็อกที่มี
                      </p>
                    </div>
                  )}
                  {multiSupplier && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 mb-4">
                      <p className="text-sm font-bold text-amber-900">หลาย Supplier — เลือกวิธีชำระ</p>
                      <label className="flex items-start gap-2 cursor-pointer text-sm text-amber-950">
                        <input
                          type="radio"
                          name="checkoutPayMode"
                          className="mt-1"
                          checked={checkoutPayMode === 'combined'}
                          onChange={() => setCheckoutPayMode('combined')}
                        />
                        <span>
                          <strong>ชำระรวม</strong> — สลิปเดียวหรือหักเครดิตครั้งเดียว (ระบบสร้างหลายเลขออเดอร์แยก Supplier อัตโนมัติ)
                        </span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer text-sm text-amber-950">
                        <input
                          type="radio"
                          name="checkoutPayMode"
                          className="mt-1"
                          checked={checkoutPayMode === 'separate'}
                          onChange={() => setCheckoutPayMode('separate')}
                        />
                        <span>
                          <strong>แยกตาม Supplier</strong> — แนบสลิปหรือหักเครดิตแยกต่อ Supplier
                        </span>
                      </label>
                    </div>
                  )}
                  {(multiSupplier && !isFromPO
                    ? splitAllocations
                    : [{ supplierKey: 'all', supplierLabel: null, items: cart }]
                  ).map((group) => (
                    <div key={group.supplierKey} className="space-y-2 mb-4 last:mb-0">
                      {group.supplierLabel ? (
                        <div className="text-xs font-bold text-emerald-800 bg-emerald-50 rounded-lg px-2 py-1.5 border border-emerald-100">
                          Supplier: {group.supplierLabel}
                        </div>
                      ) : null}
                      {group.items.map((item) => {
                    const isFreeItem = item.isFree || false
                    const freeQty = item.freeQty || 0
                    const paidQty = isFreeItem ? (item.qty - freeQty) : item.qty
                    
                    return (
                      <div key={item.id} className="flex items-center gap-3 pb-3 border-b border-gray-100">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-gray-900">{item.name}</h3>
                            {isFreeItem && freeQty > 0 && (
                              <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded">
                                แถม {freeQty} {item.unit || 'ชิ้น'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mb-1">
                            {item.bundleFlexible
                              ? `฿${item.price.toLocaleString()} ต่อ 1 รอบ (ขั้นตอน ${Math.max(1, item.orderStep || 1)} หน่วยหลัก)`
                              : `฿${item.price.toLocaleString()} ต่อ ${item.unit || 'ชิ้น'}`}
                          </p>
                          {item.bundleSelectionSummary ? (
                            <p className="text-[11px] text-amber-900 font-semibold mb-1">{item.bundleSelectionSummary}</p>
                          ) : null}
                          <p className="text-xs text-gray-500">
                            {item.bundleFlexible
                              ? `หน่วยหลัก: ${item.qty} ${item.unit || 'ชิ้น'}`
                              : `จำนวน: ${item.qty} ${item.unit || 'ชิ้น'}`}
                            {isFreeItem && freeQty > 0 && !item.bundleFlexible && (
                              <span className="text-green-600 font-bold ml-2">
                                (ชำระ {paidQty} {item.unit || 'ชิ้น'}, แถม {freeQty} {item.unit || 'ชิ้น'})
                              </span>
                            )}
                            {isFromPO && item.stock !== undefined && (
                              <span className={`ml-2 ${item.qty > item.stock ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                (สต็อก: {item.stock} {item.unit || 'ชิ้น'})
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600 text-base">
                            ฿{linePaidSubtotal(item).toLocaleString()}
                          </p>
                          {isFreeItem && freeQty > 0 && (
                            <p className="text-xs text-green-600 font-bold">
                              แถม {freeQty} {item.unit || 'ชิ้น'}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Checkout Form */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">ข้อมูลการจัดส่ง</h2>
              
              <div className="space-y-4">
                {/* Shipping Method Selection */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    วิธีการรับสินค้า *
                  </label>
                  <div className={`grid gap-3 ${shippingSettings.pickupEnabled && shippingSettings.deliveryEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {shippingSettings.pickupEnabled && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, shippingMethod: 'pickup' })}
                        className={`p-4 border-2 rounded-lg text-left transition ${
                          formData.shippingMethod === 'pickup'
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon icon="fa-store" className={`text-lg ${formData.shippingMethod === 'pickup' ? 'text-emerald-600' : 'text-gray-400'}`} />
                          <span className="font-bold">รับเอง</span>
                        </div>
                        <p className="text-xs text-gray-600">
                          เข้ามารับได้ในช่วงเวลาทำการ<br />
                          10:00-17:30 น.
                        </p>
                        <p className="text-xs text-emerald-600 font-bold mt-1">
                          ไม่คิดค่าจัดส่ง (รอ 4 ชม. หลังอนุมัติ)
                        </p>
                      </button>
                    )}
                    {shippingSettings.deliveryEnabled && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, shippingMethod: 'delivery' })}
                        className={`p-4 border-2 rounded-lg text-left transition ${
                          formData.shippingMethod === 'delivery'
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon icon="fa-truck" className={`text-lg ${formData.shippingMethod === 'delivery' ? 'text-emerald-600' : 'text-gray-400'}`} />
                          <span className="font-bold">จัดส่ง</span>
                        </div>
                        <p className="text-xs text-gray-600">
                          จัดส่งตามที่อยู่ที่ระบุ
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          คิดค่าจัดส่งตามน้ำหนัก
                        </p>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    {formData.shippingMethod === 'pickup' ? 'ที่อยู่สำหรับติดต่อ (ถ้ามี)' : 'ที่อยู่จัดส่ง *'}
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={4}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder={formData.shippingMethod === 'pickup' ? 'กรอกที่อยู่สำหรับติดต่อ (ถ้ามี)' : 'กรอกที่อยู่จัดส่ง'}
                    required={formData.shippingMethod === 'delivery'}
                  />
                  {formData.shippingMethod === 'pickup' && (
                    <p className="text-xs text-gray-500 mt-1">
                      <Icon icon="fa-info-circle" className="mr-1" />
                      หากไม่กรอก ระบบจะใช้ที่อยู่จากโปรไฟล์
                    </p>
                  )}
                </div>

                <div>
                  {features.allowCoupon && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    โค้ดส่วนลด
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.discountCode}
                      onChange={(e) => setFormData({ ...formData, discountCode: e.target.value })}
                      className="flex-1 border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase"
                      placeholder="กรอกโค้ดส่วนลด"
                    />
                    <button
                      type="button"
                      onClick={handleCheckCoupon}
                      className="bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-bold hover:bg-gray-300 transition"
                    >
                      ใช้โค้ด
                    </button>
                  </div>
                  {discount && (
                    <p className="text-sm text-emerald-600 mt-2">
                      <Icon icon="fa-check-circle" className="mr-1" />
                      ใช้โค้ด {discount.code} ส่วนลด {discount.amount.toLocaleString()} บาท
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">วิธีการชำระเงิน</h2>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: 'transfer' })}
                  className={`p-4 border-2 rounded-lg text-left transition ${
                    formData.paymentMethod === 'transfer'
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="fa-university" className={`text-lg ${formData.paymentMethod === 'transfer' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span className="font-bold">โอนเงิน</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    โอนเงินผ่านธนาคาร
                  </p>
                </button>
                {features.showCreditTopUp && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'credit' })}
                    className={`p-4 border-2 rounded-lg text-left transition ${
                      formData.paymentMethod === 'credit'
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    disabled={creditBalance < total}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon icon="fa-wallet" className={`text-lg ${formData.paymentMethod === 'credit' ? 'text-emerald-600' : 'text-gray-400'}`} />
                      <span className="font-bold">เครดิต</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      ใช้เครดิตที่มี
                    </p>
                    <p className="text-xs text-emerald-600 font-bold mt-1">
                      ยอดเครดิต: ฿{creditBalance.toLocaleString()}
                    </p>
                    {creditBalance < total && (
                      <p className="text-xs text-red-600 font-bold mt-1">
                        ยอดเครดิตไม่เพียงพอ
                      </p>
                    )}
                  </button>
                )}
              </div>

              {formData.paymentMethod === 'credit' && creditBalance < total && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    <Icon icon="fa-exclamation-triangle" className="mr-2" />
                    ยอดเครดิตไม่เพียงพอ กรุณาเติมเงินก่อน
                  </p>
                  {features.showCreditTopUp && (
                    <button
                      type="button"
                      onClick={() => navigate('/topup')}
                      className="mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-bold underline"
                    >
                      ไปหน้าเติมเงิน →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Payment Information - Only show if payment method is transfer */}
            {formData.paymentMethod === 'transfer' && (
              <>
                {multiSupplier && checkoutPayMode === 'separate' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-950">
                    <Icon icon="fa-info-circle" className="mr-2" />
                    โหมดแยกชำระ: โอนตามยอดแต่ละ Supplier ด้านล่าง และแนบสลิปแยกต่อ Supplier (ไม่แสดง QR รวมยอดเดียว)
                  </div>
                )}
                {(!multiSupplier || checkoutPayMode === 'combined') && (
                <>
                {/* Thai QR style card: แถบสี + QR + ปุ่มบันทึก */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  {/* แถบสีแบบ Thai QR (สีน้ำเงินพร้อมเพย์) */}
                  <div className="bg-gradient-to-r from-[#1e3a8a] to-[#1d4ed8] px-5 py-3 flex justify-between items-center">
                    <span className="text-white font-bold text-sm tracking-wide">พร้อมเพย์</span>
                    <span className="text-white/90 text-xs">สแกนเพื่อชำระเงิน</span>
                  </div>
                  <div className="p-5">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-gray-800">ชำระผ่าน PromptPay</span>
                      <span className="text-lg font-bold text-emerald-600">฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {promptPayQrError ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                        <p className="text-sm text-amber-800 mb-3">{promptPayQrError}</p>
                        <p className="text-xs text-gray-600 mb-2">โอนเข้าบัญชีด้านล่างแทน:</p>
                        <div
                          className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200 cursor-pointer hover:bg-amber-50"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText('189-2-88192-4')
                              Swal.fire({ icon: 'success', title: 'คัดลอกเลขบัญชีแล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                            } catch {
                              Swal.fire({ icon: 'error', title: 'กรุณาคัดลอกด้วยตนเอง: 189-2-88192-4' })
                            }
                          }}
                        >
                          <span className="font-mono font-bold">189-2-88192-4</span>
                          <Icon icon="fa-copy" className="text-gray-500" />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">บจก. ไชยจันลา (KASIKORN BANK)</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500 mb-4">สแกน QR ด้วยแอปธนาคารหรือ e-Wallet เพื่อโอนเงินตามยอดที่แสดง</p>
                        <div className="flex justify-center bg-gray-50 rounded-lg p-4">
                          {promptPayQrUrl ? (
                            <img src={promptPayQrUrl} alt="PromptPay QR Code" className="w-64 h-64 object-contain" />
                          ) : (
                            <div className="w-64 h-64 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                              <span>กำลังสร้าง QR...</span>
                              <span className="text-xs">(ถ้านานเกิน 5 วินาที จะแสดงเลขบัญชีแทน)</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">PromptPay ID: {PROMPTPAY_ID}</p>
                        {promptPayQrUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              const link = document.createElement('a')
                              link.download = `promptpay-${total.toFixed(0)}-baht.png`
                              link.href = promptPayQrUrl
                              link.click()
                              Swal.fire({ icon: 'success', title: 'บันทึกรูปแล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                            }}
                            className="mt-4 w-full py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 font-medium hover:bg-gray-50 hover:border-emerald-500 hover:text-emerald-700 transition flex items-center justify-center gap-2"
                          >
                            <Icon icon="fa-save" />
                            บันทึกรูปภาพ
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Upload Slip Section - Only for transfer */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    อัปโหลดสลิปโอนเงิน *
                  </label>
                  <div
                    className="border-2 border-dashed border-gray-300 p-8 rounded-lg text-center bg-gray-50 cursor-pointer hover:border-emerald-500 transition-colors"
                    onClick={() => document.getElementById('slip-input').click()}
                  >
                    <input
                      id="slip-input"
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files[0]
                        setSlipFile(file)
                        if (file) {
                          const reader = new FileReader()
                          reader.onloadend = () => {
                            setSlipPreview(reader.result)
                          }
                          reader.readAsDataURL(file)
                        } else {
                          setSlipPreview(null)
                        }
                      }}
                    />
                    {slipPreview ? (
                      <div className="relative flex flex-col items-center gap-2">
                        <img 
                          src={slipPreview} 
                          alt="Slip Preview" 
                          className="max-h-64 max-w-full object-contain rounded-lg border border-emerald-200 shadow-md" 
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSlipFile(null)
                            setSlipPreview(null)
                            const fileInput = document.getElementById('slip-input')
                            if (fileInput) {
                              fileInput.value = ''
                            }
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition"
                        >
                          <Icon icon="fa-times" />
                        </button>
                        <span className="text-xs font-normal text-gray-400 truncate w-40 mt-2">
                          {slipFile?.name}
                        </span>
                      </div>
                    ) : (
                      <div className="text-gray-400 flex flex-col items-center gap-2">
                        <Icon icon="fa-cloud-upload-alt" className="text-4xl mb-1" />
                        <span>แตะที่นี่เพื่อแนบสลิปโอนเงิน</span>
                      </div>
                    )}
                  </div>
                </div>
                </>
                )}

                {multiSupplier && checkoutPayMode === 'separate' && (
                  <div className="space-y-4">
                    {splitAllocations.map((g, gi) => {
                      const slipDomId = `slip-supplier-${gi}`
                      return (
                      <div
                        key={g.supplierKey}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                      >
                        <p className="font-bold text-gray-900">{g.supplierLabel}</p>
                        <p className="text-emerald-700 font-bold mb-3">
                          ยอดชำระสำหรับ Supplier นี้: ฿{g.orderTotal.toLocaleString()}
                        </p>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          อัปโหลดสลิปโอนเงิน *
                        </label>
                        <div
                          className="border-2 border-dashed border-gray-300 p-6 rounded-lg text-center bg-gray-50 cursor-pointer hover:border-emerald-500 transition-colors"
                          onClick={() => document.getElementById(slipDomId)?.click()}
                        >
                          <input
                            id={slipDomId}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) {
                                setSupplierSlips((prev) => {
                                  const next = { ...prev }
                                  delete next[g.supplierKey]
                                  return next
                                })
                                return
                              }
                              const reader = new FileReader()
                              reader.onloadend = () => {
                                setSupplierSlips((prev) => ({
                                  ...prev,
                                  [g.supplierKey]: { file, preview: reader.result }
                                }))
                              }
                              reader.readAsDataURL(file)
                            }}
                          />
                          {supplierSlips[g.supplierKey]?.preview ? (
                            <div className="relative flex flex-col items-center gap-2">
                              <img
                                src={supplierSlips[g.supplierKey].preview}
                                alt="Slip"
                                className="max-h-48 max-w-full object-contain rounded-lg border border-emerald-200"
                              />
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setSupplierSlips((prev) => {
                                    const next = { ...prev }
                                    delete next[g.supplierKey]
                                    return next
                                  })
                                  const inp = document.getElementById(slipDomId)
                                  if (inp) inp.value = ''
                                }}
                                className="text-xs text-red-600 font-bold"
                              >
                                ลบรูป
                              </button>
                            </div>
                          ) : (
                            <div className="text-gray-400 flex flex-col items-center gap-2 text-sm">
                              <Icon icon="fa-cloud-upload-alt" className="text-3xl" />
                              <span>แนบสลิปสำหรับ Supplier นี้</span>
                            </div>
                          )}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">สรุปยอดชำระ</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>ยอดรวมสินค้า</span>
                  <span>฿{subtotal.toLocaleString()}</span>
                </div>
                {promotions.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon icon="fa-gift" className="text-green-600" />
                      <span className="text-sm font-bold text-green-800">โปรโมชั่นที่ใช้ได้</span>
                    </div>
                    {promotions.map((promo) => (
                      <div key={promo.id} className="text-xs text-green-700 mb-1">
                        • {promo.Name}
                        {promo.Type === 'buy_x_get_y' && promo.freeQuantity > 0 && (
                          <span className="ml-1">(แถม {promo.freeQuantity} ชิ้น)</span>
                        )}
                        {promo.discountAmount > 0 && (
                          <span className="ml-1">(ส่วนลด ฿{promo.discountAmount.toLocaleString()})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {promotionDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>ส่วนลดจากโปรโมชั่น</span>
                    <span>-฿{promotionDiscount.toLocaleString()}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>ส่วนลดจากโค้ด</span>
                    <span>-฿{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>ค่าจัดส่ง</span>
                  <span>฿{shippingCost.toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  น้ำหนักรวม: {getTotalWeight().toLocaleString()} กรัม
                </div>
                {multiSupplier && (
                  <div className="text-xs text-gray-600 space-y-1 py-2 border-t border-dashed border-gray-200 mt-2">
                    <p className="font-bold text-gray-800">ยอดต่อ Supplier (หลังหักส่วนลดและแบ่งค่าจัดส่ง)</p>
                    {splitAllocations.map((g) => (
                      <div key={g.supplierKey} className="flex justify-between gap-2">
                        <span className="truncate">{g.supplierLabel}</span>
                        <span className="font-mono shrink-0">฿{g.orderTotal.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between text-xl font-bold text-gray-900">
                    <span>ยอดรวมทั้งสิ้น</span>
                    <span className="text-emerald-600">฿{total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handlePlaceOrder}
                disabled={loading || !formData.address.trim()}
                className="w-full mt-6 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'กำลังสั่งซื้อ...' : 'ยืนยันการสั่งซื้อ'}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
