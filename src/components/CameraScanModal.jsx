import { useEffect, useRef, useState } from 'react'
import Icon from './common/Icon'

const SCANNER_DIV_ID = 'html5-qrcode-scanner-root'

/**
 * เปิดกล้องแสกน QR/Barcode
 * - keepOpenOnScan: true = แสกนแล้วไม่ปิด โมดัล แสดงรายการที่แสกนให้กรอกจำนวน
 * - scannedList: รายการที่แสกนแล้ว [{ productId, name, qty }]
 */
export default function CameraScanModal ({
  onScan,
  onClose,
  keepOpenOnScan = false,
  scannedList = [],
  onQtyChange,
  onAddToBox,
  onAddAllToBox
}) {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const scannerRef = useRef(null)
  const onScanRef = useRef(onScan)
  const onCloseRef = useRef(onClose)
  onScanRef.current = onScan
  onCloseRef.current = onClose

  useEffect(() => {
    let html5Qrcode = null
    const start = async () => {
      const el = document.getElementById(SCANNER_DIV_ID)
      if (!el) return
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        // ใช้ Html5Qrcode โดยตรง — เปิดกล้องทันทีแบบแอปแสกน (ไม่แสดง UI เลือกไฟล์/ลิงก์ "Scan using camera directly")
        html5Qrcode = new Html5Qrcode(SCANNER_DIV_ID, {
          formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
        })
        scannerRef.current = html5Qrcode
        const config = { fps: 10, qrbox: { width: 250, height: 250 } }
        const onSuccess = (decodedText) => {
          onScanRef.current(decodedText)
          if (!keepOpenOnScan && scannerRef.current) {
            scannerRef.current.stop().catch(() => {}).then(() => {
              scannerRef.current = null
              onCloseRef.current()
            })
          }
        }
        try {
          await html5Qrcode.start({ facingMode: 'environment' }, config, onSuccess, () => {})
        } catch (_) {
          await html5Qrcode.start({ facingMode: 'user' }, config, onSuccess, () => {})
        }
      } catch (e) {
        console.error('Camera scan init error:', e)
        setError(e?.message || String(e) || 'ไม่สามารถเปิดกล้องได้ (อนุญาตสิทธิ์กล้องหรือใช้ HTTPS)')
      } finally {
        setLoading(false)
      }
    }
    start()
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).then(() => {})
        scannerRef.current = null
      }
    }
  }, [keepOpenOnScan])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80">
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="p-4 bg-amber-600 text-white font-bold flex justify-between items-center">
          <span><Icon icon="fa-camera" className="mr-2" />เปิดกล้องแสกน</span>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded font-medium flex items-center gap-2 hover:bg-white/20" title="ปิดกล้อง">
            <Icon icon="fa-times" /> ปิดกล้อง
          </button>
        </div>
        <div className="p-4 min-h-[280px] flex flex-col items-center justify-center">
          {loading && <p className="text-gray-500">กำลังเปิดกล้อง...</p>}
          {error && (
            <div className="text-center">
              <p className="text-red-600 mb-2">{error}</p>
              <p className="text-sm text-gray-500">ลองกรอกรหัสสินค้าในช่องด้านล่างแทน</p>
            </div>
          )}
          <div id={SCANNER_DIV_ID} className="w-full" style={{ minHeight: error ? 0 : 260 }} />
        </div>
        <div className="p-3 border-t flex flex-col items-center gap-2">
          <p className="text-sm text-gray-500">ชี้กล้องไปที่ QR หรือบาร์โค้ดบนสินค้า</p>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium text-sm">
            <Icon icon="fa-times" className="mr-1" /> ปิดกล้อง
          </button>
        </div>

        {keepOpenOnScan && scannedList.length > 0 && (
          <div className="border-t p-4 bg-gray-50 max-h-48 overflow-y-auto">
            <h4 className="text-sm font-bold text-gray-800 mb-2">รายการที่แสกน — กรอกจำนวนแล้วกดเพิ่มลงกล่อง</h4>
            <ul className="space-y-2">
              {scannedList.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 flex-wrap bg-white rounded-lg p-2 border border-gray-200">
                  <span className="flex-1 min-w-0 text-sm text-gray-800 truncate" title={item.name}>{item.name}</span>
                  <label className="text-xs text-gray-500">จำนวน</label>
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => onQtyChange?.(idx, Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => onAddToBox?.(idx)}
                    className="px-2 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                  >
                    เพิ่มลงกล่อง
                  </button>
                </li>
              ))}
            </ul>
            {onAddAllToBox && scannedList.length > 1 && (
              <button
                type="button"
                onClick={onAddAllToBox}
                className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700"
              >
                เพิ่มทั้งหมดลงกล่อง
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
