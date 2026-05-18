import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { poService } from '../services/poService'
import { franchiseStockService } from '../services/franchiseStockService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

/** หนี global print CSS ที่ซ่อน #root — เติมเนื้อหาใน #print-section (นอก React root) แล้วค่อยพิมพ์ */
function escapeHtmlForPrint(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function printFranchisePOToPrintSection(po) {
  const section = document.getElementById('print-section')
  if (!section) {
    window.print()
    return
  }
  const items = po?.items || []
  const rows = items
    .map((item, i) => {
      const pid = item.productid || item.productId || item.product_id || '-'
      const name = item.productname || item.productName || ''
      const qty = item.qtyordered || item.qty || 0
      const price = Number(item.priceperunit || item.price || 0)
      const sub = Number(item.subtotal || price * qty || 0)
      return `<tr>
        <td style="border:1px solid #ccc;padding:8px">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:8px">${escapeHtmlForPrint(pid)}</td>
        <td style="border:1px solid #ccc;padding:8px">${escapeHtmlForPrint(name)}</td>
        <td style="border:1px solid #ccc;padding:8px;text-align:center">${qty}</td>
        <td style="border:1px solid #ccc;padding:8px;text-align:right">฿${price.toLocaleString()}</td>
        <td style="border:1px solid #ccc;padding:8px;text-align:right">฿${sub.toLocaleString()}</td>
      </tr>`
    })
    .join('')
  const total = Number(po.totalamount || po.TotalAmount || 0)
  const supplier = po.supplier || po.Supplier || '-'
  const poid = po.poid || po.POID || ''
  const notes = po.notes || po.Notes || ''
  const created = new Date(po.createddate || po.CreatedDate || po.created_at || Date.now()).toLocaleString('th-TH')
  section.innerHTML = `
    <div class="po-print" style="padding:16px;font-family:Sarabun,Prompt,sans-serif;color:#111;max-width:800px;margin:0 auto">
      <h1 style="font-size:20px;margin:0 0 12px">ใบสั่งซื้อ (PO)</h1>
      <p style="margin:4px 0"><strong>เลขที่:</strong> ${escapeHtmlForPrint(poid)}</p>
      <p style="margin:4px 0"><strong>ซัพพลายเออร์:</strong> ${escapeHtmlForPrint(supplier)}</p>
      <p style="margin:4px 0"><strong>วันที่:</strong> ${escapeHtmlForPrint(created)}</p>
      ${notes ? `<p style="margin:4px 0"><strong>หมายเหตุ:</strong> ${escapeHtmlForPrint(notes)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="border:1px solid #ccc;padding:8px;text-align:left">#</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:left">รหัสสินค้า</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:left">ชื่อสินค้า</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:center">จำนวน</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:right">ราคา/หน่วย</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:right">รวม</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="border:1px solid #ccc;padding:8px">ไม่มีรายการสินค้า</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="border:1px solid #ccc;padding:8px;text-align:right;font-weight:bold">รวมทั้งหมด</td>
            <td style="border:1px solid #ccc;padding:8px;text-align:right;font-weight:bold">฿${total.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `
  const cleanup = () => {
    section.innerHTML = ''
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  setTimeout(cleanup, 800)
}

export default function FranchisePurchaseOrder({ user }) {
  const navigate = useNavigate()
  const [branchId, setBranchId] = useState(null)
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [isPODetailModalOpen, setIsPODetailModalOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState(null)
  const [isReceivePOModalOpen, setIsReceivePOModalOpen] = useState(false)
  const [receivedItems, setReceivedItems] = useState([])

  useEffect(() => {
    let mounted = true
    franchiseStockService.getBranchId(user?.email, user).then((id) => {
      if (mounted) setBranchId(id)
    })
    return () => { mounted = false }
  }, [user])

  useEffect(() => {
    if (user) fetchPOs()
  }, [user])

  useEffect(() => {
    setStatusFilter((prev) =>
      ['รอชำระเงิน', 'รออนุมัติ', 'อนุมัติแล้ว'].includes(prev) ? 'All' : prev
    )
  }, [])

  const fetchPOs = async () => {
    setLoading(true)
    try {
      const data = await poService.getAllPOs(user)
      setPurchaseOrders(data)
    } catch (error) {
      console.error('Error fetching POs:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูล PO ได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = async (po) => {
    try {
      Swal.fire({
        title: 'กำลังโหลด...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const poDetail = await poService.getPO(po.poid)
      Swal.close()

      if (!poDetail) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูล PO',
          text: 'ไม่สามารถดึงข้อมูล PO ได้'
        })
        return
      }

      setSelectedPO(poDetail)
      setIsPODetailModalOpen(true)
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูล PO ได้'
      })
    }
  }

  const handleDeletePO = async (po) => {
    const poId = po.poid || po.POID
    const { isConfirmed } = await Swal.fire({
      title: 'ยืนยันการลบ',
      html: `ต้องการยกเลิก PO <strong>${poId}</strong> หรือไม่?<br/><span class="text-sm text-gray-500">(เฉพาะรายการที่ยังไม่ได้กดรับเท่านั้นที่ลบได้)</span>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626'
    })
    if (!isConfirmed) return
    try {
      await poService.cancelPO(poId)
      Swal.fire({ icon: 'success', title: 'ยกเลิก PO เรียบร้อย', text: `PO ${poId} ถูกยกเลิกแล้ว` })
      fetchPOs()
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'ลบไม่สำเร็จ',
        text: error.message || 'ไม่สามารถยกเลิก PO ได้'
      })
    }
  }

  const handleSendOrder = async (po) => {
    const { isConfirmed } = await Swal.fire({
      title: 'ส่งออเดอร์',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการส่ง PO <strong>${po.poid}</strong> เป็นออเดอร์หรือไม่?</p>
          <p class="text-sm text-gray-600 mb-2">ระบบจะสร้างออเดอร์และนำคุณไปยังหน้าชำระเงิน</p>
          <p class="text-sm text-orange-600">หมายเหตุ: จำนวนสินค้าจะถูกตรวจสอบกับสต็อกสินค้าหลัก</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ส่งออเดอร์',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a'
    })

    if (!isConfirmed) return

    try {
      Swal.fire({
        title: 'กำลังส่งออเดอร์...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const result = await poService.convertPOToOrder(po.poid, user.email, user)

      Swal.close()
      
      // Store order data in sessionStorage for checkout
      sessionStorage.setItem('poOrderData', JSON.stringify({
        orderId: result.orderId,
        items: result.orderItems,
        totalAmount: result.totalAmount,
        fromPO: true,
        poId: po.poid
      }))

      Swal.fire({
        icon: 'success',
        title: 'ส่งออเดอร์สำเร็จ',
        text: 'กำลังนำคุณไปยังหน้าชำระเงิน',
        timer: 1500,
        showConfirmButton: false
      }).then(() => {
        navigate('/checkout')
      })
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถส่งออเดอร์ได้'
      })
    }
  }

  const handlePrintBill = async (po) => {
    const items = po?.items || []
    if (items.length > 0) {
      printFranchisePOToPrintSection(po)
      return
    }
    try {
      Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const poDetail = await poService.getPO(po.poid)
      Swal.close()
      if (poDetail) printFranchisePOToPrintSection(poDetail)
      else Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล PO' })
    } catch (e) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'โหลดไม่สำเร็จ', text: e.message || '' })
    }
  }

  const handleReceivePO = async (po) => {
    try {
      Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const poDetail = await poService.getPO(po.poid)
      Swal.close()
      if (!poDetail) {
        Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล PO', text: 'ไม่สามารถดึงข้อมูล PO ได้' })
        return
      }
      const initialReceivedItems = (poDetail.items || []).map(item => {
        const alreadyReceived = Number(item.receivedqty || 0)
        const remainingToReceive = Math.max(0, (item.qtyordered || 0) - alreadyReceived)
        return {
          productId: item.productid,
          productName: item.productname,
          orderedQty: item.qtyordered || 0,
          alreadyReceived,
          receivedQty: 0,
          remainingQty: remainingToReceive,
          price: item.priceperunit || 0,
          unit: 'ชิ้น'
        }
      })
      setSelectedPO(poDetail)
      setReceivedItems(initialReceivedItems)
      setIsReceivePOModalOpen(true)
    } catch (error) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message || 'ไม่สามารถดึงข้อมูล PO ได้' })
    }
  }

  const handleReceivedQtyChange = (productId, value) => {
    const numValue = typeof value === 'string' ? (value === '' || value === '0' ? 0 : parseInt(value) || 0) : (value || 0)
    setReceivedItems(prev => prev.map(item => {
      if (item.productId !== productId) return item
      if (item.remainingQty === 0) return item
      const maxQty = item.remainingQty ?? item.orderedQty
      return { ...item, receivedQty: Math.max(0, Math.min(numValue, maxQty)) }
    }))
  }

  const handleReceivedQtyDelta = (productId, delta) => {
    setReceivedItems(prev => prev.map(item => {
      if (item.productId !== productId) return item
      if (item.remainingQty === 0) return item
      const maxQty = item.remainingQty ?? item.orderedQty
      return { ...item, receivedQty: Math.max(0, Math.min(item.receivedQty + delta, maxQty)) }
    }))
  }

  const confirmReceivePO = async () => {
    if (!selectedPO || !branchId || !receivedItems?.length) return
    const hasReceived = receivedItems.some(item => item.receivedQty > 0)
    if (!hasReceived) {
      Swal.fire({ icon: 'warning', title: 'กรุณาระบุจำนวนที่ได้รับ', text: 'กรุณาระบุจำนวนสินค้าที่ได้รับอย่างน้อย 1 รายการ' })
      return
    }
    const itemsToReceive = receivedItems.filter(item => item.receivedQty > 0)
    const itemsNotReceived = receivedItems.filter(item => item.receivedQty === 0 && item.remainingQty > 0)
    const { isConfirmed } = await Swal.fire({
      title: 'ยืนยันการรับสินค้า',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการรับสินค้าจาก PO <strong>${selectedPO.poid}</strong> เข้าสต็อกสาขาหรือไม่?</p>
          <p class="text-sm text-gray-600 mb-2">จะรับสินค้า <strong>${itemsToReceive.length}</strong> รายการ</p>
          ${itemsNotReceived.length > 0 ? `<p class="text-sm text-orange-600 mb-2">สินค้าที่ยังไม่ได้รับ (${itemsNotReceived.length} รายการ) จะคงค้างใน PO</p>` : ''}
          <p class="text-sm text-gray-600">ระบบจะอัปเดตสต็อกสาขาอัตโนมัติ</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a'
    })
    if (!isConfirmed) return
    try {
      Swal.fire({ title: 'กำลังรับสินค้า...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const receivedItemsData = itemsToReceive.map(item => ({
        productId: item.productId,
        receivedQty: item.receivedQty || 0,
        productName: item.productName,
        unit: item.unit
      }))
      await poService.receivePOFranchise(selectedPO.poid, receivedItemsData, branchId, user.email)
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: itemsNotReceived.length > 0 ? `รับสินค้า ${itemsToReceive.length} รายการเรียบร้อย` : 'รับสินค้าและอัปเดตสต็อกสาขาเรียบร้อย',
        timer: 2000,
        showConfirmButton: false
      })
      setIsReceivePOModalOpen(false)
      setSelectedPO(null)
      setReceivedItems([])
      fetchPOs()
    } catch (error) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message || 'ไม่สามารถรับสินค้าได้' })
    }
  }

  const filteredPOs = useMemo(() => {
    let filtered = purchaseOrders

    // หน้าแฟรนไชส์ไม่มีแท็บกรอง รอชำระเงิน / รออนุมัติ / อนุมัติแล้ว — ถ้า state ค้างมาจากเวอร์ชันเก่าให้ถือเป็น All
    const sf = ['รอชำระเงิน', 'รออนุมัติ', 'อนุมัติแล้ว'].includes(statusFilter) ? 'All' : statusFilter
    if (sf !== 'All') {
      filtered = filtered.filter(po => {
        const status = po.status || po.Status || ''
        if (sf === 'รับแล้ว') {
          return status === 'รับแล้ว' || status === 'รับบางส่วน'
        }
        return status === sf
      })
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(po => {
        const poId = (po.poid || po.POID || '').toLowerCase()
        const supplier = (po.supplier || po.Supplier || '').toLowerCase()
        const notes = (po.notes || po.Notes || '').toLowerCase()
        return poId.includes(searchLower) || supplier.includes(searchLower) || notes.includes(searchLower)
      })
    }

    // Sort by createddate (newest first)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.createddate || a.CreatedDate || a.created_at || 0)
      const dateB = new Date(b.createddate || b.CreatedDate || b.created_at || 0)
      return dateB - dateA
    })
  }, [purchaseOrders, statusFilter, searchTerm])

  const totalPOs = filteredPOs.length
  const totalAmount = filteredPOs.reduce((sum, po) => sum + (Number(po.totalamount || po.TotalAmount || 0)), 0)

  const getStatusBadge = (status) => {
    const statusValue = status || ''
    if (statusValue === 'รอส่งออเดอร์') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">รอส่งออเดอร์</span>
    }
    if (statusValue === 'รอชำระเงิน') {
      return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">รอชำระเงิน</span>
    }
    if (statusValue === 'รออนุมัติ') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">รออนุมัติ</span>
    }
    if (statusValue === 'อนุมัติแล้ว') {
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">อนุมัติแล้ว</span>
    }
    if (statusValue === 'รับบางส่วน') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">รับบางส่วน</span>
    }
    if (statusValue === 'รับแล้ว') {
      return <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">รับแล้ว</span>
    }
    if (statusValue === 'ยกเลิก') {
      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">ยกเลิก</span>
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-bold rounded-full">{statusValue}</span>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <Sidebar user={user} />
      <main className="ml-0 md:ml-64 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Purchase Order (PO)</h1>
            <div className="flex gap-2">
              <button
                onClick={fetchPOs}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2"
              >
                <Icon icon="fa-sync-alt" />
                Refresh
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1">
                <div className="relative">
                  <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ค้นหา PO ID, ซัพพลายเออร์, หรือหมายเหตุ..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Status Filters */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setStatusFilter('All')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  statusFilter === 'All'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('รอส่งออเดอร์')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  statusFilter === 'รอส่งออเดอร์'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                รอส่งออเดอร์
              </button>
              <button
                onClick={() => setStatusFilter('รับแล้ว')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  statusFilter === 'รับแล้ว'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                รับแล้ว
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-800 text-white rounded-lg p-6 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Icon icon="fa-building" className="text-3xl" />
              <div>
                <p className="text-sm text-gray-300">ส่วนกลาง</p>
                <p className="text-2xl font-bold">{totalPOs} PO</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-300">ยอดรวมทั้งหมด</p>
              <p className="text-3xl font-bold">฿{totalAmount.toLocaleString()}</p>
            </div>
          </div>

          {/* PO List */}
          {loading ? (
            <LoadingSpinner />
          ) : filteredPOs.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Icon icon="fa-box-open" className="text-5xl text-gray-300 mb-4" />
              <p className="text-gray-600">ไม่พบ PO</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPOs.map((po) => {
                const status = po.status || po.Status || ''
                const isOtherSupplier = !!(po.is_other_supplier ?? po.isothersupplier)
                const canSendOrder = !isOtherSupplier && status === 'รอส่งออเดอร์'
                const canReceive = isOtherSupplier && (status === 'รอส่งออเดอร์' || status === 'รับบางส่วน')
                const canDelete = status !== 'รับแล้ว' && status !== 'ยกเลิก'
                
                return (
                  <div key={po.poid || po.POID} className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold">{po.poid || po.POID}</h3>
                          {getStatusBadge(status)}
                          {isOtherSupplier && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">ซัพอื่นๆ (พิมพ์บิล/ซื้อเอง)</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          สร้างเมื่อ: {new Date(po.createddate || po.CreatedDate || po.created_at).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })} | โดย: {po.createdby || po.CreatedBy || ''}
                        </p>
                        {po.notes && (
                          <p className="text-sm text-gray-600 mb-2">
                            หมายเหตุ: {po.notes || po.Notes}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          ซัพพลายเออร์: {po.supplier || po.Supplier || 'ไม่ระบุ'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-emerald-600">
                            ฿{(Number(po.totalamount || po.TotalAmount || 0)).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {canSendOrder && (
                            <button
                              onClick={() => handleSendOrder(po)}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
                            >
                              <Icon icon="fa-paper-plane" />
                              ส่งออเดอร์
                            </button>
                          )}
                          {isOtherSupplier && (
                            <>
                              <button
                                onClick={() => handlePrintBill(po)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                              >
                                <Icon icon="fa-print" />
                                พิมพ์บิล
                              </button>
                              {canReceive && (
                                <button
                                  onClick={() => handleReceivePO(po)}
                                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                                >
                                  <Icon icon="fa-box-open" />
                                  รับสินค้า
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handleViewDetails(po)}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2"
                          >
                            <Icon icon="fa-eye" />
                            ดูรายละเอียด
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDeletePO(po)}
                              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition flex items-center gap-2"
                            >
                              <Icon icon="fa-trash-alt" />
                              ลบ
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* PO Detail Modal */}
      {isPODetailModalOpen && selectedPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold">รายละเอียด PO: {selectedPO.poid || selectedPO.POID}</h2>
              <button
                onClick={() => {
                  setIsPODetailModalOpen(false)
                  setSelectedPO(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <Icon icon="fa-times" className="text-2xl" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">ซัพพลายเออร์</p>
                    <p className="font-bold">{selectedPO.supplier || selectedPO.Supplier || 'ไม่ระบุ'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">สถานะ</p>
                    <div className="mt-1">{getStatusBadge(selectedPO.status || selectedPO.Status)}</div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">ยอดรวม</p>
                    <p className="font-bold text-emerald-600">฿{(Number(selectedPO.totalamount || selectedPO.TotalAmount || 0)).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">สร้างเมื่อ</p>
                    <p className="font-bold">
                      {new Date(selectedPO.createddate || selectedPO.CreatedDate || selectedPO.created_at).toLocaleString('th-TH')}
                    </p>
                  </div>
                </div>
                {selectedPO.notes && (
                  <div>
                    <p className="text-sm text-gray-600">หมายเหตุ</p>
                    <p className="font-bold">{selectedPO.notes || selectedPO.Notes}</p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-bold mb-4">รายการสินค้า</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-2 text-left">#</th>
                        <th className="px-4 py-2 text-left">รหัสสินค้า</th>
                        <th className="px-4 py-2 text-left">ชื่อสินค้า</th>
                        <th className="px-4 py-2 text-center">จำนวน</th>
                        <th className="px-4 py-2 text-right">ราคา/หน่วย</th>
                        <th className="px-4 py-2 text-right">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedPO.items || []).map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-2">{index + 1}</td>
                          <td className="px-4 py-2 font-mono text-sm text-gray-700">{item.productid || item.productId || item.product_id || '-'}</td>
                          <td className="px-4 py-2">{item.productname || item.productName}</td>
                          <td className="px-4 py-2 text-center">{item.qtyordered || item.qty || 0}</td>
                          <td className="px-4 py-2 text-right">฿{(Number(item.priceperunit || item.price || 0)).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right">฿{(Number(item.subtotal || (item.priceperunit || item.price) * (item.qtyordered || item.qty) || 0)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold">
                        <td colSpan="5" className="px-4 py-2 text-right">รวมทั้งหมด</td>
                        <td className="px-4 py-2 text-right">฿{(Number(selectedPO.totalamount || selectedPO.TotalAmount || 0)).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              {(selectedPO.is_other_supplier || selectedPO.isothersupplier) && (
                <button
                  type="button"
                  onClick={() => printFranchisePOToPrintSection(selectedPO)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <Icon icon="fa-print" />
                  พิมพ์บิล
                </button>
              )}
              <button
                onClick={() => {
                  setIsPODetailModalOpen(false)
                  setSelectedPO(null)
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive PO Modal (ซัพอื่นๆ - รับเข้าสต็อกสาขาทีละรายการ) */}
      {isReceivePOModalOpen && selectedPO && selectedPO.items?.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">รับสินค้า {selectedPO.poid}</h2>
                <button
                  onClick={() => {
                    setIsReceivePOModalOpen(false)
                    setSelectedPO(null)
                    setReceivedItems([])
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <p><strong>ซัพพลายเออร์:</strong> {selectedPO.supplier}</p>
                  <p><strong>ยอดรวม:</strong> ฿{Number(selectedPO.totalamount || 0).toLocaleString()}</p>
                </div>
                <div className="border-t pt-4">
                  <h3 className="font-bold text-gray-700 mb-3">ระบุจำนวนสินค้าที่ได้รับ</h3>
                  <div className="space-y-3">
                    {receivedItems.map((item, idx) => {
                      const totalReceived = (item.alreadyReceived || 0) + item.receivedQty
                      const maxQty = item.remainingQty ?? item.orderedQty
                      const isFullyReceived = totalReceived >= item.orderedQty
                      const isNotReceived = item.receivedQty === 0 && (item.alreadyReceived || 0) === 0
                      const isPartialReceived = item.receivedQty > 0 && totalReceived < item.orderedQty
                      return (
                        <div key={idx} className={`p-4 rounded-lg border-2 ${
                          isFullyReceived ? 'bg-green-50 border-green-200' :
                          isNotReceived ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-200'
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">{item.productName}</div>
                              <div className="text-sm text-gray-600 mt-1">
                                สั่ง: <span className="font-bold">{item.orderedQty}</span> {item.unit || 'ชิ้น'}
                                {item.alreadyReceived > 0 && (
                                  <span className="ml-2 text-green-600 font-bold">(รับแล้ว: {item.alreadyReceived} {item.unit || 'ชิ้น'})</span>
                                )}
                              </div>
                              {item.remainingQty > 0 && (
                                <div className="text-xs text-orange-600 mt-1 font-bold">คงเหลือที่ต้องรับ: {item.remainingQty} {item.unit || 'ชิ้น'}</div>
                              )}
                              {item.remainingQty === 0 && item.alreadyReceived > 0 && (
                                <div className="text-xs text-green-600 mt-1 font-bold">✓ รับครบแล้ว</div>
                              )}
                            </div>
                            {isFullyReceived && <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">รับครบ</span>}
                            {isNotReceived && <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">ยังไม่ได้รับ</span>}
                            {isPartialReceived && <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">รับบางส่วน</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            <label className="text-sm font-bold text-gray-700 whitespace-nowrap">รับจริง:</label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleReceivedQtyDelta(item.productId, -1)}
                                className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 transition flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={item.receivedQty <= 0 || item.remainingQty === 0}
                              >
                                <Icon icon="fa-minus" className="text-xs" />
                              </button>
                              <input
                                type="text"
                                maxLength={10}
                                value={item.receivedQty === 0 ? '' : item.receivedQty}
                                onChange={(e) => {
                                  const val = e.target.value
                                  if (val === '' || val === '0') handleReceivedQtyChange(item.productId, 0)
                                  else if (/^\d+$/.test(val)) handleReceivedQtyChange(item.productId, val)
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value
                                  const numVal = val === '' || val === '0' ? 0 : (parseInt(val) || 0)
                                  if (numVal !== (item.receivedQty || 0)) handleReceivedQtyChange(item.productId, numVal)
                                }}
                                disabled={item.remainingQty === 0}
                                className="w-24 px-2 py-2 border-2 border-emerald-500 rounded text-center font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300"
                                placeholder="0"
                              />
                              <button
                                onClick={() => handleReceivedQtyDelta(item.productId, 1)}
                                className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 transition flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={item.receivedQty >= maxQty || item.remainingQty === 0}
                              >
                                <Icon icon="fa-plus" className="text-xs" />
                              </button>
                              <span className="text-sm text-gray-600">/ {maxQty} {item.unit || 'ชิ้น'}</span>
                            </div>
                            {item.remainingQty > 0 && item.receivedQty < maxQty && (
                              <button
                                onClick={() => handleReceivedQtyChange(item.productId, maxQty)}
                                className="ml-auto px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200 transition"
                              >
                                รับครบ ({maxQty} {item.unit || 'ชิ้น'})
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <Icon icon="fa-info-circle" className="mr-2" />
                    คุณสามารถรับสินค้าบางรายการได้ สินค้าที่ยังไม่ได้รับจะคงค้างใน PO จนกว่าจะรับครบ ระบบจะเพิ่มเข้าสต็อกสาขาอัตโนมัติ
                  </p>
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={confirmReceivePO}
                    className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition flex items-center justify-center gap-2"
                  >
                    <Icon icon="fa-check" />
                    ยืนยันการรับสินค้า
                  </button>
                  <button
                    onClick={() => {
                      setIsReceivePOModalOpen(false)
                      setSelectedPO(null)
                      setReceivedItems([])
                    }}
                    className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
