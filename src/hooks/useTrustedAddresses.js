import { useState, useCallback, useEffect } from 'react'

// trusted recipient addresses — a local, per-device convenience for repeat
// payments. NO PII and NO server: we store only a user-chosen nickname mapped
// to an address (+ the asset network so we can re-validate on recall). lives
// in localStorage, scoped to this browser. clearing browser data wipes it.
//
// shape: Array<{ id, nickname, address, network, createdAt }>
// (createdAt is a plain epoch ms passed in by the caller — this hook never
// reads the clock itself, keeping it deterministic/testable.)

const STORAGE_KEY = 'onramp:pay:trusted-addresses'
const MAX_ENTRIES = 50 // sanity cap so a runaway never bloats localStorage

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // defensive: drop any malformed entries (hand-edited storage, old shapes)
    return parsed.filter(
      (e) => e && typeof e.address === 'string' && typeof e.nickname === 'string',
    )
  } catch {
    return []
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    /* storage disabled / private mode — feature degrades to ephemeral */
  }
}

// stable id without pulling a uuid dep — address+network is unique enough for
// a per-device list (we dedupe on it anyway).
function entryId(address, network) {
  return `${(network || '').toLowerCase()}:${address.toLowerCase()}`
}

export function useTrustedAddresses() {
  const [entries, setEntries] = useState(readAll)

  // keep multiple mounts (e.g. form + a picker) in sync within the same tab.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setEntries(readAll())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const save = useCallback(({ nickname, address, network, createdAt }) => {
    const addr = (address || '').trim()
    const nick = (nickname || '').trim()
    if (!addr || !nick) return false
    setEntries((prev) => {
      const id = entryId(addr, network)
      // upsert: replace an existing entry with the same address+network so we
      // don't accumulate duplicates when a user re-saves with a new nickname.
      const without = prev.filter((e) => entryId(e.address, e.network) !== id)
      const next = [
        { id, nickname: nick, address: addr, network: network || null, createdAt: createdAt || 0 },
        ...without,
      ].slice(0, MAX_ENTRIES)
      writeAll(next)
      return next
    })
    return true
  }, [])

  const remove = useCallback((id) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id)
      writeAll(next)
      return next
    })
  }, [])

  const has = useCallback(
    (address, network) => {
      const id = entryId((address || '').trim(), network)
      return entries.some((e) => e.id === id)
    },
    [entries],
  )

  return { entries, save, remove, has }
}

export { STORAGE_KEY as TRUSTED_ADDRESSES_KEY }
