import { useState, useEffect } from 'react'
import { useOrders } from '../hooks/useOrders'
import { orderService } from '../services/orderService'
import { taxInvoiceService } from '../services/taxInvoiceService'
import { printService } from '../services/printService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function TaxInvoice({ user }) {
  const { orders, loading: ordersLoading } = useOrders(user)
  const [taxInvoices, setTaxInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [orderMap, setOrderMap] = useState({}) // Map orderId to order data

  useEffect(() => {
    if (user?.email) {
      fetchTaxInvoices()
      fetchOrdersForTaxInvoices()
    }
  }, [user])

  const fetchTaxInvoices = async () => {
    setLoading(true)
    try {
      const result = await taxInvoiceService.getUserTaxInvoices(user.email)
      if (result.success) {
        setTaxInvoices(result.invoices || [])
      } else {
        console.error('Error fetching tax invoices:', result.message)
        setTaxInvoices([])
      }
    } catch (error) {
      console.error('Error fetching tax invoices:', error)
      setTaxInvoices([])
    } finally {
      setLoading(false)
    }
  }

  const fetchOrdersForTaxInvoices = async () => {
    try {
      const userOrders = await orderService.getUserOrders(user.email)
      const orderMapObj = {}
      userOrders.forEach(order => {
        const orderId = order.ID || order.OrderID || order.id
        if (orderId) {
          orderMapObj[orderId] = order
        }
      })
      setOrderMap(orderMapObj)
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  const handlePrintTaxInvoice = async (taxInvoice) => {
    // Check if already printed
    if (taxInvoice.printCount > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'พิมพ์แล้ว',
        text: 'ใบกำกับภาษีนี้ได้ถูกพิมพ์ไปแล้ว ไม่สามารถพิมพ์ซ้ำได้',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    // Get order data
    const order = orderMap[taxInvoice.orderId]
    if (!order) {
      Swal.fire({
        icon: 'error',
        title: 'ไม่พบข้อมูลออเดอร์',
        text: 'ไม่สามารถพิมพ์ใบกำกับภาษีได้ เนื่องจากไม่พบข้อมูลออเดอร์'
      })
      return
    }

    try {
      Swal.fire({ title: 'กำลังเตรียมพิมพ์...', didOpen: () => Swal.showLoading() })
      
      // Prepare tax data
      const taxData = {
        taxName: taxInvoice.taxName,
        taxId: taxInvoice.taxId,
        taxAddress: taxInvoice.taxAddress,
        customerPhone: '', // Will be fetched in printService
        items: taxInvoice.items,
        discount: taxInvoice.discount,
        shipping: taxInvoice.shipping,
        invoiceDate: taxInvoice.invoiceDate || new Date()
      }

      // Print tax invoice
      await printService.printTaxInvoice(order, taxData)

      // Increment print count
      await taxInvoiceService.incrementPrintCount(taxInvoice.orderId, user.email)

      // Refresh tax invoices list
      await fetchTaxInvoices()

      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'พิมพ์สำเร็จ',
        text: 'ใบกำกับภาษีได้ถูกพิมพ์เรียบร้อยแล้ว',
        timer: 2000,
        showConfirmButton: false
      })
    } catch (error) {
      Swal.close()
      console.error('Error printing tax invoice:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถพิมพ์ใบกำกับภาษีได้'
      })
    }
  }

  const handlePrintReceipt = async (taxInvoice) => {
    const order = orderMap[taxInvoice.orderId]
    if (!order) {
      Swal.fire({
        icon: 'error',
        title: 'ไม่พบข้อมูลออเดอร์',
        text: 'ไม่สามารถพิมพ์ใบเสร็จได้'
      })
      return
    }

    try {
      await printService.printReceipt(order)
    } catch (error) {
      console.error('Error printing receipt:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถพิมพ์ใบเสร็จได้'
      })
    }
  }

  if (ordersLoading || loading) {
    return <LoadingSpinner />
  }

  const hasLeftSidebar = user?.role === 'admin' || user?.userType === 'franchise' || user?.customerType === 'franchise'

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        {hasLeftSidebar && <Sidebar user={user} />}
        <div className={`flex-1 ${hasLeftSidebar ? 'ml-0 md:ml-64' : ''} p-6 pt-20`}>
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">ใบกำกับภาษี</h1>
              <p className="text-gray-600">รายการใบกำกับภาษีที่บันทึกไว้แล้ว</p>
            </div>

            {/* Tax Invoices List */}
            <div>
          {taxInvoices.length === 0 ? (
            <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
              <Icon icon="fa-file-invoice" className="text-5xl mb-4 opacity-50" />
              <p className="text-lg mb-2">ยังไม่มีใบกำกับภาษี</p>
              <p className="text-sm">ใบกำกับภาษีจะแสดงที่นี่หลังจากที่แอดมินบันทึกข้อมูล</p>
            </div>
          ) : (
            <div className="space-y-4">
              {taxInvoices.map((taxInvoice) => {
                const order = orderMap[taxInvoice.orderId]
                const isPrinted = taxInvoice.printCount > 0
                const invoiceDate = taxInvoice.invoiceDate 
                  ? new Date(taxInvoice.invoiceDate).toLocaleDateString('th-TH', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })
                  : '-'

                return (
                  <div key={taxInvoice.orderId} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg uppercase mb-1">
                          {taxInvoice.orderId}
                        </h3>
                        <p className="text-sm text-gray-500">
                          วันที่บันทึก: {invoiceDate}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isPrinted ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                            พิมพ์แล้ว ({taxInvoice.printCount} ครั้ง)
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                            ยังไม่พิมพ์
                          </span>
                        )}
                        {order && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                            {order.Status || 'จัดส่งแล้ว'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tax Info */}
                    <div className="bg-gray-50 p-4 rounded-lg mb-4">
                      <h4 className="font-semibold text-gray-700 mb-2">ข้อมูลผู้เสียภาษี</h4>
                      <div className="space-y-1 text-sm">
                        <p><strong>ชื่อ:</strong> {taxInvoice.taxName || '-'}</p>
                        <p><strong>เลขประจำตัวผู้เสียภาษี:</strong> {taxInvoice.taxId || '-'}</p>
                        <p><strong>ที่อยู่:</strong> {taxInvoice.taxAddress || '-'}</p>
                      </div>
                    </div>

                    {/* Order Summary */}
                    {order && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 mb-1">
                          {taxInvoice.items?.length || 0} รายการ
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">ยอดรวม:</span>
                          <span className="text-xl font-bold text-emerald-600">
                            ฿{Number(taxInvoice.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrintTaxInvoice(taxInvoice)}
                        disabled={isPrinted}
                        className={`flex-1 py-3 rounded-lg font-bold transition text-sm ${
                          isPrinted
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                        }`}
                      >
                        <Icon icon="fa-print" className="mr-1" />
                        {isPrinted ? 'พิมพ์แล้ว' : 'พิมพ์ใบกำกับภาษี'}
                      </button>
                      {order && (
                        <button
                          onClick={() => handlePrintReceipt(taxInvoice)}
                          className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition text-sm"
                        >
                          <Icon icon="fa-receipt" className="mr-1" />
                          พิมพ์ใบเสร็จ
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}
