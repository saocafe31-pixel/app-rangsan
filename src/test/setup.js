/**
 * Vitest setup – โหลด matchers ของ @testing-library/jest-dom และ cleanup หลังแต่ละเทสต์
 */
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

expect.extend(matchers)
afterEach(() => {
  cleanup()
})
