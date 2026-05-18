import { useState } from 'react'
import { supabase } from '../../utils/supabase'
import { productService } from '../../services/productService'
import { formatSelectedOptionsSummary } from '../../utils/helpers'
import { linePaidSubtotal, cartLineWeightGrams } from '../../utils/cartSupplierUtils'
import Icon from '../common/Icon'
import Swal from 'sweetalert2'

export default function Cart({
  cart,
  onUpdateQuantity,
  onRemove,
  onClose,
  onCheckout,
  onReconfigureBundle,
  user
}) {
  const lineId = (item) => item.cartLineId || item.id
  const getTotal = () => {
    return cart.reduce((sum, item) => sum + linePaidSubtotal(item), 0)
  }

  const getTotalWeight = () => {
    return cart.reduce((sum, item) => sum + cartLineWeightGrams(item), 0)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-end">
      <div className="bg-white w-full max-h-[85vh] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden mb-20">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">ตะกร้าสินค้า</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700"
          >
            <Icon icon="fa-times" className="text-xl" />
          </button>
        </div>

        {/* Cart Items - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Icon icon="fa-shopping-cart" className="text-5xl mb-4 opacity-50" />
              <p>ตะกร้าว่าง</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={lineId(item)} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{item.name}</h3>
                  {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                    <p className="text-[11px] text-emerald-800 font-semibold mb-1">
                      {formatSelectedOptionsSummary(item.selectedOptions)}
                    </p>
                  )}
                  {item.bundleSelectionSummary ? (
                    <p className="text-[11px] text-amber-900 font-semibold mb-1">{item.bundleSelectionSummary}</p>
                  ) : null}
                  <p className="text-xs text-gray-500 mb-1">
                    {item.bundleFlexible
                      ? `฿${item.price.toLocaleString()} ต่อ 1 รอบ (ขั้นตอน ${Math.max(1, item.orderStep || 1)} หน่วยหลัก)`
                      : `฿${item.price.toLocaleString()} ต่อ ${item.unit || 'ชิ้น'}`}
                  </p>
                  <p className="text-emerald-600 font-bold text-base">
                    ฿{linePaidSubtotal(item).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {item.bundleFlexible ? (
                      <span className="text-amber-900">ชุดกำหนดจำนวนเอง</span>
                    ) : (
                      <>
                        จำนวน: {item.qty} {item.unit || 'ชิ้น'}
                        {item.stock !== undefined && (
                          <span className={`ml-2 ${item.qty > item.stock ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                            (สต็อก: {item.stock} {item.unit || 'ชิ้น'})
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.bundleFlexible
                    ? (
                      <button
                        onClick={() => {
                          if (typeof onReconfigureBundle === 'function') onReconfigureBundle(item)
                        }}
                        className="px-2 h-8 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-bold"
                      >
                        ปรับชุด
                      </button>
                    )
                    : (() => {
                    const step = Math.max(1, item.orderStep || 1)
                    const maxQty = item.stock !== undefined ? Math.floor(item.stock / step) * step : undefined
                    return (
                      <>
                        <button
                          onClick={() => {
                            if (item.qty > step) {
                              onUpdateQuantity(lineId(item), item.qty - step)
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={item.qty <= step}
                        >
                          <Icon icon="fa-minus" className="text-xs" />
                        </button>
                        <input
                          type="number"
                          min={step}
                          step={step}
                          max={maxQty}
                          value={item.qty}
                          onChange={(e) => {
                            const raw = parseInt(e.target.value, 10)
                            if (Number.isNaN(raw)) return
                            const rounded = Math.round(raw / step) * step
                            const newQty = Math.max(step, rounded)
                            if (item.stock !== undefined && newQty > item.stock) {
                              Swal.fire({
                                icon: 'warning',
                                title: 'เกินสต็อก',
                                text: `สินค้านี้มีสต็อกเพียง ${item.stock} ${item.unit || 'ชิ้น'} เท่านั้น`,
                                confirmButtonText: 'ตกลง'
                              })
                              return
                            }
                            onUpdateQuantity(lineId(item), newQty)
                          }}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value, 10)
                            if (Number.isNaN(value) || value < step) {
                              onUpdateQuantity(lineId(item), step)
                              return
                            }
                            const rounded = Math.round(value / step) * step
                            onUpdateQuantity(lineId(item), rounded < step ? step : rounded)
                          }}
                          className="w-14 h-8 text-center font-bold border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        <button
                          onClick={async () => {
                            const nextQty = item.qty + step
                            try {
                              const product = await productService.getProduct(item.id)
                              if (!product) {
                                Swal.fire({
                                  icon: 'error',
                                  title: 'ไม่พบสินค้า',
                                  text: 'ไม่สามารถเพิ่มจำนวนได้'
                                })
                                return
                              }
                              const currentStock = product.stock || 0
                              if (nextQty > currentStock) {
                                Swal.fire({
                                  icon: 'warning',
                                  title: 'เกินสต็อก',
                                  text: `สินค้านี้มีสต็อกเพียง ${currentStock} ${item.unit || 'ชิ้น'} เท่านั้น (สั่งได้ทีละ ${step})`,
                                  confirmButtonText: 'ตกลง'
                                })
                                return
                              }
                              onUpdateQuantity(lineId(item), nextQty)
                            } catch (error) {
                              console.error('Error checking stock:', error)
                              Swal.fire({
                                icon: 'error',
                                title: 'เกิดข้อผิดพลาด',
                                text: 'ไม่สามารถตรวจสอบสต็อกได้'
                              })
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition"
                        >
                          <Icon icon="fa-plus" className="text-xs" />
                        </button>
                      </>
                    )
                  })()}
                  <button
                    onClick={() => onRemove(lineId(item))}
                    className="ml-2 p-2 text-red-500 hover:text-red-700 transition"
                  >
                    <Icon icon="fa-trash" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer - Always show if cart has items */}
        {cart.length > 0 && (
          <div className="border-t-2 border-gray-300 p-4 space-y-3 bg-white flex-shrink-0 shadow-lg">
            <div className="flex justify-between text-gray-600 text-sm">
              <span>รวมน้ำหนัก:</span>
              <span className="font-bold">{getTotalWeight().toLocaleString()} กรัม</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>ยอดรวม:</span>
              <span className="text-emerald-600">฿{getTotal().toLocaleString()}</span>
            </div>
            <button
              onClick={() => {
                console.log('Checkout button clicked', { onCheckout: !!onCheckout, cartLength: cart.length })
                if (onCheckout) {
                  onCheckout()
                } else {
                  console.warn('onCheckout not provided, navigating directly')
                  window.location.href = '/checkout'
                }
              }}
              className="w-full bg-emerald-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-emerald-700 transition active:scale-95 shadow-lg mt-4 flex items-center justify-center gap-2"
              style={{ minHeight: '56px' }}
            >
              <Icon icon="fa-shopping-bag" />
              <span>ชำระเงิน / สั่งซื้อ</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
