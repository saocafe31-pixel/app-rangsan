import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { normalizeProducts, filterProductsForStorefront, buildProductTextSearchOrFilter } from '../utils/helpers'
import { getCached, setCached } from '../utils/cache'

const ITEMS_PER_PAGE = 50

export function useProducts(user) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchProducts = useCallback(async (page = 0, search = '', forceRefresh = false) => {
    try {
      setLoading(true)

      // แคชเฉพาะหน้าแรก — หน้าถัดไปต้องต่อท้ายรายการ ห้ามแทนที่ด้วยแคชหน้าเดียว
      const cacheKey = `products_v2_${user?.email || 'all'}_0_${search}`
      if (!forceRefresh && page === 0) {
        const cached = getCached(cacheKey)
        if (cached) {
          setProducts(cached.products)
          setHasMore(cached.hasMore)
          setLoading(false)
          return
        }
      }

      let query = supabase
        .from('products')
        .select('*')

      if (search && search.trim()) {
        const orClause = buildProductTextSearchOrFilter(search)
        if (orClause) query = query.or(orClause)
      }

      // Apply pagination
      const from = page * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1
      // หน้า Home ต้องเรียงตามรหัสสินค้า
      query = query.range(from, to).order('ProductID', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching products:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // Check if it's RLS issue
        if (error.code === 'PGRST301' || error.message?.includes('RLS') || error.message?.includes('policy')) {
          console.warn('⚠️ RLS policy might be blocking access to products table')
          console.warn('Please disable RLS or create policy for "products" table in Supabase Dashboard')
        }
        setLoading(false)
        return
      }

      // Debug: Log first product to check column names
      if (data && data.length > 0) {
        console.log('Sample product from Supabase:', {
          keys: Object.keys(data[0]),
          unit: data[0]['หน่วย'] || data[0].Unit || data[0].unit,
          raw: data[0]
        })
      }
      
      // ราคาต่อรายการตาม UserType ของผู้ล็อกอิน (แฟรนไชส์ / ทั่วไป) — กรองมองเห็นแยกใน filterProductsForStorefront
      const userType = user?.userType || user?.customerType || 'regular'
      const normalized = filterProductsForStorefront(
        normalizeProducts(data || [], userType),
        user
      )

      // Debug: Log normalized product
      if (normalized.length > 0) {
        console.log('Normalized product:', {
          name: normalized[0].name,
          unit: normalized[0].unit,
          weight: normalized[0].weight
        })
      }
      
      const rawLen = (data || []).length
      // hasMore ต้องอิงจำนวนแถวจาก API ไม่ใช่หลังกรองหน้าร้าน — ไม่งั้นโหลดครบ 50 แถวแต่เหลือแสดง 5 รายการจะทำให้ hasMore = false ผิด
      const serverHasMore = rawLen === ITEMS_PER_PAGE

      if (page === 0) {
        setProducts(normalized)
      } else {
        setProducts(prev => [...prev, ...normalized])
      }

      setHasMore(serverHasMore)
      setCurrentPage(page)

      if (page === 0) {
        setCached(cacheKey, { products: normalized, hasMore: serverHasMore })
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchProducts(currentPage + 1, searchTerm)
    }
  }, [loading, hasMore, currentPage, searchTerm, fetchProducts])

  const search = useCallback((term) => {
    setSearchTerm(term)
    setCurrentPage(0)
    fetchProducts(0, term, true)
  }, [fetchProducts])

  useEffect(() => {
    fetchProducts(0, searchTerm)
  }, [user]) // Only fetch on user change

  return {
    products,
    loading,
    hasMore,
    search,
    loadMore,
    refresh: () => fetchProducts(0, searchTerm, true)
  }
}
