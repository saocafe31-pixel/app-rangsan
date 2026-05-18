import { supabase } from '../utils/supabase'

export const imageService = {
  // Upload image to Supabase Storage
  async uploadImage(file, bucket = 'product-images') {
    if (!file) return null

    try {
      // ล็อกอินแบบตาราง users ไม่มี Supabase JWT — อัปโหลดใช้บทบาท anon (ต้องมี policy storage_product_images_insert_anon)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = fileName

      // Upload file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath)

      return urlData.publicUrl
    } catch (error) {
      console.error('Error uploading image:', error)
      throw new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${error.message}`)
    }
  },

  /**
   * อัปโหลดรูปสินค้าซัพนอก (PNG / JPEG) ไป bucket product-images โฟลเดอร์ other-supplier/
   */
  async uploadOtherSupplierProductImage(file) {
    if (!file) return null
    const type = (file.type || '').toLowerCase()
    const allowed = ['image/png', 'image/jpeg', 'image/jpg']
    if (!allowed.includes(type)) {
      throw new Error('รองรับเฉพาะไฟล์ PNG และ JPEG')
    }
    const ext = type === 'image/png' ? 'png' : 'jpg'
    try {
      const fileName = `other-supplier/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: type === 'image/png' ? 'image/png' : 'image/jpeg'
        })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
      return urlData.publicUrl
    } catch (error) {
      console.error('Error uploading other supplier image:', error)
      throw new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${error.message}`)
    }
  },

  /**
   * URL สำหรับแสดงรูปจาก bucket product-images (รองรับ bucket แบบ private — ใช้ signed URL)
   */
  async getProductImagesBucketDisplayUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null
    const u = imageUrl.trim()
    if (!u) return null
    const m = u.match(/\/storage\/v1\/object\/(?:public|sign)\/product-images\/(.+?)(?:\?|$)/)
    if (!m) return u
    let path = m[1]
    try {
      path = decodeURIComponent(path)
    } catch {
      /* keep path */
    }
    try {
      const { data, error } = await supabase.storage.from('product-images').createSignedUrl(path, 60 * 60 * 24)
      if (!error && data?.signedUrl) return data.signedUrl
    } catch (e) {
      console.warn('[imageService] signed URL fallback to public:', e)
    }
    return u
  },

  // Upload order slip
  async uploadOrderSlip(file, orderId, userEmail = null) {
    if (!file) return null

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      
      // Create user-specific path if userEmail is provided
      // This helps with RLS policies - files are organized by user
      const filePath = userEmail 
        ? `${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}/${fileName}`
        : fileName

      // Upload file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('order-slips')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Upload error details:', uploadError)
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('order-slips')
        .getPublicUrl(filePath)

      return urlData.publicUrl
    } catch (error) {
      console.error('Error uploading order slip:', error)
      throw new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${error.message}`)
    }
  },

  /** อัปโหลดรูปลายเซ็น (จาก canvas blob) ใช้ในตั้งค่าข้อมูลร้าน */
  async uploadSignature(blob) {
    if (!blob || !(blob instanceof Blob)) return null
    const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
    const filePath = `signatures/${file.name}`
    try {
      const { error: uploadError } = await supabase.storage
        .from('order-slips')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('order-slips').getPublicUrl(filePath)
      return urlData.publicUrl
    } catch (error) {
      console.error('Error uploading signature:', error)
      throw new Error(`อัปโหลดลายเซ็นไม่สำเร็จ: ${error.message}`)
    }
  }
}
