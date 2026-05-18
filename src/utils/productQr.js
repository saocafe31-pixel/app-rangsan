/**
 * สร้าง QR Code (data URL) จากรหัสสินค้า สำหรับแสกน/ดาวน์โหลด
 */
export async function generateProductQrDataUrl(productId, options = {}) {
  const { width = 256, margin = 2 } = options
  const text = String(productId || '')
  if (!text) return null
  const qr = await import('qrcode/lib/browser.js')
  const toDataURL = (qr.default || qr).toDataURL
  return toDataURL(text, { width, margin })
}

/**
 * ดาวน์โหลดรูป QR เป็นไฟล์ PNG
 */
export function downloadQrImage(dataUrl, filename = 'qr-product.png') {
  if (!dataUrl) return
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
