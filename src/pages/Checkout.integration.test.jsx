import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import Checkout from './Checkout'

const mockNavigate = vi.fn()
const mockSetCart = vi.fn()

const mockCart = [
  {
    id: 'P1',
    name: 'สินค้า A',
    supplier: 'SUP-A',
    supplierKey: 'sup-a',
    price: 10,
    qty: 10,
    weight: 100,
    unit: 'ชิ้น',
    selectedOptions: {},
    productOptions: []
  },
  {
    id: 'P2',
    name: 'สินค้า B',
    supplier: 'SUP-B',
    supplierKey: 'sup-b',
    price: 10,
    qty: 10,
    weight: 100,
    unit: 'ชิ้น',
    selectedOptions: {},
    productOptions: []
  }
]

vi.mock('sweetalert2', () => ({
  default: {
    fire: vi.fn(async () => ({ isConfirmed: true })),
    showLoading: vi.fn(),
    close: vi.fn()
  }
}))

vi.mock('promptpay-qr', () => ({
  default: () => 'mock-promptpay-payload'
}))

vi.mock('qrcode/lib/browser.js', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,mock')
  }
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

vi.mock('../components/common/Header', () => ({
  default: () => <div data-testid="header" />
}))

vi.mock('../components/common/Icon', () => ({
  default: ({ icon }) => <span data-testid={`icon-${icon || 'x'}`} />
}))

vi.mock('../hooks/useCart', () => ({
  useCart: () => ({
    cart: mockCart,
    clearCart: vi.fn(),
    setCart: mockSetCart
  })
}))

vi.mock('../services/shopSettingsService', () => ({
  getFeaturesSettings: async () => ({
    allowCoupon: true,
    allowPromotion: true,
    showCreditTopUp: false
  })
}))

vi.mock('../services/orderService', () => ({
  orderService: { placeOrder: vi.fn() }
}))
vi.mock('../services/imageService', () => ({
  imageService: { uploadOrderSlip: vi.fn(async () => 'https://example.com/slip.jpg') }
}))
vi.mock('../services/productService', () => ({
  productService: { getProduct: vi.fn(async () => ({ stock: 9999 })), getAllProducts: vi.fn(async () => []) }
}))
vi.mock('../services/creditService', () => ({
  creditService: { getUserCredit: vi.fn(async () => ({ balance: 0 })) }
}))
vi.mock('../utils/cache', () => ({
  invalidateByPrefix: vi.fn()
}))

vi.mock('../utils/supabase', () => {
  const promotions = [
    {
      id: 'promo-fixed-10',
      Name: 'PROMO 10',
      Status: 'active',
      Type: 'discount_fixed',
      ProductID: 'P1',
      DiscountAmount: 10,
      MinPurchase: 0,
      AllowedSupplierKeys: ['sup-a', 'sup-b']
    }
  ]
  const coupon = {
    Code: 'TEST20',
    Status: 'active',
    Type: 'fixed',
    Value: 20,
    MinPurchase: 0,
    UsageLimit: 0,
    AllowedSupplierKeys: ['sup-a', 'sup-b']
  }
  const shippingRates = [{ MinWeight: 1, MaxWeight: 1000, Price: 50 }]

  function query(table) {
    const state = { table, filters: {} }
    const chain = {
      select() {
        return chain
      },
      eq(k, v) {
        state.filters[k] = v
        return chain
      },
      ilike(k, v) {
        state.filters[k] = v
        return chain
      },
      not() {
        return chain
      },
      neq() {
        return chain
      },
      in() {
        return chain
      },
      order() {
        return chain
      },
      limit() {
        return chain
      },
      maybeSingle() {
        return Promise.resolve(resolveResult(state, true))
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolveResult(state, false)).then(onFulfilled, onRejected)
      }
    }
    return chain
  }

  function resolveResult(state, single) {
    if (state.table === 'shipping_rates') return { data: shippingRates, error: null }
    if (state.table === 'promotions') return { data: promotions, error: null }
    if (state.table === 'coupons') {
      const okCode = String(state.filters.Code || '').toUpperCase() === 'TEST20'
      return { data: okCode ? coupon : null, error: null }
    }
    if (state.table === 'order') return { data: [], error: null }
    if (state.table === 'settings') return { data: null, error: null }
    if (single) return { data: null, error: null }
    return { data: [], error: null }
  }

  return {
    supabase: {
      from: vi.fn((table) => query(table))
    }
  }
})

describe('Checkout integration: multi-supplier totals', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSetCart.mockReset()
  })

  it('computes subtotal->discount/promo->shipping->total with supplier split', async () => {
    render(<Checkout user={{ email: 'tester@example.com', userType: 'regular', address: 'Bangkok' }} />)

    const couponInput = await screen.findByPlaceholderText('กรอกโค้ดส่วนลด')
    fireEvent.change(couponInput, { target: { value: 'TEST20' } })
    fireEvent.click(screen.getByRole('button', { name: 'ใช้โค้ด' }))

    await waitFor(() => {
      const summaryCard = screen.getByText('สรุปยอดชำระ').closest('div')
      const scope = within(summaryCard)
      expect(scope.getByText('฿200')).toBeInTheDocument() // subtotal
      expect(scope.getByText('-฿10')).toBeInTheDocument() // promotion
      expect(scope.getByText('-฿20')).toBeInTheDocument() // coupon
      expect(scope.getByText('฿100')).toBeInTheDocument() // shipping
      expect(scope.getByText('฿270')).toBeInTheDocument() // grand total
    })

    const supplierTotals = screen.getAllByText('฿135')
    expect(supplierTotals.length).toBeGreaterThanOrEqual(2)
  })
})
