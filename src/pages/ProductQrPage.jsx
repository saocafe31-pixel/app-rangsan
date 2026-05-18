import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { productService } from '../services/productService'
import { generateProductQrDataUrl, downloadQrImage } from '../utils/productQr'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function ProductQrPage({ user }) {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [qrCache, setQrCache] = useState({}) // productId -> dataUrl
  const [loadingQr, setLoadingQr] = useState({}) // productId -> true

  useEffect(() => {
    let cancelled = false
    productService.getAllProducts(user, '').then((data) => {
      if (!cancelled) setProducts(data || [])
    }).catch(() => {
      if (!cancelled) setProducts([])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [user])

  const loadQr = async (productId) => {
    if (qrCache[productId]) return qrCache[productId]
    setLoadingQr((prev) => ({ ...prev, [productId]: true }))
    try {
      const dataUrl = await generateProductQrDataUrl(productId)
      setQrCache((prev) => ({ ...prev, [productId]: dataUrl }))
      return dataUrl
    } finally {
      setLoadingQr((prev) => ({ ...prev, [productId]: false }))
    }
  }


  const handleDownload = async (product) => {
    const id = product.id || product.ProductID
    const name = (product.name || product.ProductName || id || 'product').replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, '_')
    let dataUrl = qrCache[id]
    if (!dataUrl) {
      try {
        dataUrl = await loadQr(id)
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'สร้าง QR ไม่สำเร็จ', text: e.message })
        return
      }
    }
    if (dataUrl) {
      downloadQrImage(dataUrl, `qr-${name}-${id}.png`)
      Swal.fire({ icon: 'success', title: 'ดาวน์โหลดแล้ว', timer: 1200, showConfirmButton: false, toast: true, position: 'top-end' })
    }
  }

  const filteredProducts = searchTerm.trim()
    ? products.filter((p) => {
        const id = (p.id || p.ProductID || '').toString().toLowerCase()
        const name = (p.name || p.ProductName || '').toString().toLowerCase()
        const term = searchTerm.trim().toLowerCase()
        return id.includes(term) || name.includes(term)
      })
    : products

  if (loading && products.length === 0) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => navigate('/admin/stock')}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
                title="กลับจัดการสต็อก"
              >
                <Icon icon="fa-arrow-left" className="text-xl" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">QR Code รายการสินค้า</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              ดาวน์โหลดรูป QR แต่ละรายการเพื่อใช้แสกนในขั้นตอนแพ็กสินค้า หรือพิมพ์ติดสินค้า
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="รหัสสินค้า หรือชื่อสินค้า..."
                className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredProducts.map((product) => {
                const id = product.id || product.ProductID
                const name = product.name || product.ProductName || id
                const dataUrl = qrCache[id]
                const isLoading = loadingQr[id]
                return (
                  <div
                    key={id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center shadow-sm hover:shadow-md transition"
                  >
                    <div className="w-28 h-28 flex items-center justify-center bg-gray-50 rounded-lg mb-2 overflow-hidden">
                      {dataUrl ? (
                        <img src={dataUrl} alt={id} className="w-full h-full object-contain" />
                      ) : isLoading ? (
                        <Icon icon="fa-spinner" className="text-2xl text-gray-400 animate-spin" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => loadQr(id)}
                          className="text-xs text-amber-600 hover:underline"
                        >
                          โหลด QR
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-bold text-gray-800 truncate w-full text-center" title={name}>{name}</p>
                    <p className="text-xs text-gray-500 mb-2 truncate w-full text-center">{id}</p>
                    <button
                      type="button"
                      onClick={() => handleDownload(product)}
                      disabled={!dataUrl}
                      className="mt-auto w-full py-2 px-3 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                      <Icon icon="fa-download" />
                      ดาวน์โหลด
                    </button>
                  </div>
                )
              })}
            </div>

            {products.length === 0 && !searchTerm.trim() && (
              <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-dashed">
                <Icon icon="fa-qrcode" className="text-5xl mb-4 opacity-50" />
                <p>ยังไม่มีรายการสินค้า</p>
                <button
                  onClick={() => navigate('/admin/stock')}
                  className="mt-4 text-emerald-600 hover:underline font-medium"
                >
                  ไปเพิ่มสินค้าในจัดการสต็อก
                </button>
              </div>
            )}

            {products.length > 0 && searchTerm.trim() && filteredProducts.length === 0 && (
              <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-dashed col-span-full">
                <Icon icon="fa-search" className="text-5xl mb-4 opacity-50" />
                <p>ไม่พบรายการที่ตรงกับ &quot;{searchTerm.trim()}&quot;</p>
                <button type="button" onClick={() => setSearchTerm('')} className="mt-4 text-amber-600 hover:underline font-medium">
                  ล้างคำค้น
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
