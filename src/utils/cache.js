/**
 * Cache in-memory แบบ TTL สำหรับ products, orders, credit ฯลฯ
 * ใช้ใน useProducts, useOrders, creditService.getUserCredit
 */
import { CACHE_DURATION } from './constants'

const cache = new Map()

/** คืนค่าใน cache ถ้ายังไม่หมดอายุ (ตาม CACHE_DURATION) */
export function getCached(key) {
  const item = cache.get(key)
  if (!item) return null
  const ttl = item.ttl ?? CACHE_DURATION
  if (Date.now() - item.timestamp > ttl) {
    cache.delete(key)
    return null
  }
  return item.data
}

/**
 * เก็บค่าใน cache
 * @param {string} key
 * @param {any} data
 * @param {number} [ttl] - มิลลิวินาที (ไม่ใส่ใช้ CACHE_DURATION)
 */
export function setCached(key, data, ttl) {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttl ?? CACHE_DURATION })
}

/** ลบ cache ตาม key หรือลบทั้งหมดถ้าไม่ส่ง key */
export function clearCache(key) {
  if (key) {
    cache.delete(key)
  } else {
    cache.clear()
  }
}

/** ลบทุก key ที่ขึ้นต้นด้วย prefix (เช่น invalidateByPrefix('products_')) */
export function invalidateByPrefix(prefix) {
  if (!prefix) return
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
