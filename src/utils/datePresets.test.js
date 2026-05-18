/**
 * เทสต์ utils/datePresets – toYmd, DATE_PRESETS, getPresetRange
 */
import { describe, it, expect } from 'vitest'
import { toYmd, DATE_PRESETS, getPresetRange } from './datePresets'

describe('datePresets', () => {
  describe('toYmd', () => {
    it('แปลง Date เป็นสตริง YYYY-MM-DD', () => {
      expect(toYmd(new Date(2026, 0, 15))).toBe('2026-01-15')
      expect(toYmd(new Date(2025, 11, 31))).toBe('2025-12-31')
      expect(toYmd(new Date(2024, 1, 29))).toBe('2024-02-29')
    })

    it('คืนค่าว่างถ้าไม่ใช่ Date ที่ valid', () => {
      expect(toYmd(null)).toBe('')
      expect(toYmd(undefined)).toBe('')
      expect(toYmd('2026-01-01')).toBe('')
      expect(toYmd(new Date('invalid'))).toBe('')
    })

    it('เติมศูนย์นำหน้าหน้าเดือนและวัน', () => {
      expect(toYmd(new Date(2026, 0, 1))).toBe('2026-01-01')
      expect(toYmd(new Date(2026, 8, 5))).toBe('2026-09-05')
    })
  })

  describe('DATE_PRESETS', () => {
    it('มี 3 preset (7, 30 วัน, 1 เดือน)', () => {
      expect(DATE_PRESETS).toHaveLength(3)
      expect(DATE_PRESETS.map(p => p.days)).toEqual([7, 30, -1])
      expect(DATE_PRESETS[0].label).toBe('7 วันย้อนหลัง')
      expect(DATE_PRESETS[1].label).toBe('30 วันย้อนหลัง')
      expect(DATE_PRESETS[2].label).toBe('1 เดือนย้อนหลัง')
    })
  })

  describe('getPresetRange', () => {
    it('คืนค่า start และ end เป็นรูปแบบ YYYY-MM-DD และ start <= end', () => {
      for (const days of [7, 30, -1]) {
        const { start, end } = getPresetRange(days)
        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(new Date(start).getTime() <= new Date(end).getTime()).toBe(true)
      }
    })

    it('days=7 ช่วงห่างกัน 7 วัน (วันเริ่ม + 7 วัน = วันจบ)', () => {
      const { start, end } = getPresetRange(7)
      const startMs = new Date(start).getTime()
      const endMs = new Date(end).getTime()
      const diffDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000))
      expect(diffDays).toBe(7)
    })

    it('days=-1 คืนช่วง 1 เดือน (วันแรกและวันสุดท้ายของเดือนก่อน)', () => {
      const { start, end } = getPresetRange(-1)
      const startD = new Date(start)
      const endD = new Date(end)
      expect(startD.getDate()).toBe(1)
      expect(endD.getDate()).toBeGreaterThanOrEqual(28)
      expect(endD.getMonth()).toBe(startD.getMonth())
      expect(endD.getFullYear()).toBe(startD.getFullYear())
    })
  })
})
