import { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import Icon from '../common/Icon'
import { imageService } from '../../services/imageService'
import { orderService } from '../../services/orderService'
import { productService } from '../../services/productService'
import { creditService } from '../../services/creditService'
import { fetchCustomersForVisibilityPicker } from '../../services/userDirectoryService'
import { supabase } from '../../utils/supabase'
import { invalidateByPrefix } from '../../utils/cache'

function newOrderId() {
  return `ORD${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

const emptyLine = () => ({ productId: '', qty: 1 })

/** คอลัมน์โปรไฟล์จัดส่ง — หลีกเลี่ยง select('*') กรณี policy/PostgREST จำกัด */
const USERS_SHIP_PROFILE_SELECT =
  'Email, Address, Phone, Subdistrict, District, Province, PostalCode, UserType'

export default function AdminCreateOrderModal({ open, onClose, adminUser, onCreated }) {
  const [submitting, setSubmitting] = useState(false)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [customerUserType, setCustomerUserType] = useState('regular')
  const [lines, setLines] = useState([emptyLine()])
  const [productFilter, setProductFilter] = useState('')
  const [address, setAddress] = useState('')
  const [subdistrict, setSubdistrict] = useState('')
  const [district, setDistrict] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [shippingMethod, setShippingMethod] = useState('delivery')
  const [shippingCost, setShippingCost] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [slipFile, setSlipFile] = useState(null)
  const slipFileInputRef = useRef(null)
  const [orderStatus, setOrderStatus] = useState('รอตรวจสอบ')
  const [deductStock, setDeductStock] = useState(true)
  const [adminNote, setAdminNote] = useState('')
  /** แถวที่จะรับสินค้าจากการคลิกในรายการค้นหา */
  const [activeLineForProduct, setActiveLineForProduct] = useState(0)

  const productsById = useMemo(() => {
    const m = new Map()
    products.forEach((p) => {
      const id = String(p.id ?? p.ProductID ?? '').trim()
      if (id) m.set(id, { ...p, id })
    })
    return m
  }, [products])

  const productSearchFields = (p) => {
    const name = String(p.name ?? p.ProductName ?? '').toLowerCase()
    const id = String(p.id ?? p.ProductID ?? '').toLowerCase()
    const cat = String(p.category ?? p.Category ?? '').toLowerCase()
    const sup = String(p.supplier ?? p.Supplier ?? '').toLowerCase()
    return { name, id, cat, sup }
  }

  const filteredProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase()
    const list = products.filter((p) => {
      const { name, id, cat, sup } = productSearchFields(p)
      if (!q) return true
      return name.includes(q) || id.includes(q) || cat.includes(q) || sup.includes(q)
    })
    if (!q) return list.slice(0, 300)
    return list.slice(0, 200)
  }, [products, productFilter])

  const filteredCustomers = useMemo(() => {
    const q = customerFilter.trim().toLowerCase()
    if (!q) return customers.slice(0, 80)
    return customers
      .filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          (c.username || '').toLowerCase().includes(q)
      )
      .slice(0, 80)
  }, [customers, customerFilter])

  const resolvedLines = useMemo(() => {
    const isFr = customerUserType === 'franchise'
    return lines.map((line) => {
      const key = line.productId ? String(line.productId).trim() : ''
      const p = key ? productsById.get(key) : null
      if (!p) return { ...line, product: null, unitPrice: 0, lineTotal: 0, weight: 0 }
      const unitPrice =
        isFr && (Number(p.franchisePrice) || 0) > 0
          ? Number(p.franchisePrice)
          : Number(p.price) || 0
      const qty = Math.max(1, Math.round(Number(line.qty) || 1))
      const w = (Number(p.weight) || 0) * qty
      return {
        ...line,
        qty,
        product: p,
        unitPrice,
        lineTotal: unitPrice * qty,
        weight: w
      }
    })
  }, [lines, productsById, customerUserType])

  const subtotal = useMemo(
    () => resolvedLines.reduce((s, r) => s + r.lineTotal, 0),
    [resolvedLines]
  )
  const discRaw = Math.max(0, Number(discountAmount) || 0)
  const disc = Math.min(discRaw, subtotal)
  const ship = shippingMethod === 'pickup' ? 0 : Math.max(0, Number(shippingCost) || 0)
  const total = Math.max(0, subtotal - disc + ship)
  const totalWeight = useMemo(
    () => resolvedLines.reduce((s, r) => s + r.weight, 0),
    [resolvedLines]
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadError(null)
    ;(async () => {
      try {
        const [custRows, plist] = await Promise.all([
          fetchCustomersForVisibilityPicker(),
          productService.getAllProducts(adminUser, '')
        ])
        if (cancelled) return
        setCustomers(custRows)
        setProducts(plist || [])
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'โหลดข้อมูลไม่สำเร็จ')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, adminUser])

  useEffect(() => {
    if (shippingMethod === 'pickup') setShippingCost(0)
  }, [shippingMethod])

  useEffect(() => {
    setActiveLineForProduct((i) => Math.min(Math.max(0, i), Math.max(0, lines.length - 1)))
  }, [lines.length])

  const slipPreviewUrl = useMemo(() => (slipFile ? URL.createObjectURL(slipFile) : null), [slipFile])
  useEffect(() => {
    return () => {
      if (slipPreviewUrl) URL.revokeObjectURL(slipPreviewUrl)
    }
  }, [slipPreviewUrl])

  useEffect(() => {
    if (paymentMethod !== 'transfer') {
      setSlipFile(null)
      if (slipFileInputRef.current) slipFileInputRef.current.value = ''
    }
  }, [paymentMethod])

  const fillShippingFromUserRow = (row) => {
    if (!row) return
    const addr =
      row.Address ?? row.address ?? row.AddressLine ?? row.address_line ?? ''
    setAddress(String(addr).trim())
    setRecipientPhone(String(row.Phone ?? row.phone ?? '').trim())
    setSubdistrict(String(row.Subdistrict ?? row.subdistrict ?? '').trim())
    setDistrict(String(row.District ?? row.district ?? '').trim())
    setProvince(String(row.Province ?? row.province ?? '').trim())
    setPostalCode(String(row.PostalCode ?? row.postalcode ?? row.postal_code ?? '').trim())
    const ut = String(row.UserType ?? row.usertype ?? 'regular').toLowerCase()
    setCustomerUserType(ut === 'franchise' ? 'franchise' : 'regular')
  }

  const applyCustomerProfile = async (email) => {
    const em = String(email || '').trim()
    if (!em || !em.includes('@')) return

    const run = async (builder) => {
      const { data, error } = await builder
      if (error) console.warn('[AdminCreateOrder] โหลด users:', error.message)
      return data || null
    }

    const q = () => supabase.from('users').select(USERS_SHIP_PROFILE_SELECT)

    try {
      const emLower = em.toLowerCase()
      let row =
        (await run(q().eq('Email', em).maybeSingle())) ||
        (await run(q().eq('Email', emLower).maybeSingle())) ||
        (await run(q().ilike('Email', em).maybeSingle())) ||
        (await run(q().eq('email', emLower).maybeSingle()))

      if (!row) return

      fillShippingFromUserRow(row)
    } catch (e) {
      console.warn('[AdminCreateOrder] applyCustomerProfile', e)
    }
  }

  const pickCustomer = async (c) => {
    setCustomerEmail(c.email)
    setCustomerUserType(c.userType === 'franchise' ? 'franchise' : 'regular')
    if (c.shippingSnapshot) {
      fillShippingFromUserRow({
        Address: c.shippingSnapshot.address,
        Phone: c.shippingSnapshot.phone,
        Subdistrict: c.shippingSnapshot.subdistrict,
        District: c.shippingSnapshot.district,
        Province: c.shippingSnapshot.province,
        PostalCode: c.shippingSnapshot.postalCode,
        UserType: c.userType
      })
    }
    await applyCustomerProfile(c.email)
  }

  const addLine = () => {
    setLines((prev) => {
      const next = [...prev, emptyLine()]
      setActiveLineForProduct(next.length - 1)
      return next
    })
  }
  const removeLine = (idx) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }
  const updateLine = (idx, patch) => {
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const resetForm = () => {
    setCustomerEmail('')
    setCustomerFilter('')
    setCustomerUserType('regular')
    setLines([emptyLine()])
    setProductFilter('')
    setAddress('')
    setSubdistrict('')
    setDistrict('')
    setProvince('')
    setPostalCode('')
    setRecipientPhone('')
    setShippingMethod('delivery')
    setShippingCost(0)
    setDiscountAmount(0)
    setPaymentMethod('transfer')
    setSlipFile(null)
    if (slipFileInputRef.current) slipFileInputRef.current.value = ''
    setOrderStatus('รอตรวจสอบ')
    setDeductStock(true)
    setAdminNote('')
    setActiveLineForProduct(0)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const email = customerEmail.trim()
    if (!email) {
      Swal.fire({ icon: 'warning', title: 'เลือกหรือกรอกอีเมลลูกค้า', text: 'จำเป็นต้องมีอีเมลผู้รับออเดอร์' })
      return
    }
    if (shippingMethod === 'delivery' && !address.trim()) {
      Swal.fire({ icon: 'warning', title: 'กรอกที่อยู่จัดส่ง', text: 'เมื่อเลือกจัดส่งต้องมีที่อยู่' })
      return
    }

    const items = resolvedLines
      .filter((r) => r.product && r.qty > 0)
      .map((r) => ({
        id: r.product.id,
        name: r.product.name,
        price: r.unitPrice,
        qty: r.qty,
        freeQty: 0,
        isFree: false,
        promotionId: null,
        image: r.product.image || ''
      }))

    if (items.length === 0) {
      Swal.fire({ icon: 'warning', title: 'เพิ่มสินค้า', text: 'เลือกสินค้าอย่างน้อย 1 รายการ' })
      return
    }

    for (const it of items) {
      const st = productsById.get(String(it.id).trim())?.stock ?? 0
      if (deductStock && it.qty > st) {
        Swal.fire({
          icon: 'error',
          title: 'สต็อกไม่พอ',
          text: `${it.name}: ต้องการ ${it.qty} มี ${st} (ปิดการหักสต็อกถ้าต้องการบันทึกแม้สต็อกไม่พอ)`
        })
        return
      }
    }

    if (total <= 0 && items.length > 0) {
      const ok = await Swal.fire({
        icon: 'question',
        title: 'ยอดรวมเป็น 0',
        text: 'ต้องการสร้างออเดอร์นี้ต่อหรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'สร้าง',
        cancelButtonText: 'ยกเลิก'
      })
      if (!ok.isConfirmed) return
    }

    if (paymentMethod === 'credit') {
      try {
        const credit = await creditService.getUserCredit(email)
        if ((credit.balance || 0) < total) {
          Swal.fire({
            icon: 'error',
            title: 'เครดิตไม่พอ',
            html: `มี ฿${(credit.balance || 0).toLocaleString()} ต้องการ ฿${total.toLocaleString()}`
          })
          return
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'ตรวจสอบเครดิตไม่ได้', text: err.message })
        return
      }
    }

    const orderId = newOrderId()
    setSubmitting(true)
    try {
      let slipURL = null
      if (paymentMethod === 'transfer' && slipFile) {
        slipURL = await imageService.uploadOrderSlip(slipFile, orderId, email)
      }

      await orderService.placeOrder(
        {
          id: orderId,
          user: email,
          items,
          total,
          status: orderStatus,
          address: address.trim(),
          discountCode: null,
          discountAmount: disc,
          promotionDiscount: 0,
          promotions: null,
          shippingCost: ship,
          totalWeight,
          tracking: null,
          slipURL,
          shippingMethod,
          paymentMethod,
          subdistrict: subdistrict.trim() || null,
          district: district.trim() || null,
          province: province.trim() || null,
          postalCode: postalCode.trim() || null,
          recipientPhone: recipientPhone.trim() || null,
          createdByAdmin: true,
          adminDiscountNote: adminNote.trim() || undefined
        },
        { skipStockUpdate: !deductStock, skipCouponUsage: true, skipPromotionUsage: true }
      )

      if (paymentMethod === 'credit' && total > 0) {
        try {
          await creditService.deductCredit(
            email,
            total,
            orderId,
            `แอดมินสร้างออเดอร์ ${orderId}`
          )
        } catch (ce) {
          console.error('Credit deduct after admin order:', ce)
          await Swal.fire({
            icon: 'warning',
            title: 'ออเดอร์ถูกสร้างแล้ว แต่หักเครดิตไม่สำเร็จ',
            text: ce.message || 'กรุณาตรวจสอบเครดิตลูกค้าด้วยตนเอง'
          })
        }
      }

      invalidateByPrefix('products_')
      invalidateByPrefix('orders_')
      window.dispatchEvent(new CustomEvent('orderPlaced', { detail: { orderId } }))

      await Swal.fire({
        icon: 'success',
        title: 'สร้างออเดอร์แล้ว',
        text: `เลขที่ ${orderId}`
      })
      onCreated?.()
      handleClose()
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'สร้างออเดอร์ไม่สำเร็จ', text: err.message || String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-create-order-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-emerald-50">
          <h2 id="admin-create-order-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Icon icon="fa-plus-circle" className="text-emerald-600" />
            สร้างออเดอร์ (แอดมิน)
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="ปิด"
          >
            <Icon icon="fa-times" className="text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {loadError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">ลูกค้า *</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value.trim())}
              onBlur={(e) => {
                const em = e.target.value.trim()
                if (em.includes('@')) void applyCustomerProfile(em)
              }}
              placeholder="อีเมลลูกค้า"
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
              required
            />
            <input
              type="text"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              placeholder="ค้นหาชื่อหรืออีเมล..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {filteredCustomers.length === 0 ? (
                <p className="text-xs text-gray-400 p-2">ไม่พบรายชื่อ — พิมพ์อีเมลด้านบนได้โดยตรง</p>
              ) : (
                filteredCustomers.map((c) => (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => {
                      void pickCustomer(c)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 ${
                      customerEmail === c.email ? 'bg-emerald-100 font-bold' : ''
                    }`}
                  >
                    {c.optionLabel}
                  </button>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ราคาใช้แบบ {customerUserType === 'franchise' ? 'แฟรนไชส์ (FranchisePrice)' : 'ทั่วไป (Price)'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <label className="text-sm font-bold text-gray-700">รายการสินค้า *</label>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-emerald-800 bg-emerald-50 border-2 border-emerald-300 rounded-lg hover:bg-emerald-100 hover:border-emerald-500 transition shadow-sm"
              >
                <Icon icon="fa-plus" className="text-xs" />
                เพิ่มสินค้า
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-1">
              พิมพ์ค้นหาแล้วคลิกสินค้าในรายการด้านล่าง — จะใส่ใน{' '}
              <span className="font-bold text-emerald-700">แถวที่ {activeLineForProduct + 1}</span>{' '}
              (คลิกที่แถวสินค้าเพื่อเปลี่ยนแถวเป้าหมาย)
            </p>
            <input
              type="text"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า, รหัส, หมวดหมู่, ซัพพลายเออร์..."
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500 outline-none"
            />

            <div className="mb-3 rounded-xl border-2 border-gray-200 bg-gray-50/80 overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700 flex justify-between items-center">
                <span>ผลการค้นหา</span>
                <span className="font-mono text-emerald-700">
                  {products.length === 0
                    ? 'ยังไม่โหลดสินค้า'
                    : `${filteredProducts.length} / ${products.length} รายการ`}
                </span>
              </div>
              <div className="max-h-52 overflow-y-auto p-2 space-y-1">
                {products.length === 0 ? (
                  <p className="text-xs text-amber-700 px-2 py-3 text-center">รอโหลดรายการสินค้า...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="text-xs text-gray-500 px-2 py-3 text-center">
                    {productFilter.trim()
                      ? 'ไม่พบสินค้าที่ตรงกับคำค้น — ลองคำอื่น หรือล้างช่องค้นหาเพื่อดูรายการแรกๆ'
                      : 'ไม่มีรายการ (ผิดปกติ)'}
                  </p>
                ) : (
                  filteredProducts.map((p) => {
                    const pid = String(p.id ?? p.ProductID ?? '').trim()
                    const pname = p.name ?? p.ProductName ?? pid
                    const st = p.stock ?? p.Stock ?? 0
                    return (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => {
                          updateLine(activeLineForProduct, { productId: pid })
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm border border-transparent hover:bg-white hover:border-emerald-200 hover:shadow-sm transition flex flex-wrap items-baseline justify-between gap-2"
                      >
                        <span>
                          <span className="font-mono text-xs text-gray-500">{pid}</span>
                          <span className="mx-1 text-gray-300">|</span>
                          <span className="font-medium text-gray-900">{pname}</span>
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">คงเหลือ {st}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const key = line.productId ? String(line.productId).trim() : ''
                const sel = key ? productsById.get(key) : null
                const isActive = idx === activeLineForProduct
                return (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveLineForProduct(idx)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        setActiveLineForProduct(idx)
                      }
                    }}
                    className={`flex flex-wrap gap-2 items-end rounded-xl p-3 cursor-pointer transition ${
                      isActive
                        ? 'ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50/50 border border-emerald-200'
                        : 'border border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs font-bold text-gray-500 mb-0.5">
                        แถว {idx + 1}
                        {isActive ? ' (เลือกอยู่)' : ''}
                      </div>
                      {sel ? (
                        <div>
                          <div className="font-medium text-gray-900">{sel.name ?? sel.ProductName}</div>
                          <div className="text-xs text-gray-500 font-mono">{key}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 italic">ยังไม่เลือกสินค้า — คลิกรายการด้านบน</div>
                      )}
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-gray-500">จำนวน</label>
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateLine(idx, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })
                        }
                        className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm"
                      />
                    </div>
                    <div className="text-sm font-mono text-emerald-700 min-w-[72px] text-right">
                      {resolvedLines[idx]?.lineTotal != null
                        ? `฿${resolvedLines[idx].lineTotal.toLocaleString()}`
                        : '—'}
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeLine(idx)
                        }}
                        className="text-red-600 p-2"
                        title="ลบแถว"
                      >
                        <Icon icon="fa-trash" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">วิธีรับสินค้า</label>
              <select
                value={shippingMethod}
                onChange={(e) => setShippingMethod(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="delivery">จัดส่ง</option>
                <option value="pickup">รับเอง</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">ค่าจัดส่ง (บาท)</label>
              <input
                type="number"
                min={0}
                step={1}
                disabled={shippingMethod === 'pickup'}
                value={shippingMethod === 'pickup' ? 0 : shippingCost}
                onChange={(e) => setShippingCost(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">ที่อยู่ {shippingMethod === 'delivery' ? '*' : ''}</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="ที่อยู่จัดส่ง / ติดต่อ"
              required={shippingMethod === 'delivery'}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              placeholder="แขวง/ตำบล"
              value={subdistrict}
              onChange={(e) => setSubdistrict(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-xs"
            />
            <input
              placeholder="เขต/อำเภอ"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-xs"
            />
            <input
              placeholder="จังหวัด"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-xs"
            />
            <input
              placeholder="รหัสไปรษณีย์"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-xs"
            />
          </div>
          <input
            placeholder="เบอร์โทรผู้รับ"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">ส่วนลด (บาท)</label>
              <input
                type="number"
                min={0}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">สถานะออเดอร์</label>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="รอตรวจสอบ">รอตรวจสอบ</option>
                <option value="กำลังจัดเตรียม">กำลังจัดเตรียม</option>
                <option value="จัดส่งแล้ว">จัดส่งแล้ว</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">ชำระเงิน</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="transfer">โอนเงิน</option>
                <option value="credit">เครดิต (หักยอดทันที)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mt-6 sm:mt-8">
              <input
                type="checkbox"
                checked={deductStock}
                onChange={(e) => setDeductStock(e.target.checked)}
              />
              หักสต็อกสินค้า
            </label>
          </div>

          {paymentMethod === 'transfer' && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <label className="block text-sm font-bold text-gray-800">แนบสลิปโอนเงิน</label>
              <p className="text-xs text-gray-600">รองรับไฟล์รูปภาพ (ไม่บังคับ — ถ้ายังไม่มีสลิปให้เว้นว่างได้)</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={slipFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-emerald-700"
                />
                {slipFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlipFile(null)
                      if (slipFileInputRef.current) slipFileInputRef.current.value = ''
                    }}
                    className="text-sm font-bold text-red-700 hover:underline"
                  >
                    ล้างไฟล์
                  </button>
                )}
              </div>
              {slipPreviewUrl && (
                <div className="pt-1">
                  <img
                    src={slipPreviewUrl}
                    alt="ตัวอย่างสลิป"
                    className="max-h-40 rounded-lg border border-gray-200 object-contain bg-white"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">หมายเหตุ (บันทึกใน DiscountInfo)</label>
            <input
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="เช่น โทรสั่ง / นัดรับ..."
            />
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1 border border-gray-200">
            <div className="flex justify-between">
              <span>ยอดสินค้า</span>
              <span className="font-mono">฿{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>ส่วนลด</span>
              <span className="font-mono">-฿{disc.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>ค่าจัดส่ง</span>
              <span className="font-mono">฿{ship.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-emerald-700 pt-2 border-t border-gray-200">
              <span>รวม</span>
              <span className="font-mono">฿{total.toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500">น้ำหนักรวม {totalWeight.toLocaleString()} กรัม</p>
          </div>

          <div className="flex gap-3 pt-2 pb-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-3 rounded-xl border-2 border-gray-300 font-bold text-gray-700 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'กำลังบันทึก...' : 'สร้างออเดอร์'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
