/**
 * รายงาน error ไปที่ monitoring (เมื่อตั้งค่า Sentry จะส่งไปที่นี่)
 * ตอนนี้แค่ log; เมื่อมี VITE_SENTRY_DSN ให้เพิ่ม Sentry.captureException
 */

export function reportError(error, context = {}) {
  const message = error?.message || String(error)
  console.error('[reportError]', message, context)
  // เมื่อติดตั้ง Sentry: if (import.meta.env.VITE_SENTRY_DSN) Sentry.captureException(error, { extra: context })
}
