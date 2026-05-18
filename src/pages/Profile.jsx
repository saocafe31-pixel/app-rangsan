import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { CART_STORAGE_KEY, LEGACY_CART_STORAGE_KEY } from '../utils/constants'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'

export default function Profile({ user, setUser }) {
  const navigate = useNavigate()
  const [profileForm, setProfileForm] = useState({
    username: '',
    phone: '',
    address: '',
    subdistrict: '',
    district: '',
    province: '',
    postalCode: ''
  })
  const [taxForm, setTaxForm] = useState({
    taxName: '',
    taxId: '',
    taxAddress: ''
  })
  const [loading, setLoading] = useState(false)
  const [taxLoading, setTaxLoading] = useState(false)

  const fetchTaxInfo = async (userEmail) => {
    try {
      // Note: TaxID is all caps in database (not TaxId)
      let { data: userData, error } = await supabase
        .from('users')
        .select('TaxID, TaxName, TaxAddress')
        .eq('Email', userEmail)
        .maybeSingle()
      
      if (error || !userData) {
        const result = await supabase
          .from('users')
          .select('TaxID, TaxName, TaxAddress')
          .eq('email', userEmail)
          .maybeSingle()
        userData = result.data
        error = result.error
      }
      
      if (!error && userData) {
        const taxName = userData.TaxName || ''
        const taxId = userData.TaxID || ''
        const taxAddress = userData.TaxAddress || ''
        
        setTaxForm({
          taxName: taxName,
          taxId: taxId,
          taxAddress: taxAddress
        })
      }
    } catch (error) {
      console.error('Error fetching tax info:', error)
    }
  }

  useEffect(() => {
    if (user) {
      setProfileForm({
        username: user.username || '',
        phone: user.phone || '',
        address: user.address || '',
        subdistrict: user.subdistrict || '',
        district: user.district || '',
        province: user.province || '',
        postalCode: user.postalCode || ''
      })
      
      // Load tax information from user object or fetch from database
      setTaxForm({
        taxName: user.taxName || '',
        taxId: user.taxId || '',
        taxAddress: user.taxAddress || ''
      })
      
      // Fetch tax information from database if not in user object
      if (!user.taxId && user.email) {
        fetchTaxInfo(user.email)
      }
      // โหลดที่อยู่แยกส่วนจาก DB (ตำบล อำเภอ จังหวัด รหัสไปรษณีย์)
      if (user.email) {
        supabase.from('users').select('Subdistrict, District, Province, PostalCode').eq('Email', user.email).maybeSingle()
          .then(({ data }) => {
            if (data) {
              setProfileForm((prev) => ({
                ...prev,
                subdistrict: data.Subdistrict || '',
                district: data.District || '',
                province: data.Province || '',
                postalCode: data.PostalCode || ''
              }))
            }
          })
          .catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase
        .from('users')
        .update({
          Username: profileForm.username,
          Phone: profileForm.phone,
          Address: profileForm.address,
          Subdistrict: profileForm.subdistrict || null,
          District: profileForm.district || null,
          Province: profileForm.province || null,
          PostalCode: profileForm.postalCode || null
        })
        .eq('Email', user.email)

      if (error) {
        throw error
      }

      // Update local user state
      const updatedUser = {
        ...user,
        username: profileForm.username,
        phone: profileForm.phone,
        address: profileForm.address,
        subdistrict: profileForm.subdistrict,
        district: profileForm.district,
        province: profileForm.province,
        postalCode: profileForm.postalCode
      }
      setUser(updatedUser)
      localStorage.setItem('partner_user', JSON.stringify(updatedUser))

      Swal.fire({
        icon: 'success',
        title: 'อัปเดตข้อมูลสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error updating profile:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตข้อมูลได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRequestFranchise = async () => {
    const result = await Swal.fire({
      title: 'ร้องขอเปลี่ยนเป็น Franchise?',
      html: `
        <p>คุณต้องการร้องขอเปลี่ยน UserType เป็น <strong>Franchise</strong> หรือไม่?</p>
        <p class="text-sm text-gray-600 mt-2">Admin จะพิจารณาและอนุมัติคำขอของคุณ</p>
        <textarea id="request-notes" class="swal2-textarea" placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)" style="width:100%; margin-top:10px; padding:10px; border:1px solid #ddd; border-radius:5px;"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'ส่งคำขอ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      preConfirm: () => {
        return document.getElementById('request-notes').value
      }
    })

    if (result.isConfirmed) {
      try {
        // Check if there's already a pending request
        const { data: existingRequest } = await supabase
          .from('user_approvals')
          .select('*')
          .eq('useremail', user.email)
          .eq('status', 'pending')
          .maybeSingle()

        if (existingRequest) {
          Swal.fire({
            icon: 'warning',
            title: 'มีคำขอที่รออนุมัติอยู่',
            text: 'คุณมีคำขอที่รออนุมัติอยู่แล้ว กรุณารอ Admin อนุมัติ',
            confirmButtonText: 'ตกลง'
          })
          return
        }

        // Create new approval request
        const { error } = await supabase
          .from('user_approvals')
          .insert({
            useremail: user.email,
            requested_usertype: 'franchise',
            status: 'pending',
            admin_notes: result.value || null
          })

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'ส่งคำขอสำเร็จ',
          text: 'คำขอของคุณถูกส่งไปยัง Admin แล้ว คุณจะได้รับการแจ้งเตือนเมื่อได้รับการอนุมัติ',
          confirmButtonText: 'ตกลง'
        })
      } catch (error) {
        console.error('Error requesting franchise:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถส่งคำขอได้',
          confirmButtonText: 'ตกลง'
        })
      }
    }
  }

  const handleUpdateTaxInfo = async (e) => {
    e.preventDefault()
    setTaxLoading(true)

    try {
      // Note: TaxID is all caps in database (not TaxId)
      const updateData = {
        TaxID: taxForm.taxId,
        TaxName: taxForm.taxName,
        TaxAddress: taxForm.taxAddress
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('Email', user.email)

      if (error) {
        // Try with lowercase email
        const { error: error2 } = await supabase
          .from('users')
          .update(updateData)
          .eq('email', user.email)
        
        if (error2) {
          throw error2
        }
      }

      // Update local user state
      const updatedUser = {
        ...user,
        taxName: taxForm.taxName,
        taxId: taxForm.taxId,
        taxAddress: taxForm.taxAddress
      }
      setUser(updatedUser)
      localStorage.setItem('partner_user', JSON.stringify(updatedUser))

      Swal.fire({
        icon: 'success',
        title: 'บันทึกข้อมูลภาษีสำเร็จ',
        text: 'ข้อมูลภาษีถูกบันทึกเรียบร้อยแล้ว',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error updating tax info:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกข้อมูลภาษีได้'
      })
    } finally {
      setTaxLoading(false)
    }
  }

  const hasLeftSidebar = user?.role === 'admin' || user?.userType === 'franchise' || user?.customerType === 'franchise'

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        {hasLeftSidebar && <Sidebar user={user} />}
        <div className={`flex-1 ${hasLeftSidebar ? 'ml-0 md:ml-64' : ''} p-6 pt-20`}>
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">ข้อมูลส่วนตัว</h1>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Icon icon="fa-envelope" className="mr-2" />
                อีเมล
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full border-2 border-gray-200 rounded-lg p-3 bg-gray-50 text-gray-500"
              />
            </div>

            {user?.role !== 'admin' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Icon icon="fa-tag" className="mr-2" />
                ประเภทลูกค้า
              </label>
              <div className="w-full border-2 border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                    (user?.userType || user?.customerType || 'regular').toLowerCase() === 'franchise'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    <Icon icon={user?.userType?.toLowerCase() === 'franchise' || user?.customerType?.toLowerCase() === 'franchise' ? 'fa-store' : 'fa-user'} className="mr-2" />
                    {(user?.userType || user?.customerType || 'regular').toLowerCase() === 'franchise' ? 'Franchise' : 'Regular'}
                  </span>
                  {(user?.userType || user?.customerType || 'regular').toLowerCase() === 'regular' && (
                    <button
                      type="button"
                      onClick={handleRequestFranchise}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition"
                    >
                      <Icon icon="fa-store" className="mr-1" />
                      ร้องขอเป็น Franchise
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {(user?.userType || user?.customerType || 'regular').toLowerCase() === 'franchise'
                    ? 'คุณคือลูกค้าแฟรนไชส์ จะได้รับราคาพิเศษสำหรับสินค้า'
                    : 'คุณคือลูกค้ารังสรรค์ จะได้รับราคาปกติสำหรับสินค้า'}
                </p>
              </div>
            </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Icon icon="fa-user" className="mr-2" />
                ชื่อผู้ใช้
              </label>
              <input
                type="text"
                value={profileForm.username}
                onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="กรอกชื่อผู้ใช้"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Icon icon="fa-phone" className="mr-2" />
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="กรอกเบอร์โทรศัพท์"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Icon icon="fa-map-marker-alt" className="mr-2" />
                ที่อยู่
              </label>
              <textarea
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                rows={2}
                className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="เลขที่ ถนน หมู่บ้าน ฯลฯ"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ตำบล</label>
                <input
                  type="text"
                  value={profileForm.subdistrict}
                  onChange={(e) => setProfileForm({ ...profileForm, subdistrict: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="ตำบล"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">อำเภอ</label>
                <input
                  type="text"
                  value={profileForm.district}
                  onChange={(e) => setProfileForm({ ...profileForm, district: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="อำเภอ"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">จังหวัด</label>
                <input
                  type="text"
                  value={profileForm.province}
                  onChange={(e) => setProfileForm({ ...profileForm, province: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="จังหวัด"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">รหัสไปรษณีย์</label>
                <input
                  type="text"
                  value={profileForm.postalCode}
                  onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="รหัสไปรษณีย์ 5 หลัก"
                  maxLength={10}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">แยกที่อยู่สำหรับใช้ในรายงานจัดส่งและใบปะหน้าพัสดุ</p>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </form>
        </div>

        {/* Tax Information Section - Only show for non-admin users */}
        {user?.role !== 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">ข้อมูลภาษี</h2>
            <p className="text-sm text-gray-600 mb-4">
              กรอกข้อมูลภาษีเพื่อใช้ในการออกใบกำกับภาษี (ถ้ามี)
            </p>
            
            <form onSubmit={handleUpdateTaxInfo} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  <Icon icon="fa-building" className="mr-2" />
                  ชื่อบริษัท / ผู้เสียภาษี
                </label>
                <input
                  type="text"
                  value={taxForm.taxName}
                  onChange={(e) => setTaxForm({ ...taxForm, taxName: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="กรอกชื่อบริษัทหรือชื่อผู้เสียภาษี"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  <Icon icon="fa-id-card" className="mr-2" />
                  เลขประจำตัวผู้เสียภาษี
                </label>
                <input
                  type="text"
                  value={taxForm.taxId}
                  onChange={(e) => setTaxForm({ ...taxForm, taxId: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="ระบุเลข 13 หลัก"
                  maxLength={13}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  <Icon icon="fa-map-marker-alt" className="mr-2" />
                  ที่อยู่ (ตามหน้าบัตรหรือ ภ.พ. 20)
                </label>
                <textarea
                  value={taxForm.taxAddress}
                  onChange={(e) => setTaxForm({ ...taxForm, taxAddress: e.target.value })}
                  rows={3}
                  className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="กรอกที่อยู่ตามบัตรประชาชนหรือ ภ.พ. 20"
                />
              </div>

              <button
                type="submit"
                disabled={taxLoading}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {taxLoading ? 'กำลังบันทึก...' : 'บันทึกข้อมูลภาษี'}
              </button>
            </form>
          </div>
        )}

        {/* Logout Button */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={async () => {
              const result = await Swal.fire({
                title: 'ออกจากระบบ?',
                text: 'คุณต้องการออกจากระบบหรือไม่?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ออกจากระบบ',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
              })

              if (result.isConfirmed) {
                // Clear user data
                localStorage.removeItem('partner_user')
                localStorage.removeItem(CART_STORAGE_KEY)
                localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
                setUser(null)
                
                Swal.fire({
                  icon: 'success',
                  title: 'ออกจากระบบสำเร็จ',
                  timer: 1500,
                  showConfirmButton: false
                }).then(() => {
                  navigate('/login')
                })
              }
            }}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition flex items-center justify-center gap-2"
          >
            <Icon icon="fa-sign-out-alt" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}
