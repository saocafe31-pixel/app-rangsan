import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'

const FRANCHISE_EXPIRE_DAYS = 1095 // 3 ปี

export default function AdminUserApproval({ user }) {
  const [approvals, setApprovals] = useState([])
  const [franchiseUsers, setFranchiseUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingFranchise, setLoadingFranchise] = useState(false)
  const [activeTab, setActiveTab] = useState('franchise') // 'franchise' | 'pending' | 'history'

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchApprovals()
      fetchFranchiseUsers()
    }
  }, [user])

  const fetchApprovals = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_approvals')
        .select('*')
        .order('createdat', { ascending: false })

      if (error) {
        console.error('Error fetching approvals:', error)
        return
      }

      setApprovals(data || [])
    } catch (error) {
      console.error('Error fetching approvals:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFranchiseUsers = async () => {
    if (user?.role !== 'admin') return
    setLoadingFranchise(true)
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('Email, Username, BranchId, UserType')
        .eq('UserType', 'franchise')

      if (usersError) throw usersError

      const { data: approvedRows, error: approvalsError } = await supabase
        .from('user_approvals')
        .select('useremail, reviewedat')
        .eq('requested_usertype', 'franchise')
        .eq('status', 'approved')
        .not('reviewedat', 'is', null)
        .order('reviewedat', { ascending: false })

      if (approvalsError) throw approvalsError

      const approvedByEmail = new Map()
      ;(approvedRows || []).forEach((row) => {
        const email = (row.useremail || '').toLowerCase()
        if (!approvedByEmail.has(email)) approvedByEmail.set(email, row.reviewedat)
      })

      const now = new Date()
      const list = []

      for (const u of usersData || []) {
        const email = u.Email || u.email
        if (!email) continue
        const reviewedat = approvedByEmail.get(email.toLowerCase())
        if (!reviewedat) continue
        const approvedDate = new Date(reviewedat)
        const expiresAt = new Date(approvedDate)
        expiresAt.setDate(expiresAt.getDate() + FRANCHISE_EXPIRE_DAYS)

        if (expiresAt < now) {
          await revokeFranchiseToRegular(email, null, 'หมดอายุ 3 ปี (ระบบอัปเดตอัตโนมัติ)')
          continue
        }

        list.push({
          email,
          username: u.Username || u.username || '-',
          branchId: u.BranchId || u.branchid || '-',
          approvedAt: reviewedat,
          expiresAt: expiresAt.toISOString()
        })
      }

      setFranchiseUsers(list)
    } catch (error) {
      console.error('Error fetching franchise users:', error)
      setFranchiseUsers([])
    } finally {
      setLoadingFranchise(false)
    }
  }

  const revokeFranchiseToRegular = async (useremail, adminEmail, adminNotes) => {
    const { error: userErr } = await supabase
      .from('users')
      .update({ UserType: 'regular' })
      .eq('Email', useremail)
    if (userErr) throw userErr

    await supabase.from('user_approvals').insert({
      useremail,
      requested_usertype: 'regular',
      status: 'approved',
      admin_email: adminEmail || null,
      admin_notes: adminNotes || null,
      reviewedat: new Date().toISOString()
    })

    await supabase.from('notifications').insert({
      useremail,
      type: 'user_approval',
      title: 'บัญชีถูกเปลี่ยนเป็นลูกค้าปกติ',
      message: 'บัญชีของคุณถูกเปลี่ยนเป็นลูกค้าปกติแล้ว กรุณาเข้าสู่ระบบใหม่',
      read: false
    })
  }

  const handleRevokeFranchise = async (franchiseUser) => {
    const result = await Swal.fire({
      title: 'เปลี่ยนเป็นลูกค้าปกติ?',
      html: `
        <div class="text-left">
          <p class="mb-2">ผู้ใช้: <strong>${franchiseUser.email}</strong></p>
          <p class="mb-4">เมื่อเปลี่ยนแล้ว ผู้ใช้จะถูกออกจากระบบอัตโนมัติ และต้องเข้าสู่ระบบใหม่</p>
          <label class="block text-sm font-bold text-gray-700 mb-2">เหตุผล/หมายเหตุ (เช่น ทำผิดสัญญา)</label>
          <textarea id="revoke-notes" class="swal2-textarea" placeholder="ระบุเหตุผล (ไม่บังคับ)" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:5px;"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'เปลี่ยนเป็นลูกค้าปกติ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      preConfirm: () => document.getElementById('revoke-notes')?.value?.trim() || null
    })

    if (!result.isConfirmed) return

    try {
      Swal.fire({ title: 'กำลังดำเนินการ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false })
      await revokeFranchiseToRegular(franchiseUser.email, user?.email || null, result.value || 'แอดมินเปลี่ยนเป็นลูกค้าปกติ')
      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'เปลี่ยนสำเร็จ',
        text: 'ผู้ใช้จะถูกออกจากระบบเมื่อโหลดหน้าถัดไป กรุณาแจ้งให้ผู้ใช้เข้าสู่ระบบใหม่'
      })
      fetchFranchiseUsers()
      fetchApprovals()
    } catch (error) {
      Swal.close()
      console.error('Error revoking franchise:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเปลี่ยนได้'
      })
    }
  }

  const handleRenewFranchise = async (franchiseUser) => {
    const result = await Swal.fire({
      title: 'ต่ออายุแฟรนไชส์?',
      html: `
        <div class="text-left">
          <p class="mb-2">ผู้ใช้: <strong>${franchiseUser.username}</strong> (${franchiseUser.email})</p>
          <p class="mb-4 text-sm text-gray-600">ต่ออายุแล้วจะนับ 1,095 วัน (3 ปี) ใหม่จากวันนี้</p>
          <label class="block text-sm font-bold text-gray-700 mb-2">หมายเหตุ (ไม่บังคับ)</label>
          <textarea id="renew-notes" class="swal2-textarea" placeholder="เช่น ต่ออายุตามสัญญา" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:5px;"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'ต่ออายุ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      preConfirm: () => document.getElementById('renew-notes')?.value?.trim() || null
    })

    if (!result.isConfirmed) return

    try {
      Swal.fire({ title: 'กำลังต่ออายุ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false })
      const reviewedat = new Date().toISOString()
      await supabase.from('user_approvals').insert({
        useremail: franchiseUser.email,
        requested_usertype: 'franchise',
        status: 'approved',
        admin_email: user?.email || null,
        admin_notes: result.value ? `ต่ออายุแฟรนไชส์: ${result.value}` : 'ต่ออายุแฟรนไชส์',
        reviewedat
      })
      await supabase.from('notifications').insert({
        useremail: franchiseUser.email,
        type: 'user_approval',
        title: 'ต่ออายุแฟรนไชส์',
        message: 'บัญชีแฟรนไชส์ของคุณได้รับการต่ออายุแล้ว อายุใหม่ 3 ปีนับจากวันนี้',
        read: false
      })
      Swal.close()
      Swal.fire({ icon: 'success', title: 'ต่ออายุสำเร็จ', text: 'อายุแฟรนไชส์ถูกรีเซ็ตเป็น 3 ปีจากวันนี้' })
      fetchFranchiseUsers()
      fetchApprovals()
    } catch (error) {
      Swal.close()
      console.error('Error renewing franchise:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถต่ออายุได้'
      })
    }
  }

  const handleApprove = async (approval) => {
    // Check if requesting franchise - need BranchId
    const needsBranchId = approval.requested_usertype === 'franchise'
    
    const result = await Swal.fire({
      title: 'อนุมัติการเปลี่ยน UserType?',
      html: `
        <div class="text-left">
          <p class="mb-2">ผู้ใช้: <strong>${approval.useremail}</strong></p>
          <p class="mb-4">ร้องขอเปลี่ยนเป็น: <strong>${approval.requested_usertype}</strong></p>
          ${needsBranchId ? `
            <label class="block text-sm font-bold text-gray-700 mb-2">Branch ID *</label>
            <input 
              id="branch-id" 
              type="text" 
              placeholder="กรอก Branch ID (เช่น BR001, สาขา 1, ฯลฯ)" 
              class="swal2-input mb-4" 
              required
            />
            <p class="text-xs text-gray-500 mb-4">Branch ID ใช้สำหรับการจัดการสต็อกของแฟรนไชส์</p>
          ` : ''}
          <label class="block text-sm font-bold text-gray-700 mb-2">หมายเหตุ (ไม่บังคับ)</label>
          <textarea id="admin-notes" class="swal2-textarea" placeholder="หมายเหตุ..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:5px;"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'อนุมัติ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      preConfirm: () => {
        if (needsBranchId) {
          const branchId = document.getElementById('branch-id').value.trim()
          if (!branchId) {
            Swal.showValidationMessage('กรุณากรอก Branch ID')
            return false
          }
          return {
            branchId: branchId,
            notes: document.getElementById('admin-notes').value || null
          }
        }
        return {
          branchId: null,
          notes: document.getElementById('admin-notes').value || null
        }
      }
    })

    if (result.isConfirmed) {
      try {
        const approvalData = result.value || {}
        const branchId = approvalData.branchId || null
        const adminNotes = approvalData.notes || null
        
        // Update user_approvals status
        const { error: updateError } = await supabase
          .from('user_approvals')
          .update({
            status: 'approved',
            admin_email: user.email,
            admin_notes: adminNotes,
            reviewedat: new Date().toISOString()
          })
          .eq('id', approval.id)

        if (updateError) throw updateError

        // Update users table - change UserType and BranchId (if franchise)
        const updateData = {
          UserType: approval.requested_usertype
        }
        
        // Add BranchId if requesting franchise
        if (approval.requested_usertype === 'franchise' && branchId) {
          updateData.BranchId = branchId
        }
        
        const { error: userUpdateError } = await supabase
          .from('users')
          .update(updateData)
          .eq('Email', approval.useremail)

        if (userUpdateError) throw userUpdateError

        // Create notification for user
        let notificationMessage = `การร้องขอเปลี่ยน UserType เป็น "${approval.requested_usertype}" ได้รับการอนุมัติแล้ว`
        if (approval.requested_usertype === 'franchise' && branchId) {
          notificationMessage += `\nBranch ID: ${branchId}`
        }
        
        await supabase
          .from('notifications')
          .insert({
            useremail: approval.useremail,
            type: 'user_approval',
            title: 'อนุมัติการเปลี่ยน UserType',
            message: notificationMessage,
            read: false
          })

        Swal.fire({
          icon: 'success',
          title: 'อนุมัติสำเร็จ',
          html: `
            <div class="text-left">
              <p class="mb-2">UserType ถูกอัพเดทแล้ว</p>
              ${approval.requested_usertype === 'franchise' && branchId ? `
                <p class="text-sm text-gray-600">Branch ID: <strong>${branchId}</strong></p>
              ` : ''}
            </div>
          `,
          confirmButtonText: 'ตกลง'
        })

        // Dispatch event to refresh sidebar counts
        window.dispatchEvent(new CustomEvent('userApprovalUpdated'))
        
        fetchApprovals()
      } catch (error) {
        console.error('Error approving:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถอนุมัติได้',
          confirmButtonText: 'ตกลง'
        })
      }
    }
  }

  const handleReject = async (approval) => {
    const result = await Swal.fire({
      title: 'ปฏิเสธการเปลี่ยน UserType?',
      html: `
        <p>ผู้ใช้: <strong>${approval.useremail}</strong></p>
        <p>ร้องขอเปลี่ยนเป็น: <strong>${approval.requested_usertype}</strong></p>
        <textarea id="admin-notes" class="swal2-textarea" placeholder="เหตุผลในการปฏิเสธ (ไม่บังคับ)" style="width:100%; margin-top:10px; padding:10px; border:1px solid #ddd; border-radius:5px;"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'ปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      preConfirm: () => {
        return document.getElementById('admin-notes').value
      }
    })

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('user_approvals')
          .update({
            status: 'rejected',
            admin_email: user.email,
            admin_notes: result.value || null,
            reviewedat: new Date().toISOString()
          })
          .eq('id', approval.id)

        if (error) throw error

        // Create notification for user
        await supabase
          .from('notifications')
          .insert({
            useremail: approval.useremail,
            type: 'user_approval',
            title: 'ปฏิเสธการเปลี่ยน UserType',
            message: `การร้องขอเปลี่ยน UserType เป็น "${approval.requested_usertype}" ถูกปฏิเสธ${result.value ? ': ' + result.value : ''}`,
            read: false
          })

        Swal.fire({
          icon: 'info',
          title: 'ปฏิเสธสำเร็จ',
          text: 'ผู้ใช้ได้รับการแจ้งเตือนแล้ว',
          confirmButtonText: 'ตกลง'
        })

        fetchApprovals()
      } catch (error) {
        console.error('Error rejecting:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถปฏิเสธได้',
          confirmButtonText: 'ตกลง'
        })
      }
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'pending':
        return 'รออนุมัติ'
      case 'approved':
        return 'อนุมัติแล้ว'
      case 'rejected':
        return 'ปฏิเสธ'
      default:
        return status
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return dateStr
    }
  }

  const pendingApprovals = approvals.filter(a => a.status === 'pending')
  const processedApprovals = approvals.filter(a => a.status !== 'pending')

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold text-gray-900">อนุมัติการเปลี่ยน UserType</h1>
              <button
                onClick={() => { fetchApprovals(); fetchFranchiseUsers() }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
              >
                <Icon icon="fa-sync-alt" className="text-gray-700" />
                <span className="text-gray-700">รีเฟรช</span>
              </button>
            </div>

            {/* แถบแท็บ */}
            <div className="flex gap-0 mb-6 border-b border-gray-200 bg-white rounded-t-xl overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab('franchise')}
                className={`px-5 py-3 font-medium transition ${activeTab === 'franchise' ? 'bg-blue-600 text-white border-b-2 border-blue-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
              >
                ลูกค้าแฟรนไชส์ (อายุ 3 ปี)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`px-5 py-3 font-medium transition flex items-center gap-2 ${activeTab === 'pending' ? 'bg-blue-600 text-white border-b-2 border-blue-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
              >
                รออนุมัติ
                {pendingApprovals.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1.5">
                    {pendingApprovals.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-5 py-3 font-medium transition ${activeTab === 'history' ? 'bg-blue-600 text-white border-b-2 border-blue-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
              >
                ประวัติการอนุมัติ {processedApprovals.length > 0 && `(${processedApprovals.length})`}
              </button>
            </div>

            {/* แท็บ: ลูกค้าแฟรนไชส์ (อายุ 3 ปี) */}
            {activeTab === 'franchise' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">ลูกค้าแฟรนไชส์ (อายุ 3 ปี)</h2>
              <p className="text-sm text-gray-600 mb-4">
                แฟรนไชส์มีอายุ 1,095 วัน (3 ปี) หลังอนุมัติ ครบกำหนดจะกลับเป็นลูกค้าปกติอัตโนมัติ แอดมินสามารถเปลี่ยนเป็นลูกค้าปกติก่อนได้ (เช่น กรณีทำผิดสัญญา) ผู้ใช้จะถูกออกจากระบบทันที
              </p>
              {loadingFranchise ? (
                <div className="py-8 text-center text-gray-500"><Icon icon="fa-spinner" className="animate-spin text-2xl" /></div>
              ) : franchiseUsers.length === 0 ? (
                <div className="py-8 text-center text-gray-500">ไม่พบลูกค้าแฟรนไชส์ที่ยังไม่หมดอายุ</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้ใช้</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Branch ID</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่อนุมัติ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">หมดอายุเมื่อ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {franchiseUsers.map((fu) => (
                        <tr key={fu.email} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{fu.username}</div>
                            <div className="text-xs text-gray-500">{fu.email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{fu.branchId}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(fu.approvedAt)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(fu.expiresAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleRenewFranchise(fu)}
                                className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-xs font-bold hover:bg-green-200 transition"
                              >
                                ต่ออายุ
                              </button>
                              <button
                                onClick={() => handleRevokeFranchise(fu)}
                                className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-200 transition"
                              >
                                เปลี่ยนเป็นลูกค้าปกติ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {/* แท็บ: รออนุมัติ */}
            {activeTab === 'pending' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                รออนุมัติ ({pendingApprovals.length})
              </h2>
            {pendingApprovals.length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  รออนุมัติ ({pendingApprovals.length})
                </h2>
                <div className="space-y-4">
                  {pendingApprovals.map((approval) => (
                    <div
                      key={approval.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{approval.useremail}</p>
                          <p className="text-sm text-gray-600">
                            ร้องขอเปลี่ยนเป็น: <span className="font-bold">{approval.requested_usertype}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            วันที่ร้องขอ: {formatDate(approval.createdat)}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(approval.status)}`}>
                          {getStatusText(approval.status)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(approval)}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition"
                        >
                          <Icon icon="fa-check" className="mr-2" />
                          อนุมัติ
                        </button>
                        <button
                          onClick={() => handleReject(approval)}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition"
                        >
                          <Icon icon="fa-times" className="mr-2" />
                          ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-500">
                <Icon icon="fa-inbox" className="text-4xl mx-auto mb-2 opacity-50" />
                <p>ไม่พบคำขอรออนุมัติ</p>
              </div>
            )}
            </div>
            )}

            {/* แท็บ: ประวัติการอนุมัติ */}
            {activeTab === 'history' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  ประวัติการอนุมัติ ({processedApprovals.length})
                </h2>
                {processedApprovals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ผู้ใช้</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ร้องขอ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Admin</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {processedApprovals.map((approval) => (
                        <tr key={approval.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{approval.useremail}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{approval.requested_usertype}</td>
                          <td className="px-4 py-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(approval.status)}`}>
                              {getStatusText(approval.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{approval.admin_email || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(approval.reviewedat || approval.createdat)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{approval.admin_notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                ) : (
                <div className="py-12 text-center text-gray-500">
                  <Icon icon="fa-history" className="text-4xl mx-auto mb-2 opacity-50" />
                  <p>ไม่พบประวัติการอนุมัติ</p>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
