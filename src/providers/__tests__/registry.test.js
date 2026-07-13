import { describe, it, expect } from 'vitest'
import {
  PROVIDERS,
  PROVIDER_IDS,
  ENABLED_PROVIDER_IDS,
  getProvider,
  listProviderMetadata,
  listEnabledProviderMetadata,
} from '../index.js'
import { assertIsProvider } from '../Provider.js'

describe('provider registry', () => {
  it('exports all four providers', () => {
    expect(PROVIDER_IDS).toEqual(expect.arrayContaining(['transak', 'mtpelerin', 'topper', 'guardarian']))
    expect(PROVIDER_IDS.length).toBe(4)
  })

  it('enables only Transak unless another provider is explicitly flagged', () => {
    expect(ENABLED_PROVIDER_IDS).toEqual(['transak'])
    expect(listEnabledProviderMetadata().map((provider) => provider.id)).toEqual(['transak'])
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
    expect(getProvider('guardarian')).toBe(PROVIDERS.guardarian)
  })

  it('getProvider throws on unknown id', () => {
    expect(() => getProvider('coinbase')).toThrow(/unknown provider/)
    expect(() => getProvider('')).toThrow()
  })

  it('listProviderMetadata returns metadata for every provider with id matching the registry key', () => {
    const list = listProviderMetadata()
    expect(list.length).toBe(4)
    for (const meta of list) {
      expect(PROVIDER_IDS).toContain(meta.id)
      expect(meta.name).toBeTruthy()
      expect(Array.isArray(meta.supportedFiat)).toBe(true)
      expect(Array.isArray(meta.supportedCrypto)).toBe(true)
      expect(typeof meta.hasWebhook).toBe('boolean')
    }
  })

  it('mtpelerin and guardarian are the hasWebhook=false providers', () => {
    const list = listProviderMetadata()
    const noWebhook = list.filter((m) => !m.hasWebhook).map((m) => m.id).sort()
    expect(noWebhook).toEqual(['guardarian', 'mtpelerin'])
  })

  it('guardarian is the only redirect-checkout provider', () => {
    const list = listProviderMetadata()
    const redirect = list.filter((m) => m.checkout === 'redirect').map((m) => m.id)
    expect(redirect).toEqual(['guardarian'])
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
