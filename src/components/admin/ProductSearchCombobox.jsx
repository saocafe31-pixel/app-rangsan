import { useState, useMemo, useRef, useEffect } from 'react'

function matchesProductCatalogSearch(product, query) {
  const s = String(query || '').trim().toLowerCase()
  if (!s) return true
  const id = String(product.id || '').toLowerCase()
  const name = String(product.name || '').toLowerCase()
  return id.includes(s) || name.includes(s)
}

/**
 * ช่องเดียว: พิมพ์ค้นหาแล้วเลือกสินค้าจากรายการที่หลุดลงมา (ไม่แยก select กับ search)
 */
export default function ProductSearchCombobox({
  products = [],
  value = '',
  onChange,
  placeholder = 'ค้นหารหัสหรือชื่อ แล้วเลือกจากรายการ',
  disabled = false,
  className = ''
}) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => products.find((p) => String(p.id || '').trim() === String(value || '').trim()),
    [products, value]
  )

  const selectedLabel = selected
    ? `${selected.id} — ${selected.name} (OrderStep ${Math.max(1, Number(selected.orderStep) || 1)})`
    : value
      ? `${String(value)} (ไม่พบในรายการที่โหลด)`
      : ''

  const filtered = useMemo(
    () => (products || []).filter((p) => matchesProductCatalogSearch(p, open ? query : '')),
    [products, query, open]
  )

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc, true)
    return () => document.removeEventListener('mousedown', onDoc, true)
  }, [open])

  const displayValue = open ? query : value ? selectedLabel : ''

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onFocus={() => {
          setOpen(true)
          setQuery(value ? selectedLabel : '')
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setQuery('')
            e.currentTarget.blur()
          }
        }}
        className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-amber-400/60 disabled:bg-gray-100"
      />
      {open && !disabled && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-amber-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">ไม่พบสินค้า</li>
          ) : (
            filtered.slice(0, 300).map((p) => {
              const step = Math.max(1, Number(p.orderStep) || 1)
              const label = `${p.id} — ${p.name} (OrderStep ${step})`
              const active = String(p.id) === String(value)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`flex w-full text-left px-3 py-2 text-xs hover:bg-amber-50 ${
                      active ? 'bg-amber-50/80 font-semibold' : ''
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onChange?.(String(p.id))
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <span className="text-gray-900 break-words">{label}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
