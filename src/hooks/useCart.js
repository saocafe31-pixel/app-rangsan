import { useState, useEffect } from 'react'
import { normalizeProduct, makeCartLineId } from '../utils/helpers'
import { maxBundleOrderQty } from '../utils/bundleUtils'
import { getBundlePrimaryId, getEffectiveStock } from '../utils/orderBundleLineUtils'
import { getProductSupplierKey, linePaidSubtotal, cartLineWeightGrams } from '../utils/cartSupplierUtils'
import { getPricingShapeFromProduct, resolveCartUnitPrice } from '../utils/priceTiers'
import { CART_STORAGE_KEY, LEGACY_CART_STORAGE_KEY } from '../utils/constants'

function withTieredCartItemPrice(item, userType) {
  if (!item) return item
  const shape = getPricingShapeFromProduct(item)
  if (!shape) return { ...item, price: Number(item.price || 0) || 0 }
  if (item.bundleFlexible && item.bundlePrimaryProductId) {
    const sel = item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : {}
    const pq = Math.round(Number(sel[item.bundlePrimaryProductId]) || Number(item.qty) || 0)
    const unitPrice = resolveCartUnitPrice(shape, pq, userType, 0)
    return { ...item, price: unitPrice }
  }
  const q = Math.round(Number(item.qty) || 0)
  const unitPrice = resolveCartUnitPrice(shape, q, userType, 0)
  return { ...item, price: unitPrice }
}

export function useCart(user = null) {
  const [cart, setCart] = useState([])

  // Get userType from user object
  const userType = user?.userType || user?.customerType || 'regular'

  // Load cart from localStorage on mount and when user changes
  useEffect(() => {
    let raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) {
      raw = localStorage.getItem(LEGACY_CART_STORAGE_KEY)
      if (raw) {
        localStorage.setItem(CART_STORAGE_KEY, raw)
        localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
      }
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Normalize cart items with userType to ensure correct price
          const normalizedCart = parsed.map((item) => {
            // Re-normalize product with userType to get correct price (regular/franchise)
            const normalized = normalizeProduct(item, userType)
            const supplierKey = item.supplierKey || getProductSupplierKey(normalized)
            const selectedOptions =
              item.selectedOptions && typeof item.selectedOptions === 'object' && !Array.isArray(item.selectedOptions)
                ? item.selectedOptions
                : {}
            const bundleFlexible = item.bundleFlexible === true
            const bundleSelections =
              bundleFlexible &&
              item.bundleSelections &&
              typeof item.bundleSelections === 'object' &&
              !Array.isArray(item.bundleSelections)
                ? { ...item.bundleSelections }
                : undefined
            const cartLineId =
              item.cartLineId ||
              makeCartLineId(
                normalized.id,
                selectedOptions,
                bundleFlexible ? bundleSelections : undefined
              )
            const merged = {
              ...normalized,
              qty: item.qty || 1,
              selectedOptions,
              cartLineId,
              supplierKey,
              supplierLabel:
                (item.supplierLabel && String(item.supplierLabel).trim()) ||
                (normalized.supplier && String(normalized.supplier).trim()) ||
                supplierKey,
              unit: normalized?.unit || item.unit || item.Unit || 'ชิ้น',
              bundleFlexible,
              bundleSelections,
              bundlePrimaryProductId:
                item.bundlePrimaryProductId || normalized.bundlePrimaryProductId || '',
              bundleSelectionSummary: item.bundleSelectionSummary || '',
              bundleComponentSumEqualsPrimary:
                item.bundleComponentSumEqualsPrimary === true ||
                normalized.bundleComponentSumEqualsPrimary === true,
              tierBasis: item.tierBasis && typeof item.tierBasis === 'object' ? item.tierBasis : undefined
            }
            return withTieredCartItemPrice(merged, userType)
          })
          setCart(normalizedCart)
          console.log('Cart loaded from localStorage:', normalizedCart.length, 'items', 'userType:', userType)
        }
      } catch (e) {
        console.error('Error parsing cart from localStorage:', e)
        localStorage.removeItem(CART_STORAGE_KEY)
        localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
      }
    }
  }, [userType])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
      localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
      console.log('Cart saved to localStorage:', cart.length, 'items')
    } else {
      localStorage.removeItem(CART_STORAGE_KEY)
      localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
      console.log('Cart cleared from localStorage')
    }
  }, [cart])

  const cartLineMatchId = (item) =>
    item.cartLineId ||
    makeCartLineId(
      item.id,
      item.selectedOptions || {},
      item.bundleFlexible && item.bundleSelections ? item.bundleSelections : undefined
    )

  const addToCart = (product, quantity = 1, extra = {}) => {
    const selectedOptions =
      extra.selectedOptions && typeof extra.selectedOptions === 'object' && !Array.isArray(extra.selectedOptions)
        ? { ...extra.selectedOptions }
        : {}
    const bundleFlexible =
      extra.bundleFlexible === true && product.bundleFlexible === true && product.isBundle === true
    const bundleSelections =
      bundleFlexible &&
      extra.bundleSelections &&
      typeof extra.bundleSelections === 'object' &&
      !Array.isArray(extra.bundleSelections)
        ? { ...extra.bundleSelections }
        : null
    const bundlePrimaryProductId = bundleFlexible
      ? String(extra.bundlePrimaryProductId || product.bundlePrimaryProductId || '').trim()
      : ''
    const bundleSelectionSummary = bundleFlexible ? String(extra.bundleSelectionSummary || '').trim() : ''

    if (bundleFlexible && bundleSelections && bundlePrimaryProductId) {
      const primaryQty = Math.round(Number(bundleSelections[bundlePrimaryProductId]) || 0)
      const orderStep = Math.max(1, product.orderStep || 1)
      const cartLineId = makeCartLineId(product.id, selectedOptions, bundleSelections)
      setCart((prev) => {
        const supplierKey = getProductSupplierKey(product)
        const supplierLabel =
          (product.supplier && String(product.supplier).trim()) || supplierKey
        const unit = product.unit || product.Unit || product['หน่วย'] || 'ชิ้น'
        const finalUnit = String(unit).trim() || 'ชิ้น'
        const tierBasis = extra.tierBasis || getPricingShapeFromProduct(product)
        const line = withTieredCartItemPrice(
          {
            ...product,
            qty: primaryQty < orderStep ? orderStep : primaryQty,
            stock: undefined,
            unit: finalUnit,
            orderStep,
            supplierKey,
            supplierLabel,
            selectedOptions,
            cartLineId,
            bundleFlexible: true,
            bundleSelections: { ...bundleSelections },
            bundlePrimaryProductId,
            bundleSelectionSummary,
            tierBasis
          },
          userType
        )
        return [...prev, line]
      })
      return
    }

    const cartLineId = makeCartLineId(product.id, selectedOptions)
    const orderStep = Math.max(1, product.orderStep || 1)
    const roundedQty = Math.round(quantity / orderStep) * orderStep
    const finalQuantity = roundedQty < orderStep ? orderStep : roundedQty

    setCart((prev) => {
      const existing = prev.find((item) => cartLineMatchId(item) === cartLineId)
      if (existing) {
        const step = Math.max(1, existing.orderStep || 1)
        const currentStock = product.stock !== undefined ? product.stock : existing.stock || 0
        const newQty = Math.round((existing.qty + finalQuantity) / step) * step
        const cappedQty = currentStock > 0 && newQty > currentStock ? Math.floor(currentStock / step) * step : newQty
        const finalQty = cappedQty < step ? existing.qty : cappedQty

        const sk = existing.supplierKey || getProductSupplierKey(product)
        const sl =
          (existing.supplierLabel && String(existing.supplierLabel).trim()) ||
          (product.supplier && String(product.supplier).trim()) ||
          sk
        if (currentStock > 0 && newQty > currentStock) {
          return prev.map((item) =>
            cartLineMatchId(item) === cartLineId
              ? withTieredCartItemPrice(
                  { ...item, qty: finalQty, stock: currentStock, supplierKey: sk, supplierLabel: sl },
                  userType
                )
              : item
          )
        }
        return prev.map((item) =>
          cartLineMatchId(item) === cartLineId
            ? withTieredCartItemPrice(
                { ...item, qty: finalQty, stock: currentStock, supplierKey: sk, supplierLabel: sl },
                userType
              )
            : item
        )
      }
      const unit = product.unit || product.Unit || product['หน่วย'] || 'ชิ้น'
      const finalUnit = String(unit).trim() || 'ชิ้น'
      const currentStock = product.stock !== undefined ? product.stock : 0
      const qty = currentStock > 0 && finalQuantity > currentStock
        ? Math.floor(currentStock / orderStep) * orderStep
        : finalQuantity

      const supplierKey = getProductSupplierKey(product)
      const supplierLabel =
        (product.supplier && String(product.supplier).trim()) || supplierKey
      return [
        ...prev,
        withTieredCartItemPrice(
          {
            ...product,
            qty: qty < orderStep ? orderStep : qty,
            stock: currentStock,
            unit: finalUnit,
            orderStep,
            supplierKey,
            supplierLabel,
            selectedOptions,
            cartLineId
          },
          userType
        )
      ]
    })
  }

  const removeFromCart = (lineId) => {
    setCart((prev) => prev.filter((item) => cartLineMatchId(item) !== lineId))
  }

  const updateQuantity = (lineId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(lineId)
      return
    }
    setCart((prev) =>
      prev.map((item) => {
        if (cartLineMatchId(item) !== lineId) return item
        const step = Math.max(1, item.orderStep || 1)
        const rounded = Math.round(quantity / step) * step
        const qty = rounded < step ? step : rounded
        return withTieredCartItemPrice({ ...item, qty }, userType)
      })
    )
  }

  // Update cart items with latest stock from products array
  const updateCartStock = (products) => {
    if (!products || products.length === 0) return
    const stockById = new Map((products || []).map((p) => [p.id, Math.max(0, Number(p.stock) || 0)]))
    setCart((prev) =>
      prev.map((item) => {
        const product = products.find((p) => p.id === item.id)
        if (product) {
          if (item.bundleFlexible) {
            const bundleShape = getPricingShapeFromProduct(product)
            const nextTierBasis =
              Array.isArray(product.priceTiers) && product.priceTiers.length > 0
                ? bundleShape
                : item.tierBasis
            return withTieredCartItemPrice(
              {
                ...item,
                stock: undefined,
                orderStep: item.orderStep ?? product.orderStep ?? 1,
                regularPrice: product.regularPrice,
                franchisePrice: product.franchisePrice,
                priceTiers: product.priceTiers,
                productOptions: product.productOptions ?? item.productOptions,
                tierBasis: nextTierBasis
              },
              userType
            )
          }
          let stock = product.stock || 0
          const primaryId = getBundlePrimaryId(product)
          if (product.isBundle && primaryId) {
            stock = getEffectiveStock(product, stockById)
          } else if (product.isBundle && Array.isArray(product.bundleLines) && product.bundleLines.length) {
            const map = new Map(products.map((p) => [p.id, p]))
            stock = maxBundleOrderQty(product, product.bundleLines, map)
          }
          return withTieredCartItemPrice(
            {
              ...item,
              stock,
              orderStep: item.orderStep ?? product.orderStep ?? 1,
              regularPrice: product.regularPrice,
              franchisePrice: product.franchisePrice,
              priceTiers: product.priceTiers
            },
            userType
          )
        }
        return item
      })
    )
  }

  const clearCart = () => {
    setCart([])
    localStorage.removeItem(CART_STORAGE_KEY)
    localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
  }

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + linePaidSubtotal(item), 0)
  }

  const getTotalWeight = () => {
    return cart.reduce((sum, item) => sum + cartLineWeightGrams(item), 0)
  }

  const getItemCount = () => {
    return cart.reduce((sum, item) => sum + item.qty, 0)
  }

  return {
    cart,
    setCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCartStock,
    clearCart,
    getTotal,
    getTotalWeight,
    getItemCount
  }
}
