import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isProviderSelectable, pickProvider } from '../ProviderComparison.jsx'

const swapWidgetSource = readFileSync(
  fileURLToPath(new URL('../SwapWidget.jsx', import.meta.url)),
  'utf8',
)
const sidebarSource = readFileSync(
  fileURLToPath(new URL('../Sidebar.jsx', import.meta.url)),
  'utf8',
)

describe('provider comparison availability', () => {
  it('allows only providers with a successful quote to be selected', () => {
    expect(isProviderSelectable({ state: 'ok' })).toBe(true)
    expect(isProviderSelectable({ state: 'loading' })).toBe(false)
    expect(isProviderSelectable({ state: 'unavailable' })).toBe(false)
  })

  it('does not invoke checkout for an unavailable provider', () => {
    const onPick = vi.fn()
    pickProvider({ id: 'guardarian', state: 'unavailable' }, onPick)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('uses the enabled provider list for every provider count', () => {
    expect(swapWidgetSource).not.toMatch(/\bPROVIDER_IDS\b/)
    expect(swapWidgetSource).toContain('ENABLED_PROVIDER_IDS.length')
    expect(sidebarSource).not.toMatch(/\bPROVIDER_IDS\b/)
    expect(sidebarSource).toContain('ENABLED_PROVIDER_IDS.length')
  })
})
