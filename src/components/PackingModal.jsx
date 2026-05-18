import { useState, useEffect, useCallback } from 'react'
import Icon from './common/Icon'
import { packingService } from '../services/packingService'
import { getPackingBoxSizes, getShopInfo } from '../services/shopSettingsService'
import { exportShippingReportCsv } from '../utils/shippingReportExport'
import { productService } from '../services/productService'
import CameraScanModal from './CameraScanModal'
import Swal from 'sweetalert2'
import { getOrderItemDisplayName } from '../utils/orderBundleLineUtils'

export default function PackingModal ({ order, onClose, onSaved, shopName }) {
  const orderId = order?.ID || order?.OrderID
  const [boxSizes, setBoxSizes] = useState(['A2', 'B2', 'C+8', 'M', 'M+', 'H'])
  const [boxes, setBoxes] = useState([{ size: 'M', weight_kg: 0, items: [] }])
  const [currentBoxIndex, setCurrentBoxIndex] = useState(0)
  const [scanProductId, setScanProductId] = useState('')
  const [scanQty, setScanQty] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showPrintSummary, setShowPrintSummary] = useState(false)
  const [productWeights, setProductWeights] = useState({}) // productId -> weight (grams from DB)
  const [scannedPending, setScannedPending] = useState([]) // รายการที่แสกนในโมดัล [{ productId, name, qty }]

  useEffect(() => {
    getPackingBoxSizes().then(setBoxSizes)
  }, [])

  // โหลดน้ำหนักสินค้าจากรายละเอียดสินค้า (สำหรับคำนวณน้ำหนักกล่องโดยประมาณ)
  useEffect(() => {
    const orderItems = order?.Items || []
    const ids = [...new Set(orderItems.map((i) => i.id || i.name).filter(Boolean))]
    if (ids.length === 0) return
    Promise.all(ids.map((id) => productService.getProduct(id)))
      .then((products) => {
        const map = {}
        products.forEach((p, i) => {
          if (p && ids[i]) map[ids[i]] = Number(p.weight) || 0
        })
        setProductWeights(map)
      })
      .catch(() => {})
  }, [order?.ID, order?.OrderID])

  useEffect(() => {
    if (!orderId) return
    packingService.getPacking(orderId).then((data) => {
      if (data && data.length > 0) {
        setBoxes(data.map((b) => ({ size: b.size, weight_kg: b.weight_kg, items: b.items || [] })))
      }
    }).catch(() => {})
  }, [orderId])

  const orderItems = order?.Items || []

  /** สถานะการแพ็กของสินค้าหนึ่งรายการ */
  const getPackingInfo = useCallback((productId) => {
    const item = orderItems.find((i) => (i.id || i.name) === productId)
    const maxQty = item?.qty || 0
    const alreadyPacked = boxes.flatMap((b) => b.items).filter((x) => (x.productId || x.name) === productId).reduce((sum, x) => sum + (x.qty || 0), 0)
    const canAdd = Math.max(0, maxQty - alreadyPacked)
    return { maxQty, alreadyPacked, canAdd }
  }, [orderItems, boxes])

  /** ตรวจว่าออเดอร์แพ็กครบทุกรายการแล้วหรือยัง (รับ boxes ที่จะตรวจได้) */
  const isOrderFullyPacked = useCallback((boxesToCheck = boxes) => {
    return orderItems.every((it) => {
      const id = it.id || it.name
      const ordered = it.qty || 0
      const packed = boxesToCheck.flatMap((b) => b.items || []).filter((x) => (x.productId || x.name) === id).reduce((sum, x) => sum + (x.qty || 0), 0)
      return packed >= ordered
    })
  }, [orderItems, boxes])

  // เพิ่มสินค้า (productId, name, qty) ลงกล่องปัจจุบัน — ใช้ทั้งจากช่องกรอกและจากรายการแสกน
  const addItemToCurrentBox = (productId, name, qty) => {
    const { maxQty, alreadyPacked, canAdd } = getPackingInfo(productId)
    if (qty > canAdd) {
      if (canAdd === 0) {
        Swal.fire({ icon: 'info', title: 'รายการนี้ครบแล้ว', text: `แพ็กครบ ${maxQty} ชิ้นตามออเดอร์แล้ว`, timer: 2500 })
      } else {
        Swal.fire({ icon: 'warning', title: 'จำนวนเกินที่สั่ง', text: `ในออเดอร์มี ${maxQty} ชิ้น แพ็กไปแล้ว ${alreadyPacked} ชิ้น เพิ่มได้อีก ${canAdd} ชิ้นเท่านั้น`, timer: 3000 })
      }
      return false
    }
    const existing = boxes[currentBoxIndex].items.find((x) => (x.productId || x.name) === productId)
    setBoxes((prev) => {
      return prev.map((b, i) => {
        if (i !== currentBoxIndex) return b
        const list = [...(b.items || [])]
        if (existing) {
          const idx = list.findIndex((x) => (x.productId || x.name) === productId)
          list[idx] = { ...list[idx], qty: (list[idx].qty || 0) + qty }
        } else {
          list.push({ productId, name, qty })
        }
        return { ...b, items: list }
      })
    })
    return true
  }

  const addToCurrentBox = () => {
    const pid = (scanProductId || '').trim().toLowerCase()
    const qty = Math.max(1, parseInt(scanQty, 10) || 1)
    if (!pid) {
      Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสสินค้า', timer: 1500, showConfirmButton: false })
      return
    }
    const item = orderItems.find(
      (i) => (i.id || '').toString().toLowerCase() === pid || (i.name || '').toLowerCase().includes(pid)
    )
    if (!item) {
      Swal.fire({ icon: 'warning', title: 'ไม่พบสินค้าในออเดอร์นี้', text: `รหัส/ชื่อ: ${scanProductId}`, timer: 2000 })
      return
    }
    const productId = item.id || item.name
    const name = item.name || productId
    const { maxQty, alreadyPacked, canAdd } = getPackingInfo(productId)
    if (qty > canAdd) {
      if (canAdd === 0) {
        Swal.fire({ icon: 'info', title: 'รายการนี้ครบแล้ว', text: `แพ็กครบ ${maxQty} ชิ้นตามออเดอร์แล้ว` })
      } else {
        Swal.fire({ icon: 'warning', title: 'จำนวนเกินที่สั่ง', text: `ในออเดอร์มี ${maxQty} ชิ้น แพ็กไปแล้ว ${alreadyPacked} ชิ้น เพิ่มได้อีก ${canAdd} ชิ้นเท่านั้น` })
      }
      return
    }
    if (addItemToCurrentBox(productId, name, qty)) {
      setScanProductId('')
      setScanQty(1)
      const newPackedThis = alreadyPacked + qty
      const remainingThis = maxQty - newPackedThis
      const isOrderComplete = (newPackedThis >= maxQty) && orderItems.every((it) => {
        const id = it.id || it.name
        const ordered = it.qty || 0
        const packed = id === productId ? newPackedThis : boxes.flatMap((b) => b.items || []).filter((x) => (x.productId || x.name) === id).reduce((s, x) => s + (x.qty || 0), 0)
        return packed >= ordered
      })
      if (isOrderComplete) {
        Swal.fire({ icon: 'success', title: 'แพ็กออเดอร์ครบแล้ว', timer: 2000, showConfirmButton: true, confirmButtonText: 'ตกลง' })
      } else if (remainingThis <= 0) {
        Swal.fire({ icon: 'success', title: 'รายการนี้ครบตามออเดอร์แล้ว', timer: 1500, showConfirmButton: false })
      } else {
        Swal.fire({ icon: 'success', title: `เหลือต้องแพ็กอีก ${remainingThis} ชิ้นถึงครบตามออเดอร์`, timer: 1800, showConfirmButton: false })
      }
    }
  }

  const addBox = () => {
    setBoxes((prev) => [...prev, { size: boxSizes[0] || 'M', weight_kg: 0, items: [] }])
    setCurrentBoxIndex(boxes.length)
  }

  const removeBox = (idx) => {
    if (boxes.length <= 1) return
    setBoxes((prev) => prev.filter((_, i) => i !== idx))
    setCurrentBoxIndex((prev) => (prev >= idx && prev > 0 ? prev - 1 : prev))
  }

  const setBoxSize = (idx, size) => {
    setBoxes((prev) => prev.map((b, i) => (i === idx ? { ...b, size } : b)))
  }
  const setBoxWeight = (idx, weight_kg) => {
    setBoxes((prev) => prev.map((b, i) => (i === idx ? { ...b, weight_kg: Number(weight_kg) || 0 } : b)))
  }

  const removeItemFromBox = (boxIdx, itemIdx) => {
    setBoxes((prev) => prev.map((b, i) => {
      if (i !== boxIdx) return b
      const list = (b.items || []).filter((_, j) => j !== itemIdx)
      return { ...b, items: list }
    }))
  }

  // น้ำหนักโดยประมาณจากรายละเอียดสินค้า (รองรับทั้งกรัมและกก. ใน DB)
  const getBoxSuggestedWeightKg = useCallback((box) => {
    const items = box.items || []
    let totalKg = 0
    items.forEach((it) => {
      const w = Number(productWeights[it.productId || it.name]) || 0
      if (w <= 0) return
      const qty = it.qty || 0
      // ค่าใน DB มักเป็นกรัม (เช่น 500) ถ้าตัวเลข >= 100 ให้ถือว่าเป็นกรัม
      const kgPerUnit = w >= 100 ? w / 1000 : w
      totalKg += qty * kgPerUnit
    })
    return totalKg > 0 ? totalKg : null
  }, [productWeights])

  const applySuggestedWeight = async (boxIdx) => {
    const box = boxes[boxIdx]
    const suggested = getBoxSuggestedWeightKg(box)
    if (suggested == null) return
    const shop = await getShopInfo()
    const map = shop.packingBoxWeightBySize && typeof shop.packingBoxWeightBySize === 'object' ? shop.packingBoxWeightBySize : {}
    const sizeKey = (box.size || '').toString().trim()
    const shell = Number(map[sizeKey]) || Number(shop.packingBoxWeightKg) || 0
    setBoxWeight(boxIdx, suggested + shell)
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await packingService.savePacking(orderId, boxes)
      onSaved?.()
      Swal.fire({ icon: 'success', title: 'บันทึกการแพ็กแล้ว', timer: 1500, showConfirmButton: false })
      onClose()
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleExportReport = async () => {
    setLoading(true)
    try {
      const { blob, rowCount } = await exportShippingReportCsv([{ order, packing: boxes }])
      if (rowCount === 0) {
        Swal.fire({ icon: 'warning', title: 'ยังไม่มีแถวส่งออก', text: 'เพิ่มกล่องและบันทึกการแพ็กอย่างน้อย 1 กล่องก่อน' })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `รายงานจัดส่ง_${orderId}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      Swal.fire({ icon: 'success', title: 'ส่งออกรายงานแล้ว', timer: 1500, showConfirmButton: false })
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ส่งออกไม่สำเร็จ', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (!order) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 bg-amber-600 text-white font-bold flex justify-between items-center shrink-0">
          <span><Icon icon="fa-box-open" className="mr-2" />แพ็กสินค้า — {orderId}</span>
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/20 rounded"><Icon icon="fa-times" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* รายการสินค้าที่ต้องแพ็ก (ใช้ร่วมกับเปิดกล้องแสกน) */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">รายการสินค้าที่ต้องแพ็ก</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left font-bold text-gray-700">รหัสสินค้า</th>
                    <th className="p-2 text-left font-bold text-gray-700">ชื่อสินค้า</th>
                    <th className="p-2 text-right font-bold text-gray-700">จำนวนที่สั่ง</th>
                    <th className="p-2 text-right font-bold text-gray-700">แพ็กแล้ว</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, i) => {
                    const productId = item.id || item.name
                    const orderedQty = item.qty || 0
                    const packedQty = boxes.flatMap((b) => b.items || []).filter((x) => (x.productId || x.name) === productId).reduce((sum, x) => sum + (x.qty || 0), 0)
                    return (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-2 text-gray-700 font-mono text-xs" title="ใช้รหัสนี้ใน QR / แสกน">{productId || '-'}</td>
                        <td className="p-2 text-gray-800">{getOrderItemDisplayName(item.name)}</td>
                        <td className="p-2 text-right">{orderedQty}</td>
                        <td className="p-2 text-right">
                          <span className={packedQty >= orderedQty ? 'text-green-600 font-bold' : 'text-gray-600'}>{packedQty}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* เพิ่มลงกล่อง */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">รหัสสินค้า / แสกน</label>
            <input
              type="text"
              value={scanProductId}
              onChange={(e) => setScanProductId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addToCurrentBox()}
              placeholder="รหัสหรือชื่อสินค้า"
              className="border border-gray-300 rounded px-3 py-2 w-40"
            />
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="px-3 py-2 border border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 font-medium flex items-center gap-1"
              title="เปิดกล้องแสกน QR/บาร์โค้ด"
            >
              <Icon icon="fa-camera" /> เปิดกล้องแสกน
            </button>
            <label className="text-sm font-medium">จำนวน</label>
            <input
              type="number"
              min={1}
              value={scanQty}
              onChange={(e) => setScanQty(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 w-20"
            />
            <button
              type="button"
              onClick={addToCurrentBox}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
            >
              <Icon icon="fa-plus" className="mr-1" />เพิ่มลงกล่องปัจจุบัน
            </button>
          </div>

          {/* กล่อง */}
          <div>
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-gray-800">กล่อง (ทั้งหมด {boxes.length} กล่อง)</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintSummary(true)}
                  className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1"
                >
                  <Icon icon="fa-list-alt" />
                  ตรวจสอบ / พิมพ์สรุปกล่อง
                </button>
                <button type="button" onClick={addBox} className="text-sm text-amber-600 hover:underline font-medium">
                  <Icon icon="fa-plus" className="mr-1" />เพิ่มกล่อง
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {boxes.map((box, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-bold text-gray-700">กล่องที่ {idx + 1}</span>
                    <select
                      value={box.size}
                      onChange={(e) => setBoxSize(idx, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      {boxSizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <label className="text-sm">น้ำหนัก (กก.)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={box.weight_kg || ''}
                      onChange={(e) => setBoxWeight(idx, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
                    />
                    {getBoxSuggestedWeightKg(box) != null && (
                      <span className="text-xs text-gray-500">
                        โดยประมาณ: {getBoxSuggestedWeightKg(box).toFixed(2)} กก.
                        <button
                          type="button"
                          onClick={() => void applySuggestedWeight(idx)}
                          className="ml-1 text-amber-600 hover:underline"
                        >
                          ใช้ค่าที่คำนวณ
                        </button>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeBox(idx)}
                      disabled={boxes.length <= 1}
                      className="text-red-600 hover:underline text-sm disabled:opacity-50"
                    >
                      ลบกล่อง
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentBoxIndex(idx)}
                      className={`text-sm px-2 py-1 rounded ${currentBoxIndex === idx ? 'bg-amber-600 text-white' : 'bg-gray-200'}`}
                    >
                      เลือก
                    </button>
                  </div>
                  <ul className="text-sm text-gray-600">
                    {(box.items || []).map((it, j) => (
                      <li key={j} className="flex justify-between items-center py-0.5">
                        <span>{it.name || it.productId} x{it.qty}</span>
                        <button type="button" onClick={() => removeItemFromBox(idx, j)} className="text-red-500 hover:underline">
                          <Icon icon="fa-times" />
                        </button>
                      </li>
                    ))}
                    {(box.items || []).length === 0 && <li className="text-gray-400">ยังไม่มีรายการ</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleFinish}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'กำลังบันทึก...' : 'เสร็จสิ้น & บันทึกการแพ็ก'}
          </button>
          <button
            type="button"
            onClick={() => setShowPrintSummary(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium flex items-center gap-1"
          >
            <Icon icon="fa-print" />
            ตรวจสอบ / พิมพ์สรุปกล่อง
          </button>
          <button
            type="button"
            onClick={handleExportReport}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'กำลังส่งออก...' : 'ส่งออกรายงาน CSV'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            ปิด
          </button>
        </div>
      </div>

      {/* โมดัลตรวจสอบ / พิมพ์สรุปกล่อง */}
      {showPrintSummary && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-gray-800">สรุปกล่องในออเดอร์ — {orderId}</h3>
              <button type="button" onClick={() => setShowPrintSummary(false)} className="p-1 text-gray-500 hover:text-gray-700">
                <Icon icon="fa-times" />
              </button>
            </div>
            <div id="packing-summary-print" className="flex-1 overflow-y-auto p-4 text-sm space-y-4">
              <p className="font-bold text-gray-800">ออเดอร์นี้มีทั้งหมด <span className="text-amber-600">{boxes.length}</span> กล่อง</p>
              {boxes.map((box, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="font-bold text-gray-700 mb-2">
                    กล่องที่ {idx + 1} — Size: {box.size} {box.weight_kg ? `, น้ำหนัก: ${box.weight_kg} กก.` : ''}
                  </div>
                  <p className="text-gray-600 mb-1">จำนวนรายการในกล่อง: {(box.items || []).length} รายการ</p>
                  <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                    {(box.items || []).length === 0 ? (
                      <li className="text-gray-400">ยังไม่มีรายการ</li>
                    ) : (
                      (box.items || []).map((it, j) => (
                        <li key={j}>{it.name || it.productId} x{it.qty}</li>
                      ))
                    )}
                  </ul>
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const content = document.getElementById('packing-summary-print')
                  if (!content) return
                  const win = window.open('', '_blank')
                  win.document.write(`
                    <!DOCTYPE html><html><head><meta charset="utf-8"><title>สรุปกล่อง ออเดอร์ ${orderId}</title>
                    <style>body{font-family:system-ui,sans-serif;padding:20px;max-width:500px;margin:0 auto} h2{margin-bottom:16px} .box{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px;background:#f9fafb} .box h3{margin:0 0 8px} ul{margin:0;padding-left:20px}</style>
                    </head><body>
                    <h2>สรุปกล่องในออเดอร์ — ${orderId}</h2>
                    <p><strong>ออเดอร์นี้มีทั้งหมด ${boxes.length} กล่อง</strong></p>
                    ${boxes.map((box, idx) => `
                      <div class="box">
                        <h3>กล่องที่ ${idx + 1} — Size: ${box.size}${box.weight_kg ? `, น้ำหนัก: ${box.weight_kg} กก.` : ''}</h3>
                        <p>จำนวนรายการในกล่อง: ${(box.items || []).length} รายการ</p>
                        <ul>${(box.items || []).length === 0 ? '<li>ยังไม่มีรายการ</li>' : (box.items || []).map((it) => `<li>${(it.name || it.productId)} x${it.qty}</li>`).join('')}</ul>
                      </div>
                    `).join('')}
                    </body></html>
                  `)
                  win.document.close()
                  win.focus()
                  setTimeout(() => win.print(), 300)
                }}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium flex items-center justify-center gap-1"
              >
                <Icon icon="fa-print" /> พิมพ์
              </button>
              <button
                type="button"
                onClick={() => setShowPrintSummary(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <CameraScanModal
          keepOpenOnScan
          onScan={async (decodedText) => {
            const raw = (decodedText || '').trim()
            if (!raw) return
            const pid = raw.toLowerCase()
            const item = orderItems.find(
              (i) => (i.id || '').toString().toLowerCase() === pid || (i.name || '').toLowerCase().includes(pid) || (i.id || '').toString() === raw
            )
            if (!item) {
              Swal.fire({ icon: 'warning', title: 'ไม่พบสินค้าในออเดอร์นี้', text: raw, timer: 2000 })
              return
            }
            const productId = item.id || item.name
            const name = getOrderItemDisplayName(item.name) || productId
            const { maxQty, alreadyPacked, canAdd } = getPackingInfo(productId)
            if (canAdd === 0) {
              Swal.fire({ icon: 'info', title: 'รายการนี้ครบแล้ว', text: `${name} แพ็กครบ ${maxQty} ชิ้นตามออเดอร์แล้ว แสกนรายการอื่นได้`, timer: 2500 })
              return
            }
            const { value, isConfirmed } = await Swal.fire({
              title: 'ระบุจำนวน',
              html: `
                <p class="text-gray-800 font-medium mb-2">${name}</p>
                <p class="text-sm text-gray-600 mb-1">สั่ง <strong>${maxQty}</strong> ชิ้น · แพ็กแล้ว <strong>${alreadyPacked}</strong> ชิ้น</p>
                <p class="text-sm text-amber-600 font-medium mb-2">เหลือเพิ่มได้อีก <strong>${canAdd}</strong> ชิ้นถึงครบตามออเดอร์</p>
                <p class="text-xs text-gray-500">กรอกจำนวนแล้วกดบันทึก จากนั้นแสกนรายการถัดไปได้</p>
              `,
              input: 'number',
              inputValue: Math.min(1, canAdd),
              inputMin: 1,
              inputAttributes: { min: 1, max: canAdd },
              showCancelButton: true,
              confirmButtonText: 'บันทึก',
              cancelButtonText: 'ยกเลิก',
              icon: 'question'
            })
            if (isConfirmed && value != null) {
              const qty = Math.max(1, parseInt(value, 10) || 1)
              if (qty > canAdd) {
                Swal.fire({ icon: 'warning', title: 'จำนวนเกินที่สั่ง', text: `เพิ่มได้อีก ${canAdd} ชิ้นเท่านั้น`, timer: 2500 })
                return
              }
              const ok = addItemToCurrentBox(productId, name, qty)
              if (!ok) return
              const newPackedThis = alreadyPacked + qty
              const remainingThis = maxQty - newPackedThis
              const isOrderComplete = (newPackedThis >= maxQty) && orderItems.every((it) => {
                const id = it.id || it.name
                const ordered = it.qty || 0
                const packed = id === productId ? newPackedThis : boxes.flatMap((b) => b.items || []).filter((x) => (x.productId || x.name) === id).reduce((s, x) => s + (x.qty || 0), 0)
                return packed >= ordered
              })
              let msg = `เพิ่มลงกล่องแล้ว ${name} x${qty} ชิ้น`
              if (isOrderComplete) {
                msg += '\n\nแพ็กออเดอร์ครบแล้ว'
                Swal.fire({ icon: 'success', title: 'เพิ่มลงกล่องแล้ว', text: msg, timer: 2500, showConfirmButton: true, confirmButtonText: 'ตกลง' })
              } else if (remainingThis <= 0) {
                msg += '\n\nรายการนี้ครบตามออเดอร์แล้ว'
                Swal.fire({ icon: 'success', title: 'เพิ่มลงกล่องแล้ว', text: msg, timer: 2200, showConfirmButton: false })
              } else {
                msg += `\n\nเหลือต้องแพ็กอีก ${remainingThis} ชิ้นถึงครบตามออเดอร์`
                Swal.fire({ icon: 'success', title: 'เพิ่มลงกล่องแล้ว', text: msg, timer: 2200, showConfirmButton: false })
              }
            }
          }}
          onClose={() => { setShowCamera(false); setScannedPending([]) }}
          scannedList={[]}
          onQtyChange={() => {}}
          onAddToBox={() => {}}
          onAddAllToBox={() => {}}
        />
      )}
    </div>
  )
}
