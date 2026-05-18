/**
 * รายการสินค้าซัพนอก (other_supplier_products)
 * ใช้ดึงรายการเบื้องต้นที่สาขาเลือกเพิ่มเข้าสต็อกได้
 */
import { supabase } from '../utils/supabase'

const TABLE = 'other_supplier_products'

export const otherSupplierProductsService = {
  /**
   * ดึงรายการสินค้าซัพนอกทั้งหมด (เรียงตามชื่อ)
   */
  async getAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, productid, productname, stock, minstock, price, supplier, image, unit')
      .order('productname', { ascending: true })

    if (error) throw new Error(error.message || 'ไม่สามารถดึงรายการสินค้าซัพนอกได้')
    return (data || []).map(row => ({
      dbUuid: row.id ?? row.Id,
      id: row.productid ?? row.productId,
      ProductID: row.productid,
      productid: row.productid,
      name: row.productname,
      ProductName: row.productname,
      productname: row.productname,
      stock: Number(row.stock) || 0,
      minStock: Number(row.minstock) ?? 5,
      minstock: Number(row.minstock) ?? 5,
      price: Number(row.price) || 0,
      supplier: (row.supplier || '').toString().trim() || 'ซัพอื่นๆ',
      image: (row.image || '').toString().trim() || null,
      unit: (row.unit || '').toString().trim() || 'ชิ้น'
    }))
  },

  /**
   * อัปเดตรายการสินค้าซัพนอก (รูปภาพ, ซัพพลาย, ราคา, หน่วย)
   */
  async update(productId, payload, options = {}) {
    const id = String(productId ?? '').trim()
    if (!id) throw new Error('รหัสสินค้าไม่ถูกต้อง')
    const updates = {}
    if (payload.image !== undefined) updates.image = payload.image == null || payload.image === '' ? null : String(payload.image).trim()
    if (payload.supplier !== undefined) updates.supplier = payload.supplier == null ? null : String(payload.supplier).trim()
    if (payload.price !== undefined) updates.price = Number(payload.price) >= 0 ? Number(payload.price) : 0
    if (payload.unit !== undefined) updates.unit = payload.unit == null ? null : String(payload.unit).trim()
    if (Object.keys(updates).length === 0) return { success: true }

    const updateByProductId = () => supabase.from(TABLE).update(updates).eq('productid', id)
    const updateById = () => options.dbUuid && supabase.from(TABLE).update(updates).eq('id', options.dbUuid)

    let { data, error } = await updateByProductId().select('productid, image')
    if (error) throw new Error(error.message || 'ไม่สามารถอัปเดตได้')
    if (data?.length) return { success: true }

    if (options.dbUuid) {
      const res = await updateById().select('productid, image')
      if (res.error) throw new Error(res.error.message || 'ไม่สามารถอัปเดตได้')
      if (res.data?.length) return { success: true }
    }

    throw new Error('อัปเดตไม่สำเร็จหรือไม่พบรายการ — ตรวจสอบรหัสสินค้าในตารางตรงกับ ' + id)
  },

  /**
   * เพิ่มรายการสินค้าซัพนอกใหม่
   */
  async create({ productid, productname, supplier, price, unit, image }) {
    const id = String(productid ?? '').trim()
    const name = String(productname ?? '').trim()
    if (!id || !name) throw new Error('กรุณาระบุรหัสและชื่อสินค้า')

    const { error } = await supabase
      .from(TABLE)
      .insert({
        productid: id,
        productname: name,
        supplier: (supplier || '').toString().trim() || null,
        price: Number(price) >= 0 ? Number(price) : 0,
        unit: (unit || '').toString().trim() || 'ชิ้น',
        image: (image || '').toString().trim() || null
      })

    if (error) {
      if (error.code === '23505') throw new Error('รหัสสินค้านี้มีอยู่แล้ว')
      throw new Error(error.message || 'ไม่สามารถเพิ่มสินค้าได้')
    }
    return { success: true }
  },

  /**
   * นำเข้าหรืออัปเดตหลายรายการจาก CSV (upsert ตาม productid)
   * แต่ละแถวต้องมี productid, productname ที่ไม่ว่าง
   */
  async upsertBulk(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('ไม่มีข้อมูลที่จะนำเข้า')
    const payload = rows.map((r) => {
      const productid = String(r.productid ?? '').trim()
      const productname = String(r.productname ?? '').trim()
      if (!productid || !productname) return null
      return {
        productid,
        productname,
        stock: Number(r.stock) >= 0 ? Number(r.stock) : 0,
        minstock: Number(r.minstock) >= 0 ? Number(r.minstock) : 5,
        price: Number(r.price) >= 0 ? Number(r.price) : 0,
        supplier: (r.supplier ?? '').toString().trim() || null,
        image: (r.image ?? '').toString().trim() || null,
        unit: (r.unit ?? '').toString().trim() || 'ชิ้น'
      }
    }).filter(Boolean)
    if (payload.length === 0) throw new Error('ไม่มีแถวที่ valid (ต้องมีรหัสและชื่อสินค้า)')
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'productid' })
    if (error) throw new Error(error.message || 'นำเข้าไม่สำเร็จ')
    return { success: true, count: payload.length }
  }
}
