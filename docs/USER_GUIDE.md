# OnRamp — User Guide

This guide covers how to use the public OnRamp PWA to buy or sell crypto. No
account, signup, or login is required — your wallet address is the only thing
the app remembers (locally, in your browser).

## What this app is

OnRamp is an aggregator: a single interface in front of three on-ramp
providers (Transak, Mt Pelerin, and Topper). It does not custody your
crypto, hold your funds, or process payments itself. When you place an
order, the actual purchase or sale happens inside the chosen provider's
widget — including KYC, payment, and on-chain transfer. OnRamp shows you
real-time quotes from each provider so you can pick the best one before
delegating to their widget.

## Buying crypto

1. Open the app at the home page. Click **Buy Now** (or **Open** in the
   header) to enter the swap interface.
2. Make sure the **Buy** tab is selected at the top.
3. Type the amount of fiat you want to spend (e.g. `100` USD), or click one
   of the quick-amount chips.
4. Pick the cryptocurrency you want to receive from the dropdown. The
   network is auto-selected per crypto (e.g. BTC → Bitcoin, ETH →
   Ethereum).
5. Optional: change the fiat currency in the top-right selector. USD, EUR,
   GBP, ARS, BRL, MXN are supported.
6. Paste your destination wallet address into the field. The app
   remembers your last-used address for next time.
7. Click **Continue**. The app fetches a live quote from each provider in
   parallel — you'll see three comparison cards with `cryptoAmount`,
   `fee`, and rate, plus a **Best Rate** / **Lowest Fee** badge where
   applicable.
8. Click the provider you want. The provider's widget opens in a modal.
   Complete KYC (if it's your first time with that provider) and pay
   inside their widget.
9. The order will appear in your **History** tab once the provider
   confirms it.

## Selling crypto (off-ramp)

1. Click the **Sell** tab in the swap interface.
2. Type the amount of crypto you want to sell, or click a chip.
3. Pick the cryptocurrency from the dropdown.
4. Pick the fiat currency you want to receive in the top-right selector.
5. Paste the wallet address that holds the crypto you're selling.
6. Click **Continue** and pick a provider on the comparison screen.
7. Inside the provider widget, you'll be asked for your bank or payout
   destination (the provider handles this — OnRamp never sees those
   details). Send the crypto from your wallet as the widget instructs.
8. The fiat lands in your bank account per the provider's payout schedule.

## Tracking an order

The **History** tab shows every order you've started, sourced from the
backend (which receives signed webhooks from each provider). Each row has:

- **Status** — coarse: `Pending`, `Completed`, `Failed`. The expanded
  detail shows the granular state too: "Awaiting your payment",
  "Provider processing", "Crypto sent on-chain", etc.
- **Polling indicator** — while at least one order is in-flight, the
  header shows "Checking…" with a small dot animation. Once everything
  is terminal, it shows "Updated Xs ago".
- **Unverified badge** (orange) — appears on Mt Pelerin orders only,
  because Mt Pelerin doesn't expose webhooks. Their status comes from
  the in-browser event the widget emits, not from a signed callback.
  Treat as best-effort until you confirm the transaction on-chain.
- **Tx hash** — when present, links to the appropriate block explorer
  (mempool.space for BTC, etherscan.io for ETH, polygonscan for
  Polygon, etc.). Clicking opens it in a new tab.

The list is **per browser**. Each order creates a random access ID stored
locally after the provider widget opens. Clearing browser data or switching
devices removes those access IDs, so that device can no longer request the
history. A wallet address alone is not enough to retrieve orders. Browsers
from versions that predate access IDs cannot automatically import their old
wallet-based history because doing so would reintroduce public wallet lookup.

## Settings

- **Theme** — sun/moon icon in the header toggles light/dark. Persists.
- **Language** — globe icon in the header. EN / ES / FR / DE.
  Persists. The page's `<html lang>` updates accordingly.
- **Privacy disclosure** — appears once on first visit. We don't run
  analytics or advertising trackers. The full policy is at `/privacy`.

## Installing as a PWA

On a phone, your browser will prompt "Add to Home Screen" after a
short visit. Tap accept and the app launches in standalone mode (no
browser chrome). Installed PWA users land directly on the swap screen
on subsequent launches; the brand link in the sidebar still goes back
to the marketing landing if you want it.

On desktop, look for an install icon in the URL bar (Chrome / Edge).

## Privacy

- No account creation. The app cannot identify you across devices.
- The browser stores random order access IDs, theme,
  language, and the privacy-disclosure dismissal flag in `localStorage`.
- The provider you pick handles KYC and payment. They have their own
  privacy policies. OnRamp never sees your government ID or bank
  details — those go directly to the provider's widget.
- Order history requests use random order access IDs, not a public wallet
  lookup. The provider still receives the destination wallet inside its
  hosted widget.
- See the full privacy policy at `/privacy` and terms at `/terms`.

## Help

If a provider widget doesn't load:
1. Check the network — providers' widgets are iframed, so a flaky
   connection blocks them.
2. Check the browser console for CSP errors. The app's CSP allowlists
   each provider's domain; if you've forked the code and added a new
   provider, extend `frame-src` and `connect-src` in
   `public/.htaccess`.
3. Pop the browser dev tools' Network tab to see if the provider's
   API is rate-limiting you (rare on staging, more common in
   production).

For provider-specific support (a stuck order, KYC rejection, refund
request), contact the provider directly — OnRamp doesn't have access
to their internal queues. Provider support links are at the bottom of
each provider's widget.
