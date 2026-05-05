import { describe, it, expect } from 'vitest'
import { PROVIDERS, PROVIDER_IDS, getProvider, listProviderMetadata } from '../index.js'
import { assertIsProvider } from '../Provider.js'

describe('provider registry', () => {
  it('exports all three providers', () => {
    expect(PROVIDER_IDS).toEqual(expect.arrayContaining(['transak', 'mtpelerin', 'topper']))
    expect(PROVIDER_IDS.length).toBe(3)
  })

  it('every registered provider conforms to the Provider interface', () => {
    for (const id of PROVIDER_IDS) {
      expect(() => assertIsProvider(PROVIDERS[id], id)).not.toThrow()
    }
  })

  it('getProvider returns the same module instance from PROVIDERS', () => {
    expect(getProvider('transak')).toBe(PROVIDERS.transak)
    expect(getProvider('mtpelerin')).toBe(PROVIDERS.mtpelerin)
    expect(getProvider('topper')).toBe(PROVIDERS.topper)
  })

  it('getProvider throws on unknown id', () => {
    expect(() => getProvider('coinbase')).toThrow(/unknown provider/)
    expect(() => getProvider('')).toThrow()
  })

  it('listProviderMetadata returns metadata for every provider with id matching the registry key', () => {
    const list = listProviderMetadata()
    expect(list.length).toBe(3)
    for (const meta of list) {
      expect(PROVIDER_IDS).toContain(meta.id)
      expect(meta.name).toBeTruthy()
      expect(Array.isArray(meta.supportedFiat)).toBe(true)
      expect(Array.isArray(meta.supportedCrypto)).toBe(true)
      expect(typeof meta.hasWebhook).toBe('boolean')
    }
  })

  it('exactly one provider has hasWebhook=false (mtpelerin — the unverified-events one)', () => {
    const list = listProviderMetadata()
    const noWebhook = list.filter((m) => !m.hasWebhook)
    expect(noWebhook.length).toBe(1)
    expect(noWebhook[0].id).toBe('mtpelerin')
  })
})

describe('Provider.assertIsProvider guard', () => {
  it('throws on a non-object', () => {
    expect(() => assertIsProvider(null, 'x')).toThrow(/not an object/)
    expect(() => assertIsProvider(undefined, 'x')).toThrow()
    expect(() => assertIsProvider('string', 'x')).toThrow()
  })

  it('throws when a required function is missing', () => {
    const incomplete = {
      getMetadata: () => ({ id: 'x', name: 'x', displayName: 'x', supportedFiat: [], supportedCrypto: [], hasWebhook: false }),
      getBootstrap: async () => ({}),
      buildWidgetUrl: () => '',
      getOrigins: () => [],
      // parseEvent missing
    }
    expect(() => assertIsProvider(incomplete, 'incomplete')).toThrow(/parseEvent/)
  })

  it('throws when metadata is missing required fields', () => {
    const badMeta = {
      getMetadata: () => ({ id: 'x' }), // missing the rest
      getBootstrap: async () => ({}),
      buildWidgetUrl: () => '',
      getOrigins: () => [],
      parseEvent: () => ({ type: 'unknown' }),
    }
    expect(() => assertIsProvider(badMeta, 'badMeta')).toThrow(/metadata missing/)
  })
})
