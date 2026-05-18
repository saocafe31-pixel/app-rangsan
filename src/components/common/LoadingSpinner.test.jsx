/**
 * เทสต์ LoadingSpinner – แสดงข้อความ "กำลังโหลด..." และโครงหลัก
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSpinner from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('แสดงข้อความ กำลังโหลด...', () => {
    render(<LoadingSpinner />)
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument()
  })

  it('มี container ที่ใช้ class gradient-bg', () => {
    const { container } = render(<LoadingSpinner />)
    const outer = container.firstChild
    expect(outer).toHaveClass('gradient-bg')
  })
})
