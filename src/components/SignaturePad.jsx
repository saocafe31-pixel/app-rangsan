import { useRef, useEffect, useState } from 'react'

/**
 * Canvas สำหรับวาด/เซ็นลายเซ็น รองรับเมาส์และ touch (iPad/แท็บเล็ต/มือถือ)
 * - onSave(blob): ส่ง blob รูป PNG เมื่อกดบันทึก
 * - onCancel(): เมื่อกดยกเลิก
 */
export default function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)

  const getPoint = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches && e.touches[0]) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const drawStart = (e) => {
    e.preventDefault?.()
    const p = getPoint(e)
    if (!p) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const drawMove = (e) => {
    e.preventDefault?.()
    if (!isDrawing) return
    const p = getPoint(e)
    if (!p) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasStroke(true)
  }

  const drawEnd = (e) => {
    e.preventDefault?.()
    setIsDrawing(false)
  }

  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.parentElement.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.floor(rect.width * dpr)
    const h = Math.floor(Math.min(rect.height, 220) * dpr)
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${h / dpr}px`
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = Math.max(2, 2 * dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  useEffect(() => {
    const t = setTimeout(initCanvas, 50)
    const onResize = () => initCanvas()
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(
      (blob) => {
        if (blob) onSave?.(blob)
      },
      'image/png',
      0.95
    )
  }

  return (
    <div className="signature-pad">
      <p className="text-sm text-gray-600 mb-2">ลากนิ้วหรือเมาส์เพื่อเซ็นในกรอบด้านล่าง</p>
      <div
        className="border-2 border-gray-300 rounded-lg bg-white overflow-hidden touch-none"
        style={{ minHeight: 200 }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={drawStart}
          onMouseMove={drawMove}
          onMouseUp={drawEnd}
          onMouseLeave={drawEnd}
          onTouchStart={drawStart}
          onTouchMove={drawMove}
          onTouchEnd={drawEnd}
          onTouchCancel={drawEnd}
          style={{ display: 'block', width: '100%', touchAction: 'none' }}
        />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={clear}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          ล้าง
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!hasStroke}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ใช้ลายเซ็นนี้
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  )
}
