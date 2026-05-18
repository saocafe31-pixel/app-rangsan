import { Link } from 'react-router-dom'
import Icon from '../components/common/Icon'

export default function MaintenancePage({ message = 'กำลังปรับปรุงระบบ กรุณาลองใหม่ในภายหลัง' }) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
          <Icon icon="fa-tools" className="text-3xl text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">กำลังปรับปรุงระบบ</h1>
        <p className="text-gray-600 whitespace-pre-line mb-6">{message}</p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          <Icon icon="fa-sign-in-alt" />
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  )
}
