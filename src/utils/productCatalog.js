function toLowerTrim(value) {
  return String(value || '').trim().toLowerCase()
}

export function parseAllowedViewerEmailsFromText(text) {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const parts = raw.split(/[\s,\n\r，]+/g).map((x) => toLowerTrim(x)).filter(Boolean)
  const uniq = []
  const seen = new Set()
  for (const p of parts) {
    if (!p.includes('@')) continue
    if (!seen.has(p)) {
      seen.add(p)
      uniq.push(p)
    }
  }
  return uniq
}

export function serializeAllowedViewerEmailsToJson(listOrText) {
  const list = Array.isArray(listOrText)
    ? listOrText.map((x) => toLowerTrim(x)).filter(Boolean)
    : parseAllowedViewerEmailsFromText(listOrText)
  const uniq = Array.from(new Set(list))
  return uniq.length > 0 ? uniq : null
}

export function parseAllowedViewerEmails(value) {
  if (Array.isArray(value)) return serializeAllowedViewerEmailsToJson(value) || []
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return serializeAllowedViewerEmailsToJson(parsed) || []
    } catch {
      return parseAllowedViewerEmailsFromText(value)
    }
  }
  return []
}

export function sanitizeProductOptionsForDb(input) {
  const groups = Array.isArray(input) ? input : []
  const result = []
  for (const group of groups) {
    const name = String(group?.name || '').trim()
    if (!name) continue
    const required = group?.required === true
    const valuesRaw = Array.isArray(group?.values) ? group.values : []
    const values = valuesRaw
      .map((v) => ({
        label: String(v?.label ?? v ?? '').trim(),
        price: Number(v?.price ?? 0) || 0
      }))
      .filter((v) => Boolean(v.label))
      .map((v) => ({ label: v.label, price: v.price }))
    if (values.length === 0) continue
    result.push({ name, required, values })
  }
  return result
}

export function parseProductOptions(value) {
  if (Array.isArray(value)) return sanitizeProductOptionsForDb(value)
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? sanitizeProductOptionsForDb(parsed) : []
    } catch {
      return []
    }
  }
  return []
}

export function normalizeSelectedOptions(input) {
  const obj = input && typeof input === 'object' ? input : {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k || '').trim()
    const val = String(v || '').trim()
    if (!key || !val) continue
    out[key] = val
  }
  return out
}

export function getSelectedOptionPriceDetails(productOptions, selectedOptions) {
  const groups = Array.isArray(productOptions) ? productOptions : []
  const selected = normalizeSelectedOptions(selectedOptions)
  const details = []
  for (const group of groups) {
    const groupName = String(group?.name || '').trim()
    if (!groupName) continue
    const selectedLabel = String(selected[groupName] || '').trim()
    if (!selectedLabel) continue
    const match = (Array.isArray(group?.values) ? group.values : []).find(
      (v) => String(v?.label ?? v ?? '').trim() === selectedLabel
    )
    const price = Number(match?.price ?? 0) || 0
    details.push({
      optionName: groupName,
      optionValue: selectedLabel,
      extraPrice: price
    })
  }
  return details
}
