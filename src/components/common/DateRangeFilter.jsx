/**
 * Component ร่วม: ช่วงวันที่ + ปุ่มรูปแบบการค้นหา (ทั้งหมด, 7 วัน, 30 วัน, 1 เดือน)
 * ใช้ใน AdminDashboard, AdminOrders, AdminReports, AdminCreditApproval, CreditHistory
 *
 * layout:
 *   - default: แสดง input วันที่ 2 ตัว + label + ปุ่ม
 *   - compact: input กับปุ่มแถวเดียว (สำหรับแถวที่มี "ถึง" / ปุ่มอื่น)
 *   - buttonsOnly: แสดงเฉพาะ label + ปุ่ม (ให้ parent แสดง input วันที่เอง)
 */
import { DATE_PRESETS, getPresetRange } from '../../utils/datePresets'

const inputClass =
  'border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none'
const btnBase = 'px-4 py-2.5 rounded-lg text-sm font-bold transition'
const btnActive = 'bg-emerald-600 text-white'
const btnInactive = 'bg-gray-100 text-gray-700 hover:bg-gray-200'

export default function DateRangeFilter({
  start,
  end,
  onStartChange,
  onEndChange,
  showAllDates,
  onShowAllDatesChange,
  label = 'รูปแบบการค้นหา:',
  dateInputClass = '',
  layout = 'default',
  minEnd = null,
  extraButtons = null,
  labelInline = false
}) {
  const handleSelectAll = () => {
    onStartChange('')
    onEndChange('')
    onShowAllDatesChange(true)
  }

  const handlePreset = (days) => {
    const { start: s, end: e } = getPresetRange(days)
    onStartChange(s)
    onEndChange(e)
    onShowAllDatesChange(false)
  }

  const isPresetActive = (days) => {
    if (showAllDates) return false
    const { start: s, end: e } = getPresetRange(days)
    return start === s && end === e
  }

  const inputCls = [inputClass, dateInputClass].filter(Boolean).join(' ')
  const buttonsOnly = layout === 'buttonsOnly'

  return (
    <>
      {!buttonsOnly && (
        <div className={layout === 'compact' ? 'flex flex-wrap items-center gap-3' : 'flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4'}>
          <input
            type="date"
            value={start ?? ''}
            onChange={(e) => {
              onStartChange(e.target.value)
              onShowAllDatesChange(false)
            }}
            className={layout === 'compact' ? inputCls : `flex-1 min-w-0 ${inputCls}`}
          />
          <input
            type="date"
            value={end ?? ''}
            min={minEnd ?? start}
            onChange={(e) => {
              onEndChange(e.target.value)
              onShowAllDatesChange(false)
            }}
            className={layout === 'compact' ? inputCls : `flex-1 min-w-0 ${inputCls}`}
          />
        </div>
      )}
      {labelInline ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-gray-600 mb-2 w-full sm:w-auto sm:mb-0">{label}</span>
          <button type="button" onClick={handleSelectAll} className={`${btnBase} ${showAllDates ? btnActive : btnInactive}`}>
            ทั้งหมด
          </button>
          {DATE_PRESETS.map(({ label: presetLabel, days }) => (
            <button
              key={presetLabel}
              type="button"
              onClick={() => handlePreset(days)}
              className={`${btnBase} ${isPresetActive(days) ? btnActive : btnInactive}`}
            >
              {presetLabel}
            </button>
          ))}
          {extraButtons}
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-600 mb-2">{label}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={handleSelectAll} className={`${btnBase} ${showAllDates ? btnActive : btnInactive}`}>
              ทั้งหมด
            </button>
            {DATE_PRESETS.map(({ label: presetLabel, days }) => (
              <button
                key={presetLabel}
                type="button"
                onClick={() => handlePreset(days)}
                className={`${btnBase} ${isPresetActive(days) ? btnActive : btnInactive}`}
              >
                {presetLabel}
              </button>
            ))}
            {extraButtons}
          </div>
        </>
      )}
    </>
  )
}
