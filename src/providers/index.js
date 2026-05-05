// provider registry. add a new on-ramp provider by:
//   1. implementing the Provider interface in src/providers/<id>/index.js
//   2. importing it here
//   3. adding it to PROVIDERS
//   4. extending public/.htaccess CSP frame-src + connect-src
//   5. (if it has webhooks) wiring backend/providers/<id>.js + endpoint in backend/app.js
//
// see docs/PROVIDERS.md for the full checklist.

import { assertIsProvider } from './Provider.js'
import transak from './transak/index.js'
import mtpelerin from './mtpelerin/index.js'
import topper from './topper/index.js'

// dev-time shape check. throws at module load if any provider is malformed.
assertIsProvider(transak, 'transak')
assertIsProvider(mtpelerin, 'mtpelerin')
assertIsProvider(topper, 'topper')

export const PROVIDERS = {
  transak,
  mtpelerin,
  topper,
}

export const PROVIDER_IDS = Object.keys(PROVIDERS)

export function getProvider(id) {
  const p = PROVIDERS[id]
  if (!p) throw new Error(`unknown provider: ${id}`)
  return p
}

// list metadata for all providers — used by the comparison UI.
export function listProviderMetadata() {
  return PROVIDER_IDS.map((id) => PROVIDERS[id].getMetadata())
}
