import { useState, useEffect, useMemo } from 'react'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Swal from 'sweetalert2'
import { supabase } from '../utils/supabase'
import {
  isUserMgmtGateUnlocked,
  verifyUserMgmtGate,
  clearUserMgmtGate,
  dryRunFullPurgeSummary,
  purgeUserOnly,
  purgeUserFull,
  normalizeEmail
} from '../services/userPurgeService'

export default function AdminUserManagement({ user }) {
  const [gateOpen, setGateOpen] = useState(() => !isUserMgmtGateUnlocked())
  const [verifierName, setVerifierName] = useState('')
  const [verifierCode, setVerifierCode] = useState('')
  const [gateLoading, setGateLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editRow, setEditRow] = useState(null)
  const [editForm, setEditForm] = useState({})

  const unlocked = !gateOpen && isUserMgmtGateUnlocked()

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    setGateOpen(!isUserMgmtGateUnlocked())
  }, [user])

  const fetchUsers = async () => {
    if (!unlocked) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select(
          'Email, Username, Phone, Address, Subdistrict, District, Province, PostalCode, UserType, Role, BranchId, RegisteredDate'
        )
        .order('Email', { ascending: true })
        .limit(2000)
      if (error) throw error
      setUsers(data || [])
    } catch (e) {
      console.error(e)
      Swal.fire({ icon: 'error', title: 'โหลดรายชื่อไม่สำเร็จ', text: e.message })
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (unlocked) fetchUsers()
  }, [unlocked])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((r) => {
      const em = String(r.Email || r.email || '').toLowerCase()
      const un = String(r.Username || r.username || '').toLowerCase()
      return em.includes(q) || un.includes(q)
    })
  }, [users, search])

  const handleGateSubmit = async (e) => {
    e.preventDefault()
    setGateLoading(true)
    try {
      const res = await verifyUserMgmtGate(verifierName, verifierCode)
      if (!res.ok) {
        Swal.fire({ icon: 'error', title: 'ไม่ผ่านการยืนยัน', text: res.message })
        return
      }
      setVerifierCode('')
      setGateOpen(false)
      Swal.fire({ icon: 'success', title: 'ยืนยันแล้ว', text: 'เข้าสู่หน้าจัดการผู้ใช้ได้ (ล็อกจะหมดอายุใน 2 ชั่วโมง)', timer: 2200, showConfirmButton: false })
    } finally {
      setGateLoading(false)
    }
  }

  const openEdit = (row) => {
    setEditRow(row)
    setEditForm({
      Username: row.Username || row.username || '',
      Phone: row.Phone || row.phone || '',
      Address: row.Address || row.address || '',
      Subdistrict: row.Subdistrict || row.subdistrict || '',
      District: row.District || row.district || '',
      Province: row.Province || row.province || '',
      PostalCode: row.PostalCode || row.postalcode || '',
      UserType: row.UserType || row.usertype || 'regular',
      BranchId: row.BranchId || row.branchid || '',
      Role: row.Role || row.role || 'user'
    })
  }

  const saveEdit = async () => {
    if (!editRow) return
    const email = editRow.Email || editRow.email
    try {
      const { error } = await supabase
        .from('users')
        .update({
          Username: editForm.Username,
          Phone: editForm.Phone,
          Address: editForm.Address,
          Subdistrict: editForm.Subdistrict || null,
          District: editForm.District || null,
          Province: editForm.Province || null,
          PostalCode: editForm.PostalCode || null,
          UserType: editForm.UserType,
          BranchId: editForm.BranchId || null,
          Role: editForm.Role
        })
        .eq('Email', email)
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500, showConfirmButton: false })
      setEditRow(null)
      fetchUsers()
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: e.message })
    }
  }

  const countAdmins = async () => {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .ilike('Role', 'admin')
    if (error) return 999
    return count || 0
  }

  const handleDeleteUser = async (row) => {
    const target = normalizeEmail(row.Email || row.email)
    const selfEmail = normalizeEmail(user?.email)
    if (target.toLowerCase() === selfEmail.toLowerCase()) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถลบบัญชีตัวเอง' })
      return
    }

    const isTargetAdmin = String(row.Role || row.role || '').toLowerCase() === 'admin'
    if (isTargetAdmin) {
      const ac = await countAdmins()
      if (ac <= 1) {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถลบแอดมินคนสุดท้าย' })
        return
      }
    }

    const { value: mode } = await Swal.fire({
      title: `ลบผู้ใช้ ${target}`,
      html: `
        <p class="text-left text-sm mb-3">เลือกโหมดการลบ</p>
        <ul class="text-left text-sm space-y-2">
          <li><strong>เฉพาะบัญชี</strong> — ลบแถวใน <code>users</code> เท่านั้น ออเดอร์และประวัติคงอยู่</li>
          <li><strong>ลบทั้งหมด</strong> — ลบออเดอร์, ใบกำกับ, เครดิต, แจ้งเตือน, PO ที่สร้างโดยผู้ใช้ ฯลฯ</li>
        </ul>
      `,
      showCancelButton: true,
      confirmButtonText: 'ดำเนินการ',
      cancelButtonText: 'ยกเลิก',
      input: 'radio',
      inputOptions: {
        user_only: 'ลบเฉพาะ User (เก็บประวัติการสั่งซื้อ)',
        full_purge: 'ลบแบบทั้งหมด (รวมออเดอร์และประวัติ)'
      },
      inputValidator: (v) => (!v ? 'กรุณาเลือกโหมด' : null)
    })
    if (!mode) return

    if (mode === 'full_purge') {
      let summary
      try {
        summary = await dryRunFullPurgeSummary(target)
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'สรุปข้อมูลไม่สำเร็จ', text: err.message })
        return
      }
      const jsonStr = JSON.stringify(summary, null, 2)
      const confirm = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการลบแบบทั้งหมด',
        html: `
          <p class="text-left text-sm font-bold text-red-700 mb-2">สรุปรายการที่จะถูกลบ (dry run)</p>
          <pre id="admin-purge-json-preview" class="text-left text-xs bg-gray-100 p-3 rounded-lg max-h-64 overflow-auto border border-gray-200 whitespace-pre-wrap break-all"></pre>
          <p class="text-left text-sm mt-2">พิมพ์อีเมล <strong>${target.replace(/</g, '')}</strong> ในช่องด้านล่างเพื่อยืนยัน</p>
        `,
        didOpen: () => {
          const el = document.getElementById('admin-purge-json-preview')
          if (el) el.textContent = jsonStr
        },
        input: 'text',
        inputPlaceholder: target,
        showCancelButton: true,
        confirmButtonText: 'ลบถาวร',
        confirmButtonColor: '#b91c1c',
        inputValidator: (v) => (normalizeEmail(v).toLowerCase() !== target.toLowerCase() ? 'อีเมลไม่ตรง' : null)
      })
      if (!confirm.isConfirmed) return

      try {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
        const result = await purgeUserFull(target)
        Swal.close()
        Swal.fire({
          icon: 'success',
          title: 'ลบข้อมูลแล้ว',
          html: '<pre id="purge-done-json" class="text-xs text-left max-h-56 overflow-auto whitespace-pre-wrap break-all"></pre>',
          didOpen: () => {
            const el = document.getElementById('purge-done-json')
            if (el) el.textContent = JSON.stringify(result.deleted, null, 2)
          }
        })
        fetchUsers()
      } catch (err) {
        Swal.close()
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: err.message })
      }
      return
    }

    // user_only
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'ลบเฉพาะบัญชีผู้ใช้?',
      text: 'ออเดอร์และประวัติในระบบจะยังอ้างอิงอีเมลนี้ได้',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      confirmButtonColor: '#b45309'
    })
    if (!ok.isConfirmed) return
    try {
      await purgeUserOnly(target)
      Swal.fire({ icon: 'success', title: 'ลบบัญชีผู้ใช้แล้ว' })
      fetchUsers()
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: err.message })
    }
  }

  if (!user || user.role !== 'admin') {
    return null
  }

  if (gateOpen) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} cartItemCount={0} onCartClick={() => {}} />
        <div className="flex">
          <Sidebar user={user} />
          <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
            <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow-lg border border-amber-200 p-8">
              <div className="flex items-center gap-3 mb-2 text-amber-800">
                <Icon icon="fa-lock" className="text-2xl" />
                <h1 className="text-xl font-bold">ยืนยันตัวตน — จัดการผู้ใช้งาน</h1>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                หน้านี้ใช้ลบ/แก้ไขข้อมูลผู้ใช้ ต้องกรอก<strong>ชื่อ</strong>และ<strong>รหัสยืนยัน</strong>ตามที่บันทึกในตาราง{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">admin_user_mgmt_access</code> บน Supabase
                (ฟังก์ชัน <code className="text-xs">verify_admin_user_mgmt_access</code>)
              </p>
              <form onSubmit={handleGateSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อผู้ยืนยัน</label>
                  <input
                    value={verifierName}
                    onChange={(e) => setVerifierName(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">รหัสยืนยัน</label>
                  <input
                    type="password"
                    value={verifierCode}
                    onChange={(e) => setVerifierCode(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                    autoComplete="off"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={gateLoading}
                  className="w-full py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50"
                >
                  {gateLoading ? 'กำลังตรวจสอบ...' : 'เข้าสู่หน้าจัดการ'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Icon icon="fa-user-cog" className="text-amber-600" />
                จัดการผู้ใช้งาน
              </h1>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearUserMgmtGate()
                    setGateOpen(true)
                  }}
                  className="px-4 py-2 text-sm font-bold border-2 border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  ล็อกหน้านี้ใหม่
                </button>
                <button
                  type="button"
                  onClick={fetchUsers}
                  className="px-4 py-2 text-sm font-bold bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  รีเฟรช
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-950">
              <strong>คำเตือน:</strong> การลบแบบทั้งหมดจะลบออเดอร์ ใบกำกับ เครดิต การแจ้งเตือน PO ที่สร้างโดยผู้ใช้ และบันทึกที่เกี่ยวข้อง
              — ตรวจสอบ JSON สรุปก่อนยืนยันทุกครั้ง
            </div>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาอีเมลหรือชื่อ..."
              className="w-full max-w-md mb-4 border-2 border-gray-200 rounded-lg px-4 py-2"
            />

            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-bold">อีเมล</th>
                        <th className="text-left px-4 py-3 font-bold">ชื่อ</th>
                        <th className="text-left px-4 py-3 font-bold">ประเภท</th>
                        <th className="text-left px-4 py-3 font-bold">Role</th>
                        <th className="text-right px-4 py-3 font-bold w-40">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((row) => {
                        const em = row.Email || row.email
                        return (
                          <tr key={em} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs">{em}</td>
                            <td className="px-4 py-2">{row.Username || row.username || '—'}</td>
                            <td className="px-4 py-2">{row.UserType || row.usertype || '—'}</td>
                            <td className="px-4 py-2">{row.Role || row.role || '—'}</td>
                            <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700"
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(row)}
                                className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold text-xs hover:bg-red-700"
                              >
                                ลบ
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 px-4 py-2 border-t border-gray-100">
                  แสดง {filtered.length} รายการ (โหลดสูงสุด 2000 แถว)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {editRow && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4">แก้ไข {editRow.Email || editRow.email}</h2>
            <div className="space-y-3">
              {[
                ['Username', 'Username'],
                ['Phone', 'Phone'],
                ['Address', 'Address'],
                ['Subdistrict', 'Subdistrict'],
                ['District', 'District'],
                ['Province', 'Province'],
                ['PostalCode', 'PostalCode'],
                ['BranchId', 'BranchId'],
                ['UserType', 'UserType'],
                ['Role', 'Role']
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-gray-600">{label}</label>
                  <input
                    value={editForm[key] ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="flex-1 py-2 rounded-xl border-2 border-gray-300 font-bold"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
