import { useEffect, useMemo, useState } from 'react'
import Icon from '../common/Icon'
import {
  buildBundleSelectionSummary,
  calculateMaxBundleOrderQty,
  validateFlexibleBundleSelections,
  snapBundleQtyToStep
} from '../../utils/bundleUtils'
import { normalizeSelectedOptions, getSelectedOptionPriceDetails } from '../../utils/productCatalog'
import { getPricingShapeForBundlePrimary, getPricingShapeFromProduct, resolveCartUnitPrice } from '../../utils/priceTiers'

export default function BundleSelectionModal({
  open,
  product,
  memberProducts = [],
  user = null,
  initialSelections = null,
  initialSelectedOptions = null,
  onClose,
  onConfirm
}) {
  const [selections, setSelections] = useState({})
  const [orderQty, setOrderQty] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [error, setError] = useState('')

  const productById = useMemo(() => new Map(memberProducts.map((p) => [p.id, p])), [memberProducts])
  const bundleIds = useMemo(
    () => (Array.isArray(product?.bundleLines) ? product.bundleLines.map((l) => String(l?.productId || '').trim()).filter(Boolean) : []),
    [product?.bundleLines]
  )
  const orderStep = Math.max(1, Number(product?.orderStep || 1))
  const primaryId = product?.bundlePrimaryProductId
  const maxFixedQty = useMemo(
    () => calculateMaxBundleOrderQty(product, product?.bundleLines, productById),
    [product, productById]
  )

  const userType =
    String(user?.userType || user?.customerType || 'regular').toLowerCase() === 'franchise' ? 'franchise' : 'regular'

  const optionExtraPerUnit = useMemo(() => {
    const details = getSelectedOptionPriceDetails(product?.productOptions, selectedOptions)
    return details.reduce((s, d) => s + (Number(d.extraPrice || 0) || 0), 0)
  }, [product?.productOptions, selectedOptions])

  const previewQty = product?.bundleFlexible ? Number(selections[primaryId] || 0) : Number(orderQty || 0)
  const pricingShapeForPreview = useMemo(() => {
    if (!product) return null
    const primary = primaryId ? productById.get(primaryId) : null
    if (primary) return getPricingShapeForBundlePrimary(product, primary)
    return getPricingShapeFromProduct(product)
  }, [product, productById, primaryId])
  const previewUnitPrice =
    pricingShapeForPreview && previewQty > 0
      ? resolveCartUnitPrice(pricingShapeForPreview, previewQty, userType, optionExtraPerUnit)
      : null
  const previewLineTotal =
    previewUnitPrice != null &&
    Number.isFinite(previewUnitPrice) &&
    previewQty > 0
      ? previewUnitPrice * previewQty
      : null
  const summaryText = useMemo(
    () =>
      buildBundleSelectionSummary(
        product?.bundleFlexible ? selections : (() => {
          const qty = Math.max(orderStep, Math.round(Number(orderQty || orderStep) / orderStep) * orderStep)
          const ratio = qty / orderStep
          const out = {}
          for (const line of product?.bundleLines || []) {
            const productId = String(line?.productId || '').trim()
            const lineQty = Number(line?.qty || 0)
            if (!productId || lineQty <= 0) continue
            out[productId] = lineQty * ratio
          }
          return out
        })(),
        productById
      ),
    [product, selections, orderQty, orderStep, productById]
  )

  useEffect(() => {
    if (!open || !product) return
    if (product.bundleFlexible) {
      const next = {}
      for (const id of bundleIds) next[id] = id === primaryId ? orderStep : 0
      if (initialSelections && typeof initialSelections === 'object') {
        for (const id of bundleIds) {
          const step = id === primaryId ? orderStep : Math.max(1, Number(productById.get(id)?.orderStep || 1))
          next[id] = snapBundleQtyToStep(Number(initialSelections[id] || next[id] || 0), step)
        }
      }
      setSelections(next)
      setOrderQty(0)
    } else {
      setSelections({})
      setOrderQty(orderStep)
    }
    const opts = {}
    for (const opt of product.productOptions || []) {
      opts[opt.name] = ''
    }
    if (initialSelectedOptions && typeof initialSelectedOptions === 'object') {
      for (const [k, v] of Object.entries(initialSelectedOptions)) {
        if (Object.prototype.hasOwnProperty.call(opts, k)) {
          opts[k] = String(v || '')
        }
      }
    }
    setSelectedOptions(opts)
    setError('')
  }, [open, product, bundleIds, primaryId, orderStep, initialSelections, initialSelectedOptions, productById])

  if (!open || !product) return null

  const confirm = () => {
    setError('')
    const options = normalizeSelectedOptions(selectedOptions)
    for (const opt of product.productOptions || []) {
      if (opt.required && !String(options[opt.name] || '').trim()) {
        setError(`กรุณาเลือกตัวเลือก: ${opt.name}`)
        return
      }
    }

    if (product.bundleFlexible) {
      const check = validateFlexibleBundleSelections(product, selections, productById)
      if (!check.ok) {
        setError(check.message || 'ข้อมูลชุดไม่ถูกต้อง')
        return
      }
      const primaryQty = Number(selections[primaryId] || 0)
      onConfirm({
        mode: 'flexible',
        primaryQty,
        bundleSelections: selections,
        selectedOptions: options,
        summary: buildBundleSelectionSummary(selections, productById)
      })
      return
    }

    const qty = Math.max(orderStep, Math.round(Number(orderQty || 0) / orderStep) * orderStep)
    if (qty <= 0) {
      setError('จำนวนต้องมากกว่า 0')
      return
    }
    if (qty > maxFixedQty) {
      setError(`จำนวนเกินสต็อกชุด (สูงสุด ${maxFixedQty})`)
      return
    }
    const ratio = qty / orderStep
    const bundleSelections = {}
    for (const line of product.bundleLines || []) {
      const productId = String(line?.productId || '').trim()
      const lineQty = Number(line?.qty || 0)
      if (!productId || lineQty <= 0) continue
      bundleSelections[productId] = lineQty * ratio
    }
    onConfirm({
      mode: 'fixed',
      orderQty: qty,
      bundleSelections,
      selectedOptions: options,
      summary: buildBundleSelectionSummary(bundleSelections, productById)
    })
  }

  const normalizeFlexibleQty = (pid, rawValue) => {
    const comp = productById.get(pid)
    const step = pid === primaryId ? orderStep : Math.max(1, Number(comp?.orderStep || 1))
    const stock = Number(comp?.stock || 0)
    let n = Math.max(0, Number(rawValue || 0))
    n = snapBundleQtyToStep(n, step)
    if (stock > 0) {
      n = Math.min(n, Math.floor(stock / step) * step)
    }
    return n
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {product.bundleFlexible ? 'Flexible Bundle' : 'Fixed Bundle'} · step {orderStep}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded hover:bg-gray-100">
            <Icon icon="fa-times" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {previewLineTotal != null ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
              ประเมินราคา: <span className="font-bold">฿{previewUnitPrice.toLocaleString()}</span> ต่อหน่วย · รวม{' '}
              <span className="font-bold text-emerald-700">฿{previewLineTotal.toLocaleString()}</span>
            </div>
          ) : null}
          {summaryText ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-bold">สรุปชุด:</span> {summaryText}
            </div>
          ) : null}

          {product.bundleFlexible ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">เลือกจำนวนส่วนประกอบในชุด</p>
              {bundleIds.map((pid) => {
                const p = productById.get(pid)
                const step = pid === primaryId ? orderStep : Math.max(1, Number(p?.orderStep || 1))
                const stock = Number(p?.stock || 0)
                const raw = Number(selections[pid] ?? 0)
                const cap = stock > 0 ? Math.floor(stock / step) * step : null
                return (
                  <div key={pid} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200 gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900">{p?.name || pid} {pid === primaryId ? '(หลัก)' : ''}</div>
                      <div className="text-xs text-gray-500">step {step} / stock {stock}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step={step}
                      max={cap ?? undefined}
                      className="w-24 h-9 text-center text-sm font-bold border border-gray-300 rounded"
                      value={String(Math.max(0, raw))}
                      onChange={(e) =>
                        setSelections((prev) => ({
                          ...prev,
                          [pid]: Math.max(0, Number(e.target.value || 0))
                        }))
                      }
                      onBlur={() =>
                        setSelections((prev) => ({
                          ...prev,
                          [pid]: normalizeFlexibleQty(pid, prev[pid])
                        }))
                      }
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">ชุดแบบคงที่</p>
              <p className="text-xs text-gray-500">จำนวนสูงสุดที่สั่งได้ตามสต็อกชิ้นส่วน: <b>{maxFixedQty}</b></p>
              <input
                type="number"
                min={orderStep}
                step={orderStep}
                max={maxFixedQty}
                className="w-full h-10 text-center text-sm font-bold border border-gray-300 rounded"
                value={String(Math.max(0, Number(orderQty || 0)))}
                onChange={(e) => setOrderQty(Math.max(0, Number(e.target.value || 0)))}
                onBlur={() =>
                  setOrderQty((prev) => {
                    let n = Math.max(orderStep, snapBundleQtyToStep(Number(prev || 0), orderStep))
                    if (maxFixedQty > 0) n = Math.min(n, maxFixedQty)
                    return n
                  })
                }
              />
            </div>
          )}

          {Array.isArray(product.productOptions) && product.productOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">ตัวเลือกสินค้า</p>
              {product.productOptions.map((opt) => (
                <div key={opt.name}>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {opt.name} {opt.required ? '*' : ''}
                  </label>
                  <select
                    value={selectedOptions[opt.name] || ''}
                    onChange={(e) => setSelectedOptions((prev) => ({ ...prev, [opt.name]: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">{opt.required ? 'กรุณาเลือก' : 'ไม่ระบุ'}</option>
                    {(opt.values || []).map((v) => (
                      <option key={`${v.label}-${v.price ?? 0}`} value={v.label}>
                        {v.label}{Number(v.price || 0) > 0 ? ` (+${Number(v.price || 0).toLocaleString()} บาท)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div> : null}
        </div>
        <div className="border-t p-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded border text-gray-700 font-bold">
            ยกเลิก
          </button>
          <button type="button" onClick={confirm} className="px-4 py-2 rounded bg-emerald-600 text-white font-bold">
            ยืนยันและเพิ่มลงตะกร้า
          </button>
        </div>
      </div>
    </div>
  )
}
