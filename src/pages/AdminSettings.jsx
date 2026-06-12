import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { SHOP_INFO } from '../utils/constants'
import { clearShopInfoCache, clearVatCache, clearMaintenanceCache, clearFeaturesCache, clearNotificationsCache } from '../services/shopSettingsService'
import { installmentService } from '../services/installmentService'
import { imageService } from '../services/imageService'
import { supplierPinLockService } from '../services/supplierPinLockService'
import { fetchCustomersForVisibilityPicker } from '../services/userDirectoryService'
import {
  allowedViewerEmailsToFormText,
  mergeEmailIntoAllowedViewerText,
  parseAllowedViewerEmailsFromText
} from '../utils/helpers'
import SignaturePad from '../components/SignaturePad'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

const emptyShopForm = () => ({
  name: SHOP_INFO.name,
  address: SHOP_INFO.address,
  phone: SHOP_INFO.phone,
  taxId: SHOP_INFO.taxId,
  signature: SHOP_INFO.signature || '',
  email: '',
  line: '',
  /** น้ำหนักกล่องเปล่าเริ่มต้น (กก.) เมื่อไม่มีค่าตามไซส์ — ใช้ใน PackingModal / shippingReportExport */
  packingBoxWeightKg: '',
  /** แมปไซส์ → น้ำหนักกล่องเปล่า (กก.) ค่าในฟอร์มเป็นสตริง */
  packingBoxWeightBySize: {}
})

export default function AdminSettings({ user }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState([])
  const [shopForm, setShopForm] = useState(emptyShopForm)
  const [editingKey, setEditingKey] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [vatRate, setVatRate] = useState(7)
  const [maintenanceForm, setMaintenanceForm] = useState({ enabled: false, message: 'กำลังปรับปรุงระบบ' })
  const [featuresForm, setFeaturesForm] = useState({ showCreditTopUp: true, allowCoupon: true, allowPromotion: true })
  const [installmentForm, setInstallmentForm] = useState({
    enabled: false,
    allowedEmailsText: '',
    reminderDaysBeforeText: '3, 2'
  })
  const [installmentCustomerList, setInstallmentCustomerList] = useState([])
  const [installmentCustomersLoading, setInstallmentCustomersLoading] = useState(false)
  const [installmentSelectSeq, setInstallmentSelectSeq] = useState(0)
  const [notificationsForm, setNotificationsForm] = useState({ lowStockThreshold: 5, orderAlertEmail: '' })
  const [uiTextsForm, setUiTextsForm] = useState({ welcome_message: '', footer_text: '' })
  const [showKeyValueList, setShowKeyValueList] = useState(false)
  const [packingBoxSizes, setPackingBoxSizes] = useState(['A2', 'B2', 'C+8', 'M', 'M+', 'H'])
  const [newBoxSize, setNewBoxSize] = useState('')
  const [supplierPinLocks, setSupplierPinLocks] = useState([])
  const [newLockSupplier, setNewLockSupplier] = useState('')
  const [newLockPin, setNewLockPin] = useState('')
  const [savingLock, setSavingLock] = useState(false)

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('settings').select('*').order('key')
      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error('Error fetching settings:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถดึงข้อมูลตั้งค่าได้'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    let cancelled = false
    setInstallmentCustomersLoading(true)
    fetchCustomersForVisibilityPicker()
      .then((list) => {
        if (!cancelled) setInstallmentCustomerList(list || [])
      })
      .catch((error) => {
        console.error('fetchCustomersForVisibilityPicker:', error)
        if (!cancelled) setInstallmentCustomerList([])
      })
      .finally(() => {
        if (!cancelled) setInstallmentCustomersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fetchSupplierPinLocks = async () => {
    try {
      const data = await supplierPinLockService.getAll()
      setSupplierPinLocks(data || [])
    } catch (e) {
      console.error('fetchSupplierPinLocks', e)
      setSupplierPinLocks([])
    }
  }

  useEffect(() => {
    fetchSupplierPinLocks()
  }, [])

  useEffect(() => {
    const row = items.find((i) => i.key === 'shop')
    const v = row?.value
    if (v && typeof v === 'object') {
      const rawBy = v.packingBoxWeightBySize
      const bySize = {}
      if (rawBy && typeof rawBy === 'object') {
        Object.keys(rawBy).forEach((k) => {
          const n = rawBy[k]
          if (n != null && n !== '') bySize[k] = String(n)
        })
      }
      const pkgKg = v.packingBoxWeightKg
      setShopForm({
        name: v.name ?? SHOP_INFO.name,
        address: v.address ?? SHOP_INFO.address,
        phone: v.phone ?? SHOP_INFO.phone,
        taxId: v.taxId ?? SHOP_INFO.taxId,
        signature: v.signature ?? SHOP_INFO.signature ?? '',
        email: v.email ?? '',
        line: v.line ?? '',
        packingBoxWeightKg: pkgKg != null && pkgKg !== '' ? String(pkgKg) : '',
        packingBoxWeightBySize: bySize
      })
    } else {
      setShopForm(emptyShopForm())
    }
  }, [items])

  useEffect(() => {
    const row = items.find((i) => i.key === 'vat')
    const v = row?.value
    if (typeof v === 'number' && v >= 0 && v <= 100) setVatRate(v)
    else if (typeof v === 'string') {
      const n = parseFloat(v)
      if (Number.isFinite(n) && n >= 0 && n <= 100) setVatRate(n)
    } else setVatRate(7)
  }, [items])

  useEffect(() => {
    const row = items.find((i) => i.key === 'maintenance')
    const v = row?.value
    if (v && typeof v === 'object') {
      setMaintenanceForm({
        enabled: !!v.enabled,
        message: typeof v.message === 'string' ? v.message : 'กำลังปรับปรุงระบบ'
      })
    } else {
      setMaintenanceForm({ enabled: false, message: 'กำลังปรับปรุงระบบ' })
    }
  }, [items])

  useEffect(() => {
    const row = items.find((i) => i.key === 'features')
    const v = row?.value
    if (v && typeof v === 'object') {
      setFeaturesForm({
        showCreditTopUp: v.showCreditTopUp !== false,
        allowCoupon: v.allowCoupon !== false,
        allowPromotion: v.allowPromotion !== false
      })
    }
  }, [items])

  useEffect(() => {
    const row = items.find((i) => i.key === 'installment_payments')
    const v = row?.value
    if (v && typeof v === 'object') {
      const reminderDays = Array.isArray(v.reminderDaysBefore)
        ? v.reminderDaysBefore
        : Array.isArray(v.reminder_days_before)
          ? v.reminder_days_before
          : [3, 2]
      setInstallmentForm({
        enabled: v.enabled === true,
        allowedEmailsText: allowedViewerEmailsToFormText(v.allowedEmails || v.allowed_emails || []),
        reminderDaysBeforeText: reminderDays.join(', ')
      })
    } else {
      setInstallmentForm({
        enabled: false,
        allowedEmailsText: '',
        reminderDaysBeforeText: '3, 2'
      })
    }
  }, [items])

  useEffect(() => {
    const row = items.find((i) => i.key === 'notifications')
    const v = row?.value
    if (v && typeof v === 'object') {
      setNotificationsForm({
        lowStockThreshold: Math.max(0, parseInt(v.lowStockThreshold, 10) || 5),
        orderAlertEmail: typeof v.orderAlertEmail === 'string' ? v.orderAlertEmail : ''
      })
    }
  }, [items])

  useEffect(() => {
    const welcome = items.find((i) => i.key === 'welcome_message')?.value
    const footer = items.find((i) => i.key === 'footer_text')?.value
    setUiTextsForm({
      welcome_message: typeof welcome === 'string' ? welcome : '',
      footer_text: typeof footer === 'string' ? footer : ''
    })
  }, [items])

  const syncPackingWeightKeys = useCallback((sizes) => {
    setShopForm((f) => {
      const m = { ...(f.packingBoxWeightBySize || {}) }
      sizes.forEach((sz) => {
        if (!(sz in m)) m[sz] = ''
      })
      Object.keys(m).forEach((k) => {
        if (!sizes.includes(k)) delete m[k]
      })
      return { ...f, packingBoxWeightBySize: m }
    })
  }, [])

  useEffect(() => {
    const row = items.find((i) => i.key === 'packingBoxSizes')
    const v = row?.value
    if (Array.isArray(v) && v.length > 0) {
      setPackingBoxSizes(v)
      syncPackingWeightKeys(v)
    }
  }, [items, syncPackingWeightKeys])

  const saveMaintenance = async () => {
    try {
      setSaving(true)
      const value = {
        enabled: !!maintenanceForm.enabled,
        message: (maintenanceForm.message || '').trim() || 'กำลังปรับปรุงระบบ'
      }
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'maintenance',
          value,
          updatedat: new Date().toISOString()
        }, { onConflict: 'key' })
      if (error) throw error
      clearMaintenanceCache()
      Swal.fire({ icon: 'success', title: 'บันทึกโหมดบำรุงรักษาแล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const saveFeatures = async () => {
    try {
      setSaving(true)
      const value = { showCreditTopUp: !!featuresForm.showCreditTopUp, allowCoupon: !!featuresForm.allowCoupon, allowPromotion: !!featuresForm.allowPromotion }
      const { error } = await supabase.from('settings').upsert({ key: 'features', value, updatedat: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw error
      clearFeaturesCache()
      Swal.fire({ icon: 'success', title: 'บันทึกฟีเจอร์แล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const saveInstallmentPayments = async () => {
    const allowedEmails = parseAllowedViewerEmailsFromText(installmentForm.allowedEmailsText || '')
    const reminderDaysBefore = [
      ...new Set(
        String(installmentForm.reminderDaysBeforeText || '')
          .split(/[\s,;\n]+/)
          .map((v) => Math.max(0, Math.round(Number(v) || 0)))
          .filter((v) => v > 0)
      )
    ]

    if (installmentForm.enabled && allowedEmails.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกอีเมล',
        text: 'เมื่อเปิดแบ่งชำระ ต้องระบุอีเมลลูกค้าที่อนุญาตอย่างน้อย 1 รายการ'
      })
      return
    }

    try {
      setSaving(true)
      const value = {
        enabled: installmentForm.enabled === true,
        allowedEmails,
        reminderDaysBefore: reminderDaysBefore.length > 0 ? reminderDaysBefore : [3, 2]
      }
      const { error } = await supabase
        .from('settings')
        .upsert(
          { key: 'installment_payments', value, updatedat: new Date().toISOString() },
          { onConflict: 'key' }
        )
      if (error) throw error
      installmentService.clearSettingsCache()
      Swal.fire({ icon: 'success', title: 'บันทึกตั้งค่าแบ่งชำระแล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const saveNotifications = async () => {
    try {
      setSaving(true)
      const value = { lowStockThreshold: Math.max(0, Number(notificationsForm.lowStockThreshold) || 5), orderAlertEmail: (notificationsForm.orderAlertEmail || '').trim() }
      const { error } = await supabase.from('settings').upsert({ key: 'notifications', value, updatedat: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw error
      clearNotificationsCache()
      Swal.fire({ icon: 'success', title: 'บันทึกการแจ้งเตือนแล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const saveUiTexts = async () => {
    try {
      setSaving(true)
      const { error: e1 } = await supabase.from('settings').upsert({ key: 'welcome_message', value: (uiTextsForm.welcome_message || '').trim(), updatedat: new Date().toISOString() }, { onConflict: 'key' })
      const { error: e2 } = await supabase.from('settings').upsert({ key: 'footer_text', value: (uiTextsForm.footer_text || '').trim(), updatedat: new Date().toISOString() }, { onConflict: 'key' })
      if (e1 || e2) throw e1 || e2
      Swal.fire({ icon: 'success', title: 'บันทึกข้อความแล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const saveVat = async () => {
    const rate = Math.max(0, Math.min(100, Number(vatRate) || 0))
    try {
      setSaving(true)
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'vat',
          value: rate,
          updatedat: new Date().toISOString()
        }, { onConflict: 'key' })
      if (error) throw error
      clearVatCache()
      setVatRate(rate)
      Swal.fire({ icon: 'success', title: 'บันทึกอัตราภาษีแล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const buildShopPayload = (merged) => {
    const bySize = {}
    Object.entries(merged.packingBoxWeightBySize || {}).forEach(([k, raw]) => {
      const key = String(k).trim()
      if (!key) return
      const n = Number(String(raw).trim().replace(/\s/g, ''))
      if (Number.isFinite(n) && n > 0) bySize[key] = n
    })
    return {
      name: merged.name.trim(),
      address: (merged.address || '').trim(),
      phone: (merged.phone || '').trim(),
      taxId: (merged.taxId || '').trim(),
      signature: (merged.signature || '').trim() || undefined,
      email: (merged.email || '').trim() || undefined,
      line: (merged.line || '').trim() || undefined,
      packingBoxWeightKg: Math.max(0, Number(String(merged.packingBoxWeightKg ?? '').replace(/\s/g, '')) || 0),
      packingBoxWeightBySize: bySize
    }
  }

  const saveShop = async (overrides = {}, options = {}) => {
    const merged = { ...shopForm, ...overrides }
    const name = (merged.name || '').trim()
    if (!name) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อร้าน/บริษัท' })
      return
    }
    try {
      setSaving(true)
      const value = buildShopPayload(merged)
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'shop',
          value,
          updatedat: new Date().toISOString()
        }, { onConflict: 'key' })
      if (error) throw error
      clearShopInfoCache()
      if (overrides.signature !== undefined) setShopForm((f) => ({ ...f, signature: overrides.signature }))
      const title =
        options.successTitle ||
        (overrides.signature !== undefined ? 'บันทึกลายเซ็นแล้ว' : 'บันทึกข้อมูลร้านแล้ว')
      Swal.fire({ icon: 'success', title, timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleSignatureSave = async (blob) => {
    try {
      setUploadingSignature(true)
      const url = await imageService.uploadSignature(blob)
      if (url) {
        setShowSignaturePad(false)
        await saveShop({ signature: url })
      }
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'อัปโหลดไม่สำเร็จ', text: error.message })
    } finally {
      setUploadingSignature(false)
    }
  }

  const valueToDisplay = (row) => {
    const v = row.value
    if (v == null) return '-'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  const startEdit = (row) => {
    setEditingKey(row.key)
    setEditValue(typeof row.value === 'object' ? JSON.stringify(row.value, null, 2) : String(row.value ?? ''))
  }

  const saveEdit = async () => {
    if (!editingKey) return
    try {
      setSaving(true)
      let parsed = editValue.trim()
      try {
        parsed = JSON.parse(parsed)
      } catch {
        // เก็บเป็น string
      }
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: editingKey,
          value: parsed,
          updatedat: new Date().toISOString()
        }, { onConflict: 'key' })
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500, showConfirmButton: false })
      setEditingKey(null)
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    const key = (newKey || '').trim()
    if (!key) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอก key' })
      return
    }
    try {
      setSaving(true)
      let val = newValue.trim()
      try {
        val = val ? JSON.parse(val) : null
      } catch {
        // เก็บเป็น string
      }
      const { error } = await supabase
        .from('settings')
        .upsert({
          key,
          value: val,
          updatedat: new Date().toISOString()
        }, { onConflict: 'key' })
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'เพิ่มแล้ว', timer: 1500, showConfirmButton: false })
      setShowAdd(false)
      setNewKey('')
      setNewValue('')
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'เพิ่มไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleAddSupplierPinLock = async () => {
    const name = (newLockSupplier || '').trim()
    const pin = (newLockPin || '').trim()
    if (!name || !pin) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อซัพพลายและรหัส PIN' })
      return
    }
    try {
      setSavingLock(true)
      await supplierPinLockService.upsertLock(name, pin)
      setNewLockSupplier('')
      setNewLockPin('')
      Swal.fire({ icon: 'success', title: 'บันทึกล็อกซัพพลายแล้ว', timer: 1500, showConfirmButton: false })
      fetchSupplierPinLocks()
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: e.message })
    } finally {
      setSavingLock(false)
    }
  }

  const handleDeleteSupplierPinLock = async (id, supplierName) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันลบล็อก',
      text: `ลบล็อกซัพพลาย "${supplierName}" หรือไม่? สาขาจะเห็นรายการซัพนี้โดยไม่ต้องใส่ PIN`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    })
    if (!ok.isConfirmed) return
    try {
      setSavingLock(true)
      await supplierPinLockService.deleteLock(id)
      Swal.fire({ icon: 'success', title: 'ลบล็อกแล้ว', timer: 1500, showConfirmButton: false })
      fetchSupplierPinLocks()
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: e.message })
    } finally {
      setSavingLock(false)
    }
  }

  const handleDelete = async (key) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันลบ',
      text: `ลบตั้งค่า "${key}" หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    })
    if (!result.isConfirmed) return
    try {
      const { error } = await supabase.from('settings').delete().eq('key', key)
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1500, showConfirmButton: false })
      fetchSettings()
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-4 md:px-6 pb-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">ตั้งค่าทั่วไป</h1>
            <p className="text-gray-600 mb-4">
              ตั้งค่า key-value ที่ใช้ในระบบ (เช่น shipping ใช้ในหน้าตั้งค่าการจัดส่ง)
            </p>

            {/* ข้อมูลร้าน (key: shop) – ใช้ในใบเสร็จ ใบกำกับ ใบปะหน้าพัสดุ */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">ข้อมูลร้าน</h2>
              <p className="text-sm text-gray-500 mb-4">ใช้แสดงในใบเสร็จ ใบกำกับภาษี และใบปะหน้าพัสดุ</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อร้าน / บริษัท *</label>
                  <input
                    type="text"
                    value={shopForm.name}
                    onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="ชื่อร้านหรือบริษัท"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label>
                  <textarea
                    value={shopForm.address}
                    onChange={(e) => setShopForm((f) => ({ ...f, address: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="ที่อยู่เต็ม"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
                  <input
                    type="text"
                    value={shopForm.phone}
                    onChange={(e) => setShopForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="094-038-0836"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input
                    type="text"
                    value={shopForm.taxId}
                    onChange={(e) => setShopForm((f) => ({ ...f, taxId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="0 1055 67121 92 9"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล (ไม่บังคับ)</label>
                  <input
                    type="text"
                    value={shopForm.email}
                    onChange={(e) => setShopForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="contact@example.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ลายเซ็น</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={shopForm.signature}
                      onChange={(e) => setShopForm((f) => ({ ...f, signature: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="URL รูปลายเซ็น หรือกดปุ่มด้านล่างเพื่อสร้างใหม่"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignaturePad(true)}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      <Icon icon="fa-signature" />
                      สร้างลายเซ็นใหม่
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">เซ็นบน iPad/แท็บเล็ต/มือถือ หรือเมาส์ แล้วบันทึกเป็นรูปใช้ในใบกำกับ</p>
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void saveShop()}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  บันทึกข้อมูลร้าน
                </button>
              </div>
            </div>

            {/* อัตราภาษีมูลค่าเพิ่ม (key: vat) – ใช้ในใบกำกับภาษี */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">อัตราภาษีมูลค่าเพิ่ม</h2>
              <p className="text-sm text-gray-500 mb-4">ใช้คำนวณ VAT ในใบกำกับภาษีและสรุปออเดอร์ (ค่าเริ่มต้น 7%)</p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">อัตรา (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveVat}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  บันทึกอัตราภาษี
                </button>
              </div>
            </div>

            {/* ไซส์กล่องสำหรับแพ็กสินค้า (key: packingBoxSizes) – ใช้ในหน้าจัดการออเดอร์ > กำลังจัดเตรียม */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">ไซส์กล่องสำหรับแพ็กสินค้า</h2>
              <p className="text-sm text-gray-500 mb-4">รายการไซส์ที่แสดงในดรอปดาวน์เมื่อแพ็กสินค้าลงกล่อง (หน้าจัดการออเดอร์ → กำลังจัดเตรียม)</p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {packingBoxSizes.map((size, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium"
                  >
                    {size}
                    <button
                      type="button"
                      onClick={() =>
                        setPackingBoxSizes((prev) => {
                          const next = prev.filter((_, i) => i !== idx)
                          syncPackingWeightKeys(next)
                          return next
                        })
                      }
                      className="text-gray-500 hover:text-red-600"
                      title="ลบ"
                    >
                      <Icon icon="fa-times" className="text-xs" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newBoxSize}
                  onChange={(e) => setNewBoxSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const s = newBoxSize.trim()
                      if (s && !packingBoxSizes.includes(s)) {
                        setPackingBoxSizes((prev) => {
                          const next = [...prev, s]
                          syncPackingWeightKeys(next)
                          return next
                        })
                        setNewBoxSize('')
                      }
                    }
                  }}
                  placeholder="เพิ่มไซส์ใหม่ (เช่น L)"
                  className="border border-gray-300 rounded-lg px-3 py-2 w-40"
                />
                <button
                  type="button"
                  onClick={() => {
                    const s = newBoxSize.trim()
                    if (s && !packingBoxSizes.includes(s)) {
                      setPackingBoxSizes((prev) => {
                        const next = [...prev, s]
                        syncPackingWeightKeys(next)
                        return next
                      })
                      setNewBoxSize('')
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  เพิ่ม
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setSaving(true)
                      const { error } = await supabase
                        .from('settings')
                        .upsert({
                          key: 'packingBoxSizes',
                          value: packingBoxSizes,
                          updatedat: new Date().toISOString()
                        }, { onConflict: 'key' })
                      if (error) throw error
                      Swal.fire({ icon: 'success', title: 'บันทึกไซส์กล่องแล้ว', timer: 1500, showConfirmButton: false })
                      fetchSettings()
                    } catch (err) {
                      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message })
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  บันทึกรายการไซส์
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">น้ำหนักกล่องเปล่า (กก.)</h3>
                <p className="text-sm text-gray-500 mb-4">
                  ตั้งค่าครั้งเดียวเพื่อใช้ปุ่มคำนวณน้ำหนักแนะนำในแพ็กสินค้าและส่งออก CSV นำจ่าย — เก็บในข้อมูลร้าน (key shop) ร่วมกับการกดบันทึกข้อมูลร้านด้านบน หรือปุ่มด้านล่างนี้
                </p>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนักกล่องเปล่าเริ่มต้น (กก.) เมื่อไม่มีค่าตามไซส์</label>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={shopForm.packingBoxWeightKg}
                    onChange={(e) => setShopForm((f) => ({ ...f, packingBoxWeightKg: e.target.value }))}
                    className="w-40 border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="0"
                  />
                </div>
                {packingBoxSizes.length === 0 ? (
                  <p className="text-sm text-gray-500">เพิ่มไซส์กล่องก่อน จึงจะกรอกน้ำหนักตามไซส์ได้</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium text-gray-700">ไซส์</th>
                          <th className="px-3 py-2 font-medium text-gray-700">น้ำหนักกล่องเปล่า (กก.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packingBoxSizes.map((size) => (
                          <tr key={size} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-800">{size}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={0.001}
                                value={shopForm.packingBoxWeightBySize?.[size] ?? ''}
                                onChange={(e) =>
                                  setShopForm((f) => ({
                                    ...f,
                                    packingBoxWeightBySize: {
                                      ...(f.packingBoxWeightBySize || {}),
                                      [size]: e.target.value
                                    }
                                  }))
                                }
                                className="w-36 border border-gray-300 rounded-lg px-2 py-1.5"
                                placeholder="เช่น 0.15"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void saveShop({}, { successTitle: 'บันทึกน้ำหนักกล่องและข้อมูลร้านแล้ว' })}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    บันทึกน้ำหนักกล่อง (และข้อมูลร้าน)
                  </button>
                </div>
              </div>
            </div>

            {/* โหมดบำรุงรักษา (key: maintenance) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">โหมดบำรุงรักษา</h2>
              <p className="text-sm text-gray-500 mb-4">เปิดแล้ว หน้า Login/Home จะแสดงข้อความและปิดการสั่งซื้อชั่วคราว (แอดมินยังเข้าใช้งานได้)</p>
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maintenanceForm.enabled}
                    onChange={(e) => setMaintenanceForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-medium text-gray-700">เปิดโหมดบำรุงรักษา</span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความแจ้งผู้ใช้</label>
                  <textarea
                    value={maintenanceForm.message}
                    onChange={(e) => setMaintenanceForm((f) => ({ ...f, message: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="กำลังปรับปรุงระบบ กรุณาลองใหม่ในภายหลัง"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveMaintenance}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  บันทึกโหมดบำรุงรักษา
                </button>
              </div>
            </div>

            {/* ฟีเจอร์เปิด/ปิด (key: features) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">ฟีเจอร์เปิด/ปิด</h2>
              <p className="text-sm text-gray-500 mb-4">ควบคุมการแสดงเมนูเติมเครดิต คูปอง และโปรโมชั่น</p>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={featuresForm.showCreditTopUp} onChange={(e) => setFeaturesForm((f) => ({ ...f, showCreditTopUp: e.target.checked }))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span>แสดงเมนูเติมเครดิต (Header / หน้า TopUp)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={featuresForm.allowCoupon} onChange={(e) => setFeaturesForm((f) => ({ ...f, allowCoupon: e.target.checked }))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span>เปิดใช้คูปอง (Checkout แสดงช่องใส่โค้ด)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={featuresForm.allowPromotion} onChange={(e) => setFeaturesForm((f) => ({ ...f, allowPromotion: e.target.checked }))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span>เปิดใช้โปรโมชั่น (Checkout, หน้าสินค้า)</span>
                </label>
                <button type="button" onClick={saveFeatures} disabled={saving} className="mt-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">บันทึกฟีเจอร์</button>
              </div>
            </div>

            {/* แบ่งชำระ (key: installment_payments) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Icon icon="fa-percent" />
                แบ่งชำระ
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                เปิดฟังก์ชันแบ่งชำระเฉพาะอีเมลลูกค้าที่เลือก และตั้งจำนวนวันแจ้งเตือนก่อนครบกำหนด
              </p>
              <div className="space-y-4">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={installmentForm.enabled}
                    onChange={(e) => setInstallmentForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <span className="block font-medium text-gray-800">เปิดใช้งานแบ่งชำระ</span>
                    <span className="block text-xs text-gray-500">
                      Checkout จะแสดงตัวเลือกนี้เฉพาะลูกค้าที่อีเมลอยู่ในรายการด้านล่าง
                    </span>
                  </span>
                </label>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    เพิ่มจากรายชื่อลูกค้า
                  </label>
                  <select
                    key={installmentSelectSeq}
                    defaultValue=""
                    disabled={installmentCustomersLoading}
                    onChange={(e) => {
                      const email = e.target.value
                      if (!email) return
                      setInstallmentForm((f) => ({
                        ...f,
                        allowedEmailsText: mergeEmailIntoAllowedViewerText(f.allowedEmailsText, email)
                      }))
                      setInstallmentSelectSeq((n) => n + 1)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  >
                    <option value="">
                      {installmentCustomersLoading ? 'กำลังโหลดรายชื่อ...' : '-- เลือกเพื่อเพิ่มอีเมล --'}
                    </option>
                    {installmentCustomerList.map((customer) => (
                      <option key={customer.email.toLowerCase()} value={customer.email}>
                        {customer.optionLabel}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    รายชื่อนี้ดึงจากตาราง users และไม่รวมบัญชีแอดมิน
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    อีเมลที่อนุญาตให้แบ่งชำระ
                  </label>
                  <textarea
                    value={installmentForm.allowedEmailsText}
                    onChange={(e) => setInstallmentForm((f) => ({ ...f, allowedEmailsText: e.target.value }))}
                    rows={3}
                    placeholder="customer@example.com, franchise@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    คั่นได้ด้วยจุลภาค เว้นวรรค หรือขึ้นบรรทัดใหม่ ระบบจะตัดอีเมลซ้ำให้อัตโนมัติเมื่อบันทึก
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    แจ้งเตือนล่วงหน้าก่อนครบกำหนด (วัน)
                  </label>
                  <input
                    type="text"
                    value={installmentForm.reminderDaysBeforeText}
                    onChange={(e) => setInstallmentForm((f) => ({ ...f, reminderDaysBeforeText: e.target.value }))}
                    placeholder="3, 2"
                    className="w-full md:w-64 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    เช่น `3, 2` หมายถึงเตือนก่อนครบกำหนด 3 วัน และ 2 วัน
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <Icon icon="fa-info-circle" className="mr-2" />
                  การแจ้งเตือนจะทำงานจริงหลังต่อ scheduler/cron ในขั้นถัดไป ตอนนี้เป็นการบันทึกค่าตั้งค่าและ schedule foundation
                </div>

                <button
                  type="button"
                  onClick={saveInstallmentPayments}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  บันทึกตั้งค่าแบ่งชำระ
                </button>
              </div>
            </div>

            {/* ล็อกซัพพลาย (หน้า สั่งสินค้าซัพอื่น — สาขาต้องใส่ PIN ถึงจะเห็นรายการ) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Icon icon="fa-lock" />
                ล็อกซัพพลาย
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                ซัพพลายที่อยู่ในรายการด้านล่าง เมื่อสาขาเลือกดูในหน้า จัดการสต็อก → สั่งสินค้าซัพอื่น จะต้องใส่รหัส PIN ถึงจะเห็นรายการสินค้าของซัพนั้น (ชื่อต้องตรงกับที่ใช้ในรายการสินค้าซัพนอก)
              </p>
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อซัพพลาย</label>
                    <input
                      type="text"
                      value={newLockSupplier}
                      onChange={(e) => setNewLockSupplier(e.target.value)}
                      placeholder="เช่น ติ่มซำ, MAKRO"
                      className="border border-gray-300 rounded-lg px-3 py-2 w-48"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">รหัส PIN</label>
                    <input
                      type="password"
                      value={newLockPin}
                      onChange={(e) => setNewLockPin(e.target.value)}
                      placeholder="รหัสตัวเลข/ตัวอักษร"
                      className="border border-gray-300 rounded-lg px-3 py-2 w-40"
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSupplierPinLock}
                    disabled={savingLock}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Icon icon="fa-plus" />
                    เพิ่มล็อก
                  </button>
                </div>
                {supplierPinLocks.length > 0 ? (
                  <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {supplierPinLocks.map((row) => (
                      <li key={row.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                        <span className="font-medium text-gray-800">{row.supplier_name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupplierPinLock(row.id, row.supplier_name)}
                          disabled={savingLock}
                          className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                        >
                          ลบล็อก
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">ยังไม่มีซัพที่ถูกล็อก — เพิ่มชื่อซัพและรหัส PIN ด้านบน</p>
                )}
              </div>
            </div>

            {/* การแจ้งเตือน / ขีดจำกัด (key: notifications) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">การแจ้งเตือน / ขีดจำกัด</h2>
              <p className="text-sm text-gray-500 mb-4">ขีดจำกัดสต็อกต่ำและอีเมลแจ้งออเดอร์ (อนาคต)</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนขั้นต่ำที่ถือว่าสต็อกต่ำ</label>
                  <input type="number" min={0} value={notificationsForm.lowStockThreshold} onChange={(e) => setNotificationsForm((f) => ({ ...f, lowStockThreshold: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className="w-24 border border-gray-300 rounded-lg px-3 py-2" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">อีเมลรับแจ้งออเดอร์ใหม่ (ไม่บังคับ)</label>
                  <input type="text" value={notificationsForm.orderAlertEmail} onChange={(e) => setNotificationsForm((f) => ({ ...f, orderAlertEmail: e.target.value }))} placeholder="admin@example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              </div>
              <button type="button" onClick={saveNotifications} disabled={saving} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">บันทึกการแจ้งเตือน</button>
            </div>

            {/* ข้อความต้อนรับ / ท้ายหน้า */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">ข้อความต้อนรับ / ท้ายหน้า</h2>
              <p className="text-sm text-gray-500 mb-4">ข้อความหน้าแรกหลังล็อกอิน และข้อความท้ายหน้า (Footer)</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความต้อนรับ (welcome_message)</label>
                  <textarea value={uiTextsForm.welcome_message} onChange={(e) => setUiTextsForm((f) => ({ ...f, welcome_message: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="ยินดีต้อนรับ" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความท้ายหน้า (footer_text)</label>
                  <textarea value={uiTextsForm.footer_text} onChange={(e) => setUiTextsForm((f) => ({ ...f, footer_text: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="© ร้านของเรา" />
                </div>
                <button type="button" onClick={saveUiTexts} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">บันทึกข้อความ</button>
              </div>
            </div>

            {!showKeyValueList ? (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setShowKeyValueList(true)}
                  className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-2"
                >
                  <Icon icon="fa-chevron-down" className="text-xs" />
                  แสดงรายการตั้งค่า key-value (สำหรับผู้ดูแลขั้นสูง)
                </button>
              </div>
            ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <span className="font-bold text-gray-700">รายการตั้งค่า</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowKeyValueList(false); setShowAdd(false) }}
                    className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm"
                  >
                    ซ่อน
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
                  >
                    <Icon icon="fa-plus" />
                    เพิ่ม key
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Key</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Value</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase w-32">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((row) => (
                      <tr key={row.key} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {row.key === 'shipping' ? (
                            <Link to="/admin/shipping-settings" className="text-emerald-600 hover:underline font-medium">
                              {row.key}
                            </Link>
                          ) : (
                            <span className="font-mono text-sm">{row.key}</span>
                          )}
                          {row.key === 'shipping' && (
                            <span className="block text-xs text-gray-500">ไปที่ตั้งค่าการจัดส่ง</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingKey === row.key ? (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full border rounded-lg p-2 text-sm font-mono h-24"
                              placeholder="JSON หรือข้อความ"
                            />
                          ) : (
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all max-h-20 overflow-auto">
                              {valueToDisplay(row)}
                            </pre>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingKey === row.key ? (
                            <>
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={saving}
                                className="text-emerald-600 hover:underline font-medium mr-2"
                              >
                                บันทึก
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingKey(null)}
                                className="text-gray-500 hover:underline"
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="text-blue-600 hover:underline font-medium mr-2"
                              >
                                แก้ไข
                              </button>
                              {row.key !== 'shipping' && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(row.key)}
                                  className="text-red-600 hover:underline"
                                >
                                  ลบ
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500">ยังไม่มีรายการตั้งค่า</div>
              )}
            </div>
            )}

            {showKeyValueList && showAdd && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-gray-800 mb-4">เพิ่มตั้งค่าใหม่</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Key</label>
                    <input
                      type="text"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="เช่น site_name, contact_email"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Value (JSON หรือข้อความ)</label>
                    <textarea
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder='{"key": "value"} หรือข้อความ'
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 h-24"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={saving}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      เพิ่ม
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAdd(false); setNewKey(''); setNewValue('') }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSignaturePad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-3">สร้างลายเซ็นใหม่</h2>
            {uploadingSignature ? (
              <p className="text-gray-600 py-8 text-center">กำลังอัปโหลด...</p>
            ) : (
              <SignaturePad
                onSave={handleSignatureSave}
                onCancel={() => setShowSignaturePad(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
