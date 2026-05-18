/**
 * packingService – บันทึก/ดึงข้อมูลการแพ็กสินค้าลงกล่อง (order_packing)
 */
import { supabase } from '../utils/supabase'

const TABLE = 'order_packing'

export const packingService = {
  /** บันทึกข้อมูลกล่องของออเดอร์ (แทนที่ทั้งหมด) */
  async savePacking(orderId, boxes) {
    if (!orderId || !Array.isArray(boxes)) {
      throw new Error('orderId และ boxes จำเป็น')
    }
    const { error: delError } = await supabase
      .from(TABLE)
      .delete()
      .eq('order_id', orderId)
    if (delError) throw new Error(delError.message)

    if (boxes.length === 0) return { success: true }

    const rows = boxes.map((box, i) => ({
      order_id: orderId,
      box_index: i + 1,
      size: box.size || '',
      weight_kg: Number(box.weight_kg) || 0,
      items: box.items || []
    }))
    const { error: insertError } = await supabase.from(TABLE).insert(rows)
    if (insertError) throw new Error(insertError.message)
    return { success: true }
  },

  /** ดึงข้อมูลการแพ็กของออเดอร์ */
  async getPacking(orderId) {
    if (!orderId) return []
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('order_id', orderId)
      .order('box_index', { ascending: true })
    if (error) throw new Error(error.message)
    return (data || []).map((row) => ({
      box_index: row.box_index,
      size: row.size,
      weight_kg: row.weight_kg ?? row.weight_Kg ?? 0,
      items: row.items || []
    }))
  }
}
