import { supabase } from '../utils/supabase'

function addUniqueNames(set, items, key) {
  if (!items) return
  items.forEach((item) => {
    const name = item[key] || item[key.toLowerCase()]
    if (name && String(name).trim() !== '') set.add(String(name).trim())
  })
}

export const supplierService = {
  /** ดึงรายการจากตาราง suppliers (สำหรับหน้า Admin) */
  async getSuppliersFromTable() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  },

  /** เพิ่มซัพพลายเออร์ในตาราง suppliers */
  async createSupplier({ name, contact = '', phone = '' }) {
    const n = (name || '').trim()
    if (!n) throw new Error('กรุณาระบุชื่อซัพพลายเออร์')
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name: n, contact: (contact || '').trim(), phone: (phone || '').trim() })
      .select()
      .single()
    if (error) throw error
    return data
  },

  /** แก้ไขซัพพลายเออร์ */
  async updateSupplier(id, { name, contact, phone }) {
    const body = {}
    if (name !== undefined) body.name = String(name).trim()
    if (contact !== undefined) body.contact = String(contact).trim()
    if (phone !== undefined) body.phone = String(phone).trim()
    if (Object.keys(body).length === 0) return
    const { data, error } = await supabase
      .from('suppliers')
      .update(body)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /** ลบซัพพลายเออร์ */
  async deleteSupplier(id) {
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) throw error
  },

  // Get all unique supplier names (from table + purchase_orders + products) for dropdowns
  async getAllSuppliers() {
    try {
      const nameSet = new Set()

      const fromTable = await this.getSuppliersFromTable().catch(() => [])
      fromTable.forEach((s) => nameSet.add((s.name || '').trim()))

      const { data: poSuppliers } = await supabase
        .from('purchase_orders')
        .select('supplier')
        .not('supplier', 'is', null)
        .neq('supplier', '')
      addUniqueNames(nameSet, poSuppliers, 'supplier')

      const { data: productSuppliers } = await supabase
        .from('products')
        .select('Supplier')
        .not('Supplier', 'is', null)
        .neq('Supplier', '')
      addUniqueNames(nameSet, productSuppliers, 'Supplier')

      return Array.from(nameSet).filter(Boolean).sort()
    } catch (error) {
      console.error('Error fetching suppliers:', error)
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูลซัพพลายเออร์ได้')
    }
  },

  /** ใช้เมื่อสร้าง PO/สินค้า – ถ้ามีตาราง suppliers จะ validate ชื่อเท่านั้น (การเพิ่มเก็บใน PO/products) */
  async addSupplier(supplierName) {
    const n = (supplierName || '').trim()
    if (!n) throw new Error('กรุณาระบุชื่อซัพพลายเออร์')
    return { success: true, supplier: n }
  }
}
