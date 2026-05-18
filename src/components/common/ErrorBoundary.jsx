import { Component } from 'react'
import { reportError } from '../../utils/errorReport'

/**
 * จับ error ใน React tree แล้วแสดง fallback แทนการ crash ทั้งหน้า
 * ใช้ร่วมกับ monitoring (Sentry): reportError จะส่ง error ออกไปเมื่อตั้งค่า DSN
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    reportError(error, { componentStack: errorInfo?.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full text-center">
            <p className="text-6xl mb-4">⚠️</p>
            <h1 className="text-xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h1>
            <p className="text-gray-600 mb-6">
              ขออภัย เกิดข้อผิดพลาดขณะโหลดหน้านี้ กรุณารีเฟรชหน้าหรือลองใหม่อีกครั้ง
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition"
            >
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
