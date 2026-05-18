import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { productService } from '../services/productService'
import { imageService } from '../services/imageService'
import { supplierService } from '../services/supplierService'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import ProductSearchCombobox from '../components/admin/ProductSearchCombobox'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import {
  allowedViewerEmailsToFormText,
  mergeEmailIntoAllowedViewerText,
  parseAllowedViewerEmailsFromText
} from '../utils/helpers'
import { fetchCustomersForVisibilityPicker } from '../services/userDirectoryService'
import { generateProductQrDataUrl, downloadQrImage } from '../utils/productQr'
import { snapBundleQtyToStep, validateFlexibleBundleSelections } from '../utils/bundleUtils'
import {
  MAX_PRICE_TIERS,
  emptyPriceTierFormRow,
  validatePriceTierFormRows,
  priceTiersToFormRows
} from '../utils/priceTiers'

/** แปลงข้อมูลจาก DB เป็นรูปแบบฟอร์ม: หลัก + แถวส่วนประกอบ (ไม่รวมหลัก) */
function deriveBundleUiFromProduct(p) {
  const lines = Array.isArray(p.bundleLines) ? p.bundleLines : []
  let primary = String(p.bundlePrimaryProductId || '').trim()
  const linePids = lines.map((l) => String(l.productId || '').trim()).filter(Boolean)

  let secondaryIds = []
  if (p.bundleFlexible === true && p.bundleComponentSumEqualsPrimary === true && primary) {
    secondaryIds = linePids.filter((id) => id !== primary)
  } else if (p.bundleFlexible === true && primary) {
    secondaryIds = linePids.filter((id) => id !== primary)
  } else if (p.bundleFlexible !== true && lines.length > 0) {
    const positive = lines.filter((l) => String(l.productId || '').trim() && (Number(l.qty) || 0) > 0)
    if (!primary && positive.length) primary = String(positive[0].productId || '').trim()
    secondaryIds = positive
      .map((l) => String(l.productId || '').trim())
      .filter((id) => id && id !== primary)
  } else {
    secondaryIds = linePids.filter((id) => id !== primary)
  }

  const uniqueSecondaries = [...new Set(secondaryIds)]
  return {
    bundlePrimaryProductId: primary,
    bundleSecondaryRows: uniqueSecondaries.length
      ? uniqueSecondaries.map((productId) => ({ productId }))
      : [{ productId: '' }]
  }
}

function emptyForm() {
  return {
    id: '',
    name: '',
    price: '',
    cost: '',
    stock: '',
    image: '',
    category: '',
    detail: '',
    supplier: '',
    unit: 'ชิ้น',
    weight: '',
    minStock: '5',
    franchisePrice: '',
    visibleOnHome: true,
    saleToFranchise: true,
    saleToRegular: true,
    saleRestrictedToUsers: false,
    allowedViewerEmailsText: '',
    orderStep: '1',
    isBundle: true,
    bundleFlexible: true,
    bundleComponentSumEqualsPrimary: true,
    bundlePrimaryProductId: '',
    bundleSecondaryRows: [{ productId: '' }],
    productOptionRows: [],
    priceTierRows: []
  }
}

function emptyOptionValueRow() {
  return { label: '', price: '0' }
}

function emptyOptionRow() {
  return { name: '', required: true, valueRows: [emptyOptionValueRow()] }
}

function toOptionRowsFromProductOptions(productOptions) {
  if (!Array.isArray(productOptions)) return []
  return productOptions
    .map((o) => ({
      name: o?.name || '',
      required: Boolean(o?.required),
      valueRows: Array.isArray(o?.values) && o.values.length > 0
        ? o.values.map((v) => ({
            label: String(v?.label ?? v ?? '').trim(),
            price: String(Math.max(0, Number(v?.price) || 0))
          }))
        : [emptyOptionValueRow()]
    }))
    .filter((o) => o.name || (o.valueRows || []).some((v) => String(v?.label || '').trim()))
}

function buildProductOptionsPayload(optionRows) {
  return (optionRows || [])
    .map((row) => {
      const name = String(row?.name || '').trim()
      const values = (row?.valueRows || [])
        .map((v) => ({
          label: String(v?.label || '').trim(),
          price: Math.max(0, Number(v?.price) || 0)
        }))
        .filter((v) => v.label)
      return { name, required: Boolean(row?.required), values }
    })
    .filter((o) => o.name && o.values.length > 0)
}

export default function BundleProductComposer({ user }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = (searchParams.get('edit') || '').trim()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [editingProductId, setEditingProductId] = useState(null)
  const [allProductsCatalog, setAllProductsCatalog] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [visibilityPickList, setVisibilityPickList] = useState([])
  const [visibilityPickLoading, setVisibilityPickLoading] = useState(false)
  const [visibilitySelectSeq, setVisibilitySelectSeq] = useState(0)
  const [bundlePreviewQty, setBundlePreviewQty] = useState({})

  const bundlePreviewIdsKey = useMemo(() => {
    const primary = (formData.bundlePrimaryProductId || '').trim()
    const secs = (formData.bundleSecondaryRows || [])
      .map((r) => (r.productId || '').trim())
      .filter(Boolean)
    return `${primary}|${[...secs].sort().join(',')}`
  }, [formData.bundlePrimaryProductId, formData.bundleSecondaryRows])

  const bundlePreviewProduct = useMemo(() => {
    const primary = (formData.bundlePrimaryProductId || '').trim()
    const secondaryIds = (formData.bundleSecondaryRows || [])
      .map((r) => (r.productId || '').trim())
      .filter(Boolean)
    if (!primary || secondaryIds.length === 0) return null
    const lines = [primary, ...secondaryIds].map((productId) => ({ productId, qty: 0 }))
    return {
      bundleFlexible: true,
      bundleComponentSumEqualsPrimary: true,
      bundlePrimaryProductId: primary,
      bundleLines: lines,
      orderStep: Math.max(1, parseInt(String(formData.orderStep ?? '1'), 10) || 1)
    }
  }, [formData.bundlePrimaryProductId, formData.bundleSecondaryRows, formData.orderStep])

  const bundlePreviewCatalogMap = useMemo(
    () => new Map((allProductsCatalog || []).map((p) => [String(p.id || '').trim(), p])),
    [allProductsCatalog]
  )

  useEffect(() => {
    const primary = (formData.bundlePrimaryProductId || '').trim()
    const secondaryIds = (formData.bundleSecondaryRows || [])
      .map((r) => (r.productId || '').trim())
      .filter(Boolean)
    if (!primary || secondaryIds.length === 0) {
      setBundlePreviewQty({})
      return
    }
    const orderStep = Math.max(1, parseInt(String(formData.orderStep ?? '1'), 10) || 1)
    const o = { [primary]: orderStep }
    for (const sid of secondaryIds) {
      o[sid] = 0
    }
    setBundlePreviewQty(o)
  }, [bundlePreviewIdsKey, formData.orderStep, bundlePreviewCatalogMap])

  const loadCatalog = useCallback(async () => {
    const data = await productService.getAllProducts(user, '')
    setAllProductsCatalog(data)
  }, [user])

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('Category')
      .not('Category', 'is', null)
      .neq('Category', '')
    if (error) return
    const unique = new Set()
    ;(data || []).forEach((p) => {
      const c = p.Category || p.category
      if (c && String(c).trim()) unique.add(String(c).trim())
    })
    setCategories([...unique].sort())
  }

  const fetchSuppliers = async () => {
    const data = await supplierService.getAllSuppliers()
    setSuppliers(data || [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await Promise.all([loadCatalog(), fetchCategories(), fetchSuppliers()])
        if (editId) {
          const p = await productService.getProduct(editId, user)
          if (cancelled) return
          if (!p || !p.isBundle) {
            Swal.fire({
              icon: 'info',
              title: 'ไม่ใช่สินค้าชุด',
              text: 'รหัสนี้ไม่ได้ตั้งเป็นชุด — ใช้จัดการสต็อกสำหรับสินค้าทั่วไป',
              confirmButtonText: 'ตกลง'
            }).then(() => navigate('/admin/stock'))
            return
          }
          setEditingProductId(p.id)
          const derived = deriveBundleUiFromProduct(p)
          setFormData({
            id: p.id,
            name: p.name,
            price: p.price,
            cost: p.cost || '',
            stock: p.stock,
            image: p.image || '',
            category: p.category || '',
            detail: p.detail || '',
            supplier: p.supplier || '',
            unit: p.unit || 'ชิ้น',
            weight: p.weight || '',
            minStock: p.minStock || 5,
            franchisePrice: p.franchisePrice || p.price,
            visibleOnHome: p.visibleOnHome !== false,
            saleToFranchise: p.saleToFranchise !== false,
            saleToRegular: p.saleToRegular !== false,
            saleRestrictedToUsers: p.saleRestrictedToUsers === true,
            allowedViewerEmailsText: allowedViewerEmailsToFormText(p.allowedViewerEmails),
            orderStep: String(p.orderStep ?? 1),
            isBundle: true,
            bundleFlexible: true,
            bundleComponentSumEqualsPrimary: true,
            bundlePrimaryProductId: derived.bundlePrimaryProductId,
            bundleSecondaryRows: derived.bundleSecondaryRows,
            productOptionRows: toOptionRowsFromProductOptions(p.productOptions),
            priceTierRows: priceTiersToFormRows(p.priceTiers)
          })
        } else {
          setEditingProductId(null)
          setFormData(emptyForm())
        }
      } catch (e) {
        console.error(e)
        Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: e.message })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, editId, navigate, loadCatalog])

  useEffect(() => {
    let cancelled = false
    setVisibilityPickLoading(true)
    fetchCustomersForVisibilityPicker()
      .then((list) => {
        if (!cancelled) setVisibilityPickList(list)
      })
      .catch(() => {
        if (!cancelled) setVisibilityPickList([])
      })
      .finally(() => {
        if (!cancelled) setVisibilityPickLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      Swal.fire({ title: 'กำลังอัปโหลดรูปภาพ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false })
      const imageUrl = await imageService.uploadImage(file)
      setFormData((fd) => ({ ...fd, image: imageUrl }))
      Swal.close()
      Swal.fire({ icon: 'success', title: 'อัปโหลดรูปภาพสำเร็จ', timer: 1500, showConfirmButton: false })
    } catch (error) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'อัปโหลดรูปภาพไม่สำเร็จ', text: error.message })
    }
  }

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูลให้ครบ',
        text: 'ชื่อสินค้าและราคาเป็นข้อมูลที่จำเป็น'
      })
      return
    }

    if (formData.visibleOnHome !== false) {
      if (formData.saleRestrictedToUsers) {
        const emails = parseAllowedViewerEmailsFromText(formData.allowedViewerEmailsText || '')
        if (emails.length === 0) {
          Swal.fire({
            icon: 'warning',
            title: 'กรุณาระบุอีเมล',
            text: 'เมื่อเลือกจำกัดเฉพาะผู้ใช้ ต้องกรอกอีเมลอย่างน้อย 1 รายการ หรือปิดการแสดงในหน้าหลัก'
          })
          return
        }
      } else if (!formData.saleToFranchise && !formData.saleToRegular) {
        Swal.fire({
          icon: 'warning',
          title: 'เลือกกลุ่มลูกค้า',
          text: 'เลือกอย่างน้อยหนึ่งกลุ่ม (แฟรนไชส์ / ลูกค้าทั่วไป) หรือใช้โหมดจำกัดอีเมล หรือปิดการแสดงในหน้าหลัก'
        })
        return
      }
    }

    const productOptions = buildProductOptionsPayload(formData.productOptionRows)

    const tierCheck = validatePriceTierFormRows(formData.orderStep, formData.priceTierRows)
    if (!tierCheck.ok) {
      Swal.fire({ icon: 'warning', title: 'ราคาขั้นบันไดไม่ถูกต้อง', text: tierCheck.message })
      return
    }

    const primary = (formData.bundlePrimaryProductId || '').trim()
    const secondaryIds = (formData.bundleSecondaryRows || [])
      .map((r) => (r.productId || '').trim())
      .filter(Boolean)

    if (!primary) {
      Swal.fire({
        icon: 'warning',
        title: 'ชุดสินค้า',
        text: 'เลือกสินค้าหลัก (รหัสที่ใช้คำนวณราคาเมื่อลูกค้าสั่ง)'
      })
      return
    }
    if (secondaryIds.length < 1) {
      Swal.fire({
        icon: 'warning',
        title: 'ชุดสินค้า',
        text: 'เพิ่มอย่างน้อย 1 รายการสินค้าประกอบ (นอกจากหลัก)'
      })
      return
    }
    if (secondaryIds.some((id) => id === primary)) {
      Swal.fire({
        icon: 'warning',
        title: 'ชุดสินค้า',
        text: 'สินค้าประกอบต้องไม่ซ้ำกับสินค้าหลัก'
      })
      return
    }
    if (new Set(secondaryIds).size !== secondaryIds.length) {
      Swal.fire({
        icon: 'warning',
        title: 'ชุดสินค้า',
        text: 'ห้ามเลือกรหัสส่วนประกอบซ้ำกัน'
      })
      return
    }

    const selfId = (formData.id || '').trim()
    if (selfId && (primary === selfId || secondaryIds.includes(selfId))) {
      Swal.fire({
        icon: 'warning',
        title: 'ชุดสินค้า',
        text: 'ห้ามใส่รหัสสินค้าชุดเป็นส่วนประกอบของตัวเอง'
      })
      return
    }

    const bundleLinesPayload = [
      { productId: primary, qty: 0 },
      ...secondaryIds.map((productId) => ({ productId, qty: 0 }))
    ]

    setSaving(true)
    try {
      Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false })

      const payloadBase = {
        name: formData.name,
        price: Number(formData.price),
        cost: formData.cost ? Number(formData.cost) : undefined,
        stock: Number(formData.stock) || 0,
        image: formData.image,
        category: formData.category,
        detail: formData.detail,
        supplier: formData.supplier,
        unit: formData.unit,
        weight: formData.weight ? Number(formData.weight) : 0,
        minStock: Number(formData.minStock) || 5,
        franchisePrice: formData.franchisePrice ? Number(formData.franchisePrice) : Number(formData.price),
        franchiseAvailable: formData.saleToFranchise !== false,
        visibleOnHome: formData.visibleOnHome !== false,
        saleToFranchise: formData.saleToFranchise !== false,
        saleToRegular: formData.saleToRegular !== false,
        saleRestrictedToUsers: formData.saleRestrictedToUsers === true,
        allowedViewerEmailsText: formData.allowedViewerEmailsText || '',
        orderStep: Math.max(1, parseInt(formData.orderStep, 10) || 1),
        isBundle: true,
        bundleFlexible: true,
        bundleComponentSumEqualsPrimary: true,
        bundlePrimaryProductId: primary,
        productOptions,
        bundleLines: bundleLinesPayload,
        priceTiers: tierCheck.tiers
      }

      if (editingProductId) {
        const newId = (formData.id || '').trim()
        if (!newId) {
          Swal.close()
          Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสสินค้า' })
          setSaving(false)
          return
        }
        await productService.updateProduct(editingProductId, { id: newId, ...payloadBase })
        Swal.fire({ icon: 'success', title: 'อัปเดตชุดสินค้าสำเร็จ', timer: 1500, showConfirmButton: false })
      } else {
        await productService.addProduct({
          id: (formData.id || '').trim() || undefined,
          name: formData.name,
          price: Number(formData.price),
          cost: formData.cost ? Number(formData.cost) : undefined,
          stock: Number(formData.stock) || 0,
          image: formData.image,
          category: formData.category,
          detail: formData.detail,
          supplier: formData.supplier,
          unit: formData.unit,
          weight: formData.weight ? Number(formData.weight) : 0,
          minStock: Number(formData.minStock) || 5,
          franchisePrice: formData.franchisePrice ? Number(formData.franchisePrice) : Number(formData.price),
          franchiseAvailable: formData.saleToFranchise !== false,
          visibleOnHome: formData.visibleOnHome !== false,
          saleToFranchise: formData.saleToFranchise !== false,
          saleToRegular: formData.saleToRegular !== false,
          saleRestrictedToUsers: formData.saleRestrictedToUsers === true,
          allowedViewerEmailsText: formData.allowedViewerEmailsText || '',
          orderStep: Math.max(1, parseInt(formData.orderStep, 10) || 1),
          isBundle: true,
          bundleFlexible: true,
          bundleComponentSumEqualsPrimary: true,
          bundlePrimaryProductId: primary,
          productOptions,
          bundleLines: bundleLinesPayload,
          priceTiers: tierCheck.tiers
        })
        Swal.fire({ icon: 'success', title: 'สร้างชุดสินค้าสำเร็จ', timer: 1500, showConfirmButton: false })
      }

      await loadCatalog()
      await fetchCategories()
      await fetchSuppliers()
      navigate('/admin/stock')
    } catch (error) {
      Swal.close()
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
      Swal.close()
    }
  }

  const handleDelete = async () => {
    if (!editingProductId) return
    const { isConfirmed } = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: `ลบสินค้าชุด ${editingProductId} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'ลบ'
    })
    if (!isConfirmed) return
    try {
      await productService.deleteProduct(editingProductId)
      Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1500, showConfirmButton: false })
      navigate('/admin/stock')
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: e.message })
    }
  }

  const bundleSelfId = (formData.id || '').trim()
  const catalogPickable = useMemo(
    () =>
      (allProductsCatalog || []).filter((p) => {
        const id = String(p.id || '').trim()
        if (!id) return false
        if (bundleSelfId && id === bundleSelfId) return false
        if (p.isBundle === true) return false
        return true
      }),
    [allProductsCatalog, bundleSelfId]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} cartItemCount={0} onCartClick={() => {}} />
        <div className="flex min-h-0">
          <Sidebar user={user} />
          <div className="flex flex-1 min-w-0 ml-0 md:ml-64 pt-24 items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {editingProductId ? 'แก้ไขชุดสินค้า' : 'จัดชุดสินค้า'}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  สร้างรหัสสินค้าขายใหม่ที่เป็นชุด โดยอ้างอิงส่วนประกอบจากสต็อกที่มี — ตัดสต็อกส่วนประกอบตามกติกาชุดเมื่อมีการสั่งซื้อ
                </p>
              </div>
              <Link
                to="/admin/stock"
                className="text-sm font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-2"
              >
                <Icon icon="fa-arrow-left" />
                กลับจัดการสต็อก
              </Link>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">รหัสสินค้าชุด *</label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    disabled={!!editingProductId}
                    placeholder={editingProductId ? '' : 'ว่างไว้เพื่อสร้างอัตโนมัติ'}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อสินค้าชุด *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ราคาชุด *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ต้นทุน</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">สต็อกชุด (ขาย)</label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">สต็อกขั้นต่ำ</label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ขั้นตอนการสั่งของชุด (หน่วย)</label>
                <p className="text-xs text-gray-500 mb-1">
                  ใช้กับจำนวน<strong>สินค้าหลัก</strong>เมื่อลูกค้าสั่ง (เช่น 1000) — จำนวนหลักต้องหารค่านี้ลงตัว
                </p>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.orderStep}
                  onChange={(e) => setFormData({ ...formData, orderStep: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none"
                />
              </div>

              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
                <div className="font-bold text-gray-800">ราคาขั้นบันได (ตามจำนวนในตะกร้า)</div>
                <p className="text-xs text-gray-600">
                  สูงสุด {MAX_PRICE_TIERS} ขั้น — ราคาในแต่ละขั้น = ราคาต่อหนึ่ง OrderStep ของชุด (เหมือน &quot;ราคาชุด&quot;) คิดจากจำนวน
                  <strong>สินค้าหลัก</strong> เมื่อสั่ง — เกณฑ์ minQty ต้อง ≥ OrderStep ของชุดและเป็นทวีคูณของ OrderStep
                </p>
                {(formData.priceTierRows || []).map((row, tIdx) => (
                  <div
                    key={tIdx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-amber-100 bg-white rounded p-2"
                  >
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-600 mb-1">minQty</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="w-full border rounded p-2 text-sm"
                        value={row.minQty}
                        onChange={(e) => {
                          const next = [...(formData.priceTierRows || [])]
                          next[tIdx] = { ...next[tIdx], minQty: e.target.value }
                          setFormData({ ...formData, priceTierRows: next })
                        }}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-600 mb-1">ราคา / OrderStep ชุด</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border rounded p-2 text-sm"
                        value={row.price}
                        onChange={(e) => {
                          const next = [...(formData.priceTierRows || [])]
                          next[tIdx] = { ...next[tIdx], price: e.target.value }
                          setFormData({ ...formData, priceTierRows: next })
                        }}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-xs font-bold text-gray-600 mb-1">ราคาแฟรนไชส์ / OrderStep (ถ้ามี)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border rounded p-2 text-sm"
                        value={row.franchisePrice}
                        placeholder="ว่างได้"
                        onChange={(e) => {
                          const next = [...(formData.priceTierRows || [])]
                          next[tIdx] = { ...next[tIdx], franchisePrice: e.target.value }
                          setFormData({ ...formData, priceTierRows: next })
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        className="text-red-600 text-sm font-bold w-full text-left md:text-right"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            priceTierRows: (formData.priceTierRows || []).filter((_, i) => i !== tIdx)
                          })
                        }
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
                {(formData.priceTierRows || []).length < MAX_PRICE_TIERS ? (
                  <button
                    type="button"
                    className="text-sm font-bold text-amber-800 hover:text-amber-950"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        priceTierRows: [...(formData.priceTierRows || []), emptyPriceTierFormRow()]
                      })
                    }
                  >
                    + เพิ่มขั้นราคา
                  </button>
                ) : null}
              </div>

              <div className="border border-amber-200 bg-amber-50/80 rounded-lg p-4 space-y-4">
                <div className="text-sm font-bold text-amber-950">การจัดชุดสินค้า</div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  เมื่อสั่งซื้อ ลูกค้ากรอกจำนวนแต่ละรหัส — <strong>ผลรวมจำนวนส่วนประกอบ</strong> (ไม่รวมหลัก) ต้องเท่า
                  <strong>จำนวนสินค้าหลัก</strong> และแต่ละรหัสต้องเพิ่มทีละ <strong>OrderStep</strong> ของสินค้านั้นในตาราง
                  (สินค้าหลักใช้ขั้นตอนการสั่งของชุดด้านบน)
                </p>

                <div className="rounded-lg border border-amber-300/70 bg-white/90 p-3 space-y-2">
                  <label className="block text-xs font-bold text-gray-700">1. สินค้าหลัก (คำนวณราคา)</label>
                  <ProductSearchCombobox
                    products={catalogPickable}
                    value={formData.bundlePrimaryProductId}
                    onChange={(v) => {
                      setFormData((fd) => ({
                        ...fd,
                        bundlePrimaryProductId: v,
                        bundleSecondaryRows: (fd.bundleSecondaryRows || []).map((r) => ({
                          productId: (r.productId || '').trim() === v ? '' : r.productId
                        }))
                      }))
                    }}
                    placeholder="ค้นหาแล้วเลือกสินค้าหลัก..."
                  />
                </div>

                <div className="rounded-lg border border-amber-300/70 bg-white/90 p-3 space-y-3">
                  <label className="block text-xs font-bold text-gray-700">
                    2. สินค้าประกอบ (ผลรวมจำนวน = จำนวนหลักตอนสั่งซื้อ)
                  </label>
                  {(formData.bundleSecondaryRows || []).map((row, idx) => {
                    const primaryId = (formData.bundlePrimaryProductId || '').trim()
                    const takenByOtherRows = new Set(
                      (formData.bundleSecondaryRows || [])
                        .map((r, i) => (i !== idx ? (r.productId || '').trim() : ''))
                        .filter(Boolean)
                    )
                    const secondaryCandidates = catalogPickable.filter(
                      (p) =>
                        (!primaryId || p.id !== primaryId) &&
                        (!takenByOtherRows.has(p.id) || p.id === (row.productId || '').trim())
                    )
                    return (
                      <div
                        key={idx}
                        className="flex flex-wrap gap-2 items-end pb-3 border-b border-amber-100 last:border-0 last:pb-0"
                      >
                        <div className="flex-1 min-w-[200px]">
                          <ProductSearchCombobox
                            products={secondaryCandidates}
                            value={row.productId}
                            onChange={(id) => {
                              const next = [...(formData.bundleSecondaryRows || [])]
                              next[idx] = { ...next[idx], productId: id }
                              setFormData({ ...formData, bundleSecondaryRows: next })
                            }}
                            placeholder="ค้นหาแล้วเลือกสินค้าประกอบ..."
                          />
                        </div>
                        <button
                          type="button"
                          className="text-red-600 text-sm font-bold px-2 py-2 shrink-0"
                          onClick={() => {
                            const rows = formData.bundleSecondaryRows || []
                            if (rows.length <= 1) {
                              setFormData({ ...formData, bundleSecondaryRows: [{ productId: '' }] })
                              return
                            }
                            const nextRows = rows.filter((_, i) => i !== idx)
                            setFormData({ ...formData, bundleSecondaryRows: nextRows })
                          }}
                        >
                          ลบ
                        </button>
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    className="text-sm font-bold text-emerald-800 hover:underline"
                    onClick={() => {
                      setFormData((fd) => ({
                        ...fd,
                        bundleSecondaryRows: [...(fd.bundleSecondaryRows || []), { productId: '' }]
                      }))
                    }}
                  >
                    + เพิ่มแถวส่วนประกอบ
                  </button>

                  {bundlePreviewProduct && allProductsCatalog.length > 0
                    ? (() => {
                        const primary = (formData.bundlePrimaryProductId || '').trim()
                        const secondaryIds = (formData.bundleSecondaryRows || [])
                          .map((r) => (r.productId || '').trim())
                          .filter(Boolean)
                        const orderedIds = [primary, ...secondaryIds]
                        const bundleOrderStep = Math.max(
                          1,
                          parseInt(String(formData.orderStep ?? '1'), 10) || 1
                        )
                        const chk = validateFlexibleBundleSelections(
                          bundlePreviewProduct,
                          bundlePreviewQty,
                          bundlePreviewCatalogMap
                        )
                        return (
                          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                            <div className="text-xs font-bold text-emerald-900">
                              ทดลองจำนวน (เหมือนหน้าร้าน — เพิ่มทีละ OrderStep)
                            </div>
                            <p className="text-[11px] text-emerald-800 leading-relaxed">
                              ผลรวมส่วนประกอบ (ไม่รวมหลัก) ต้องเท่าจำนวนหลัก — ปรับตัวเลขแล้วจะปัดให้หาร OrderStep ของแต่ละรหัสลงตัว
                            </p>
                            <div className="space-y-2">
                              {orderedIds.map((pid) => {
                                const isPrimary = pid === primary
                                const comp = bundlePreviewCatalogMap.get(pid)
                                const step = isPrimary
                                  ? bundleOrderStep
                                  : Math.max(1, Number(comp?.orderStep) || 1)
                                const label =
                                  comp?.name && String(comp.name).trim()
                                    ? `${String(comp.name).trim()} (${pid})`
                                    : pid
                                const val = bundlePreviewQty[pid] ?? (isPrimary ? bundleOrderStep : 0)
                                return (
                                  <div key={pid} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span
                                      className="text-xs font-semibold text-gray-700 min-w-[140px] max-w-[55%] truncate"
                                      title={label}
                                    >
                                      {isPrimary ? 'หลัก · ' : ''}
                                      {label}
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step={step}
                                      className="w-28 border rounded p-1.5 text-right font-mono"
                                      value={Number(val)}
                                      onFocus={(e) => {
                                        requestAnimationFrame(() => {
                                          try {
                                            e.target.select()
                                          } catch (_) {
                                            /* ignore */
                                          }
                                        })
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.ctrlKey || e.metaKey || e.altKey) return
                                        if (e.key.length !== 1 || e.key < '0' || e.key > '9') return
                                        const t = e.target
                                        if (t.selectionStart !== t.selectionEnd) return
                                        if (String(t.value) === '0' && (t.selectionStart ?? 0) === 1) {
                                          const v = snapBundleQtyToStep(e.key, step)
                                          setBundlePreviewQty((prev) => ({ ...prev, [pid]: v }))
                                          e.preventDefault()
                                          requestAnimationFrame(() => {
                                            try {
                                              t.setSelectionRange(1, 1)
                                            } catch (_) {
                                              /* ignore */
                                            }
                                          })
                                        }
                                      }}
                                      onChange={(e) => {
                                        const v = snapBundleQtyToStep(e.target.value, step)
                                        setBundlePreviewQty((prev) => ({ ...prev, [pid]: v }))
                                      }}
                                      onBlur={(e) => {
                                        const v = snapBundleQtyToStep(e.target.value, step)
                                        setBundlePreviewQty((prev) => ({ ...prev, [pid]: v }))
                                      }}
                                    />
                                    <span className="text-[10px] text-gray-500">ทีละ {step}</span>
                                  </div>
                                )
                              })}
                            </div>
                            <p
                              className={`text-xs font-semibold ${chk.ok ? 'text-green-700' : 'text-amber-900'}`}
                            >
                              {chk.ok ? '✓ ผ่านกติกาชุด (ตัวอย่างนี้)' : chk.message}
                            </p>
                          </div>
                        )
                      })()
                    : null}
                </div>
              </div>

              <div className="border border-slate-200 bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="font-bold text-gray-800">ตัวเลือกสินค้า (ถ้ามี)</div>
                <p className="text-xs text-gray-600">
                  เพิ่มตัวเลือกย่อยทีละรายการ พร้อมราคาเพิ่ม (ใส่ 0 ได้ถ้าไม่ต้องบวกเพิ่ม)
                </p>
                {(formData.productOptionRows || []).map((row, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg bg-white p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                      <div className="md:col-span-7">
                        <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อตัวเลือก</label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          placeholder="เช่น สี / ขนาด"
                          value={row.name}
                          onChange={(e) => {
                            const next = [...(formData.productOptionRows || [])]
                            next[idx] = { ...next[idx], name: e.target.value }
                            setFormData({ ...formData, productOptionRows: next })
                          }}
                        />
                      </div>
                      <label className="md:col-span-3 flex items-center gap-2 text-sm mt-5 md:mt-0">
                        <input
                          type="checkbox"
                          checked={row.required}
                          onChange={(e) => {
                            const next = [...(formData.productOptionRows || [])]
                            next[idx] = { ...next[idx], required: e.target.checked }
                            setFormData({ ...formData, productOptionRows: next })
                          }}
                        />
                        บังคับ
                      </label>
                      <button
                        type="button"
                        className="md:col-span-2 text-red-600 text-sm font-bold text-left md:text-right"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            productOptionRows: (formData.productOptionRows || []).filter((_, i) => i !== idx)
                          })
                        }
                      >
                        ลบตัวเลือก
                      </button>
                    </div>

                    {(row.valueRows || []).map((vRow, vIdx) => (
                      <div key={`${idx}-${vIdx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-8">
                          <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อตัวเลือกย่อย</label>
                          <input
                            className="w-full border rounded p-2 text-sm"
                            placeholder="เช่น แดง, น้ำเงิน, XL"
                            value={vRow.label}
                            onChange={(e) => {
                              const next = [...(formData.productOptionRows || [])]
                              const valueRows = [...(next[idx].valueRows || [])]
                              valueRows[vIdx] = { ...valueRows[vIdx], label: e.target.value }
                              next[idx] = { ...next[idx], valueRows }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block text-xs font-bold text-gray-600 mb-1">ราคาเพิ่ม</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full border rounded p-2 text-sm"
                            placeholder="0"
                            value={vRow.price}
                            onChange={(e) => {
                              const next = [...(formData.productOptionRows || [])]
                              const valueRows = [...(next[idx].valueRows || [])]
                              valueRows[vIdx] = { ...valueRows[vIdx], price: e.target.value }
                              next[idx] = { ...next[idx], valueRows }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="md:col-span-1 text-red-600 text-sm font-bold pb-2"
                          onClick={() => {
                            const next = [...(formData.productOptionRows || [])]
                            const filtered = (next[idx].valueRows || []).filter((_, i) => i !== vIdx)
                            next[idx] = { ...next[idx], valueRows: filtered.length ? filtered : [emptyOptionValueRow()] }
                            setFormData({ ...formData, productOptionRows: next })
                          }}
                        >
                          ลบ
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="text-sm font-bold text-emerald-800"
                      onClick={() => {
                        const next = [...(formData.productOptionRows || [])]
                        next[idx] = {
                          ...next[idx],
                          valueRows: [...(next[idx].valueRows || []), emptyOptionValueRow()]
                        }
                        setFormData({ ...formData, productOptionRows: next })
                      }}
                    >
                      + เพิ่มตัวเลือกย่อย
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-bold text-emerald-800"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      productOptionRows: [
                        ...(formData.productOptionRows || []),
                        emptyOptionRow()
                      ]
                    })
                  }
                >
                  + เพิ่มตัวเลือก
                </button>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">รูปภาพ</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full border-2 rounded-lg p-2" />
                {formData.image && (
                  <img src={formData.image} alt="" className="mt-2 w-28 h-28 object-cover rounded-lg border" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">หมวดหมู่</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border-2 rounded-lg p-3"
                  >
                    <option value="">-- เลือก --</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">หน่วย</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full border-2 rounded-lg p-3"
                  >
                    {['ชิ้น', 'กล่อง', 'ลัง', 'ถุง', 'ขวด', 'แพ็ก', 'ใบ', 'กรัม', 'กิโลกรัม', 'ลิตร', 'มิลลิลิตร'].map(
                      (u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">รายละเอียด</label>
                <textarea
                  value={formData.detail}
                  onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
                  rows={3}
                  className="w-full border-2 rounded-lg p-3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ราคาแฟรนไชส์</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.franchisePrice}
                    onChange={(e) => setFormData({ ...formData, franchisePrice: e.target.value })}
                    className="w-full border-2 rounded-lg p-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">น้ำหนัก (กรัม)</label>
                  <input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    className="w-full border-2 rounded-lg p-3"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ซัพพลายเออร์</label>
                <select
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="w-full border-2 rounded-lg p-3"
                >
                  <option value="">-- เลือก --</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 border rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-bold">การแสดงในแคตตาล็อก</p>
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={formData.visibleOnHome !== false}
                    onChange={(e) => setFormData({ ...formData, visibleOnHome: e.target.checked })}
                  />
                  แสดงในหน้าหลัก
                </label>
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={formData.saleRestrictedToUsers === true}
                    onChange={(e) => setFormData({ ...formData, saleRestrictedToUsers: e.target.checked })}
                  />
                  จำกัดเฉพาะอีเมล
                </label>
                {formData.saleRestrictedToUsers && (
                  <>
                    <select
                      key={visibilitySelectSeq}
                      className="w-full border rounded p-2 text-sm"
                      defaultValue=""
                      disabled={visibilityPickLoading}
                      onChange={(e) => {
                        const v = e.target.value
                        if (!v) return
                        setFormData((fd) => ({
                          ...fd,
                          allowedViewerEmailsText: mergeEmailIntoAllowedViewerText(fd.allowedViewerEmailsText, v)
                        }))
                        setVisibilitySelectSeq((n) => n + 1)
                      }}
                    >
                      <option value="">{visibilityPickLoading ? 'กำลังโหลด...' : '-- เพิ่มอีเมล --'}</option>
                      {visibilityPickList.map((c) => (
                        <option key={c.email} value={c.email}>
                          {c.optionLabel}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={formData.allowedViewerEmailsText}
                      onChange={(e) => setFormData({ ...formData, allowedViewerEmailsText: e.target.value })}
                      rows={2}
                      className="w-full border rounded p-2 text-sm"
                    />
                  </>
                )}
                {!formData.saleRestrictedToUsers && (
                  <div className="flex gap-4 text-sm">
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={formData.saleToFranchise !== false}
                        onChange={(e) => setFormData({ ...formData, saleToFranchise: e.target.checked })}
                      />
                      แฟรนไชส์
                    </label>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={formData.saleToRegular !== false}
                        onChange={(e) => setFormData({ ...formData, saleToRegular: e.target.checked })}
                      />
                      ทั่วไป
                    </label>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-4">
                {editingProductId && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const id = (formData.id || editingProductId || '').trim()
                        try {
                          const dataUrl = await generateProductQrDataUrl(id)
                          if (dataUrl) {
                            downloadQrImage(dataUrl, `qr-${id}.png`)
                            Swal.fire({ icon: 'success', title: 'ดาวน์โหลด QR แล้ว', timer: 1200, showConfirmButton: false, toast: true, position: 'top-end' })
                          }
                        } catch (e) {
                          Swal.fire({ icon: 'error', title: 'QR ไม่สำเร็จ', text: e.message })
                        }
                      }}
                      className="px-4 py-3 bg-amber-600 text-white rounded-lg font-bold text-sm"
                    >
                      QR สินค้า
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-4 py-3 bg-red-600 text-white rounded-lg font-bold text-sm"
                    >
                      ลบชุดนี้
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="flex-1 min-w-[140px] bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <Link
                  to="/admin/stock"
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold text-center hover:bg-gray-300"
                >
                  ยกเลิก
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
