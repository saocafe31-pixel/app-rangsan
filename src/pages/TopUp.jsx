import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const PROMPTPAY_ID = '0105567121929'
import { creditService } from '../services/creditService'
import { imageService } from '../services/imageService'
import { getFeaturesSettings } from '../services/shopSettingsService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { formatThaiDateTimeBangkok } from '../utils/dateDisplay'

export default function TopUp({ user, setUser }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [slipFile, setSlipFile] = useState(null)
  const [slipPreview, setSlipPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [creditBalance, setCreditBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [usageLog, setUsageLog] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [promptPayQrUrl, setPromptPayQrUrl] = useState(null)
  const [promptPayQrError, setPromptPayQrError] = useState(null)
  const qrLoadTimeoutRef = useRef(null)

  useEffect(() => {
    getFeaturesSettings().then((f) => {
      if (!f.showCreditTopUp) navigate('/home', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    if (user) {
      fetchCreditData()
      
      // Listen for credit update events
      const handleCreditUpdated = (event) => {
        // Refresh if event is for current user or no specific user
        if (!event.detail?.userEmail || event.detail.userEmail === user.email) {
          console.log('[TopUp] Credit updated event received, refreshing data...')
          fetchCreditData()
        }
      }
      
      // Refresh when tab becomes visible
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchCreditData()
        }
      }
      
      window.addEventListener('creditUpdated', handleCreditUpdated)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      
      return () => {
        window.removeEventListener('creditUpdated', handleCreditUpdated)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [user])

  const topUpAmount = parseFloat(amount) || 0

  useEffect(() => {
    if (topUpAmount <= 0) {
      setPromptPayQrUrl(null)
      setPromptPayQrError(null)
      if (qrLoadTimeoutRef.current) clearTimeout(qrLoadTimeoutRef.current)
      return
    }
    setPromptPayQrError(null)
    let cancelled = false
    qrLoadTimeoutRef.current = setTimeout(() => {
      if (!cancelled) setPromptPayQrError('โหลดนานเกินไป')
    }, 5000)
    Promise.all([
      import('promptpay-qr'),
      import('qrcode/lib/browser.js')
    ])
      .then(([ppModule, qrModule]) => {
        if (cancelled) return
        const generatePayload = ppModule.default || ppModule.generatePayload
        const qr = qrModule.default || qrModule
        if (typeof generatePayload !== 'function') {
          setPromptPayQrError('ไม่พบฟังก์ชันสร้าง QR')
          return
        }
        if (typeof qr?.toDataURL !== 'function') {
          setPromptPayQrError('ไลบรารี QR ไม่พร้อม')
          return
        }
        const amountNum = Number(topUpAmount.toFixed(2))
        const payload = generatePayload(PROMPTPAY_ID, { amount: amountNum })
        return qr.toDataURL(payload, { width: 280, margin: 2 })
      })
      .then((dataUrl) => {
        if (cancelled) return
        if (dataUrl) {
          setPromptPayQrUrl(dataUrl)
          setPromptPayQrError(null)
        } else {
          setPromptPayQrError('สร้าง QR ไม่สำเร็จ')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[TopUp] PromptPay QR error:', err)
          setPromptPayQrError('ไม่สามารถสร้าง QR ได้ (โอนเข้าบัญชีด้านล่างแทน)')
        }
      })
      .finally(() => {
        if (qrLoadTimeoutRef.current) {
          clearTimeout(qrLoadTimeoutRef.current)
          qrLoadTimeoutRef.current = null
        }
      })
    return () => {
      cancelled = true
      if (qrLoadTimeoutRef.current) clearTimeout(qrLoadTimeoutRef.current)
    }
  }, [topUpAmount])

  const fetchCreditData = async () => {
    try {
      setLoadingData(true)
      const [balance, userTransactions, creditUsage] = await Promise.all([
        creditService.getUserCredit(user.email),
        creditService.getUserCreditTransactions(user.email),
        creditService.getCreditUsageLog(user.email)
      ])
      setCreditBalance(balance.balance || 0)
      setTransactions(userTransactions || [])
      setUsageLog(creditUsage || [])
    } catch (error) {
      console.error('Error fetching credit data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleTopUp = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวนเงิน',
        text: 'จำนวนเงินต้องมากกว่า 0',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    if (!slipFile) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาแนบสลิปโอนเงิน',
        text: 'ต้องแนบสลิปโอนเงินเพื่อยืนยันการเติมเงิน',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    try {
      setLoading(true)

      Swal.fire({
        title: 'กำลังดำเนินการ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      await creditService.createCreditTransaction(
        user.email,
        parseFloat(amount),
        'transfer', // Always use transfer for top-up
        slipFile
      )

      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'ส่งคำขอเติมเงินสำเร็จ',
        text: 'รอการอนุมัติจากแอดมิน',
        confirmButtonText: 'ตกลง'
      })

      // Reset form
      setAmount('')
      setSlipFile(null)
      setSlipPreview(null)
      
      // Refresh data
      fetchCreditData()
    } catch (error) {
      Swal.close()
      console.error('Error creating credit transaction:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถส่งคำขอเติมเงินได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    const out = formatThaiDateTimeBangkok(dateStr)
    return out === '-' && dateStr ? String(dateStr) : out
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'approved':
        return 'อนุมัติแล้ว'
      case 'rejected':
        return 'ปฏิเสธ'
      case 'pending':
        return 'รออนุมัติ'
      default:
        return status
    }
  }

  if (loadingData) {
    return <LoadingSpinner />
  }

  const hasLeftSidebar = user?.role === 'admin' || user?.userType === 'franchise' || user?.customerType === 'franchise'

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <Sidebar user={user} />

      <div className={`max-w-4xl mx-auto px-4 py-6 ${hasLeftSidebar ? 'ml-0 md:ml-64 pt-16' : 'pt-4'}`}>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/home')}
            className="p-2 text-gray-600 hover:text-gray-900"
          >
            <Icon icon="fa-arrow-left" className="text-xl" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">เติมเงินเครดิต</h1>
        </div>

        {/* Credit Balance Card */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl shadow-lg p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm mb-1">ยอดเครดิตปัจจุบัน</p>
              <p className="text-3xl font-bold">{creditBalance.toLocaleString()} ฿</p>
            </div>
            <Icon icon="fa-wallet" className="text-5xl opacity-50" />
          </div>
        </div>

        {/* Top-up Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">เติมเงิน</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                จำนวนเงิน (บาท) *
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="ระบุจำนวนเงินที่ต้องการเติม"
              />
            </div>

            {/* Thai QR style card: แถบสีพร้อมเพย์ + QR หรือเลขบัญชี */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-[#1e3a8a] to-[#1d4ed8] px-5 py-3 flex justify-between items-center">
                <span className="text-white font-bold text-sm tracking-wide">พร้อมเพย์</span>
                <span className="text-white/90 text-xs">สแกนเพื่อชำระเงิน</span>
              </div>
              <div className="p-5">
                {topUpAmount <= 0 ? (
                  <>
                    <p className="text-sm text-gray-600 mb-3">กรุณาระบุจำนวนเงินด้านบนเพื่อสร้าง QR โอนเงิน</p>
                    <p className="text-xs text-gray-500 mb-3">หรือโอนเข้าบัญชีด้านล่าง:</p>
                    <div
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200 cursor-pointer hover:bg-gray-100"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText('189-2-88192-4')
                          Swal.fire({ icon: 'success', title: 'คัดลอกเลขบัญชีแล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                        } catch {
                          Swal.fire({ icon: 'error', title: 'กรุณาคัดลอกด้วยตนเอง: 189-2-88192-4' })
                        }
                      }}
                    >
                      <span className="font-mono font-bold">189-2-88192-4</span>
                      <Icon icon="fa-copy" className="text-gray-500" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">บจก. ไชยจันลา (KASIKORN BANK)</p>
                  </>
                ) : promptPayQrError ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-800">ยอดเติมเงิน</span>
                      <span className="text-lg font-bold text-emerald-600">฿{topUpAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-800 mb-3">{promptPayQrError}</p>
                      <p className="text-xs text-gray-600 mb-2">โอนเข้าบัญชีด้านล่างแทน:</p>
                      <div
                        className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200 cursor-pointer hover:bg-amber-50"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText('189-2-88192-4')
                            Swal.fire({ icon: 'success', title: 'คัดลอกเลขบัญชีแล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                          } catch {
                            Swal.fire({ icon: 'error', title: 'กรุณาคัดลอกด้วยตนเอง: 189-2-88192-4' })
                          }
                        }}
                      >
                        <span className="font-mono font-bold">189-2-88192-4</span>
                        <Icon icon="fa-copy" className="text-gray-500" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">บจก. ไชยจันลา (KASIKORN BANK)</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-gray-800">ยอดเติมเงิน</span>
                      <span className="text-lg font-bold text-emerald-600">฿{topUpAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">สแกน QR ด้วยแอปธนาคารหรือ e-Wallet เพื่อโอนตามยอดที่แสดง</p>
                    <div className="flex justify-center bg-gray-50 rounded-lg p-4">
                      {promptPayQrUrl ? (
                        <img src={promptPayQrUrl} alt="PromptPay QR Code" className="w-64 h-64 object-contain" />
                      ) : (
                        <div className="w-64 h-64 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                          <span>กำลังสร้าง QR...</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">PromptPay ID: {PROMPTPAY_ID}</p>
                    {promptPayQrUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const link = document.createElement('a')
                          link.download = `promptpay-topup-${topUpAmount.toFixed(0)}-baht.png`
                          link.href = promptPayQrUrl
                          link.click()
                          Swal.fire({ icon: 'success', title: 'บันทึกรูปแล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                        }}
                        className="mt-4 w-full py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 font-medium hover:bg-gray-50 hover:border-emerald-500 hover:text-emerald-700 transition flex items-center justify-center gap-2"
                      >
                        <Icon icon="fa-save" />
                        บันทึกรูปภาพ
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Upload Slip Section */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                สลิปโอนเงิน *
              </label>
              <div
                className="border-2 border-dashed border-gray-300 p-8 rounded-lg text-center bg-gray-50 cursor-pointer hover:border-emerald-500 transition-colors"
                onClick={() => document.getElementById('slip-input').click()}
              >
                <input
                  id="slip-input"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) {
                      setSlipFile(file)
                      // Create preview URL
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setSlipPreview(reader.result)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
                {slipFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-emerald-600 font-bold flex items-center gap-2">
                      <Icon icon="fa-check-circle" className="text-xl" />
                      <span>แนบสลิปแล้ว</span>
                    </div>
                    {slipPreview && (
                      <div className="relative w-full max-w-md">
                        <img
                          src={slipPreview}
                          alt="สลิปโอนเงิน"
                          className="w-full h-auto rounded-lg border-2 border-emerald-200 shadow-md max-h-64 object-contain bg-gray-50"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSlipFile(null)
                            setSlipPreview(null)
                            document.getElementById('slip-input').value = ''
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition shadow-lg"
                          title="ลบรูปภาพ"
                        >
                          <Icon icon="fa-times" className="text-sm" />
                        </button>
                      </div>
                    )}
                    <span className="text-xs font-normal text-gray-500 truncate max-w-xs">
                      {slipFile.name}
                    </span>
                  </div>
                ) : (
                  <div className="text-gray-400 flex flex-col items-center gap-2">
                    <Icon icon="fa-cloud-upload-alt" className="text-4xl mb-1" />
                    <span>แตะที่นี่เพื่อแนบสลิปโอนเงิน</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleTopUp}
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Icon icon="fa-spinner" className="animate-spin" />
                  กำลังส่งคำขอ...
                </span>
              ) : (
                'ส่งคำขอเติมเงิน'
              )}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">ประวัติการเติมเงิน</h2>
          
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Icon icon="fa-history" className="text-4xl mb-2 opacity-50" />
              <p>ยังไม่มีประวัติการเติมเงิน</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
              {transactions.slice(0, 10).map((transaction) => {
                const approvedAt =
                  transaction.approvedat ??
                  transaction.ApprovedAt ??
                  transaction.approvedAt
                const createdAt =
                  transaction.createdat ??
                  transaction.CreatedAt ??
                  transaction.createdAt
                const displayTs =
                  transaction.status === 'approved' && approvedAt ? approvedAt : createdAt
                return (
                <div
                  key={transaction.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-gray-900">
                        {transaction.transactionid}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(displayTs)}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(transaction.status)}`}>
                      {getStatusText(transaction.status)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">จำนวนเงิน:</span>
                    <span className="font-bold text-emerald-600 text-lg">
                      ฿{Number(transaction.amount).toLocaleString()}
                    </span>
                  </div>
                  {transaction.note && (
                    <div className="mt-2 text-xs text-gray-500">
                      <strong>หมายเหตุ:</strong> {transaction.note}
                    </div>
                  )}
                  {transaction.slipurl && (
                    <button
                      onClick={() => window.open(transaction.slipurl, '_blank')}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Icon icon="fa-image" />
                      ดูสลิป
                    </button>
                  )}
                </div>
                )
              })}
              {transactions.length > 10 && (
                <p className="text-center text-sm text-gray-500 pt-2">
                  แสดง 10 รายการล่าสุด จากทั้งหมด {transactions.length} รายการ
                </p>
              )}
            </div>
          )}
        </div>

        {/* Credit Usage History */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">ประวัติการใช้เครดิต</h2>
          
          {usageLog.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Icon icon="fa-wallet" className="text-4xl mb-2 opacity-50" />
              <p>ยังไม่มีประวัติการใช้เครดิต</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
              {usageLog.slice(0, 10).map((usage) => (
                <div
                  key={usage.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-gray-900">
                        ออเดอร์: {usage.orderid || usage.order_id || '-'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(
                          usage.createdat ??
                            usage.CreatedAt ??
                            usage.created_at ??
                            usage.Created_at
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">
                      {Number(usage.amount || 0) < 0 ? 'จำนวนที่ได้รับคืน:' : 'จำนวนที่ใช้:'}
                    </span>
                    {Number(usage.amount || 0) < 0 ? (
                      // Refund (negative amount) - show in green without minus sign
                      <span className="font-bold text-green-600 text-lg">
                        ฿{Math.abs(Number(usage.amount || 0)).toLocaleString()}
                      </span>
                    ) : (
                      // Debit (positive amount) - show in red with minus sign
                      <span className="font-bold text-red-600 text-lg">
                        -฿{Number(usage.amount || 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {usageLog.length > 10 && (
                <p className="text-center text-sm text-gray-500 pt-2">
                  แสดง 10 รายการล่าสุด จากทั้งหมด {usageLog.length} รายการ
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
