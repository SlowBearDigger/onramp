// backward-compat shim — useTransak is now a thin wrapper around useProvider
// pinned to the transak provider. existing callsites work unchanged; new code
// should use useProvider directly so the picked provider can vary at runtime.
//
// once SwapWidget is fully migrated to useProvider, this file can be deleted.

import { useCallback } from 'react'
import { useProvider } from './useProvider.js'

export function useTransak(opts) {
  const inner = useProvider(opts)

  const startOrder = useCallback((params) => {
    return inner.startOrder({ ...params, providerId: 'transak' })
  }, [inner])

  return {
    ...inner,
    startOrder,
  }
}
