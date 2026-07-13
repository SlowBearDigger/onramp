# Uniform App Navigation Design

## Goal

Make navigation between `/buy`, `/sell`, `/history`, `/swap`, and `/pay` feel like one continuous application. The desktop sidebar and mobile bottom navigation remain mounted while only the central route content transitions.

## Current Problem

`/buy`, `/sell`, and `/history` share `SwapPage`, so their internal transitions feel continuous. `/swap` and `/pay` use separate page components that each mount their own `Sidebar` and `BottomNav`. Moving to either route replaces the whole app surface and replays page-entry animation, which looks like a reload even though React Router performs client-side navigation.

## Considered Approaches

1. Animate the complete route tree. This is the smallest code change, but the navigation chrome still disappears and re-enters, and switching routes can lose local state.
2. Add matching animations independently to every page. This reduces the visual jump but preserves duplicated shell ownership and makes future routes easy to implement inconsistently.
3. Introduce a persistent app shell. This keeps shared navigation mounted and gives all product routes one content-transition boundary. This is the selected approach.

## Design

Create an `AppShell` component that owns `Sidebar`, `BottomNav`, the shared app viewport, and the first-visit onboarding layer. Product routes render their route-specific content inside the shell through React Router's `Outlet`.

Use a short opacity and vertical-position transition around the outlet. The transition key groups `/buy`, `/sell`, and `/history` as the ramp workspace so `SwapPage` remains mounted and preserves form state. `/swap` and `/pay` each receive their own key and transition cleanly when entered or left.

Route pages will stop rendering duplicate navigation. Their content containers retain their current widths, spacing, responsive behavior, and feature-specific layers. Shared overlays that are truly global to the product surface move to `AppShell`; route-specific overlays remain with their route.

Animations must honor reduced-motion preferences by removing positional movement and shortening or eliminating the fade when the user requests reduced motion.

## Route Structure

- `/buy`, `/sell`, `/history`: existing ramp workspace and preserved form state.
- `/swap`: existing SwapKit preview content.
- `/pay`: existing recipient-payment content.
- Public, legal, not-found, and admin routes remain outside `AppShell`.

## Error And Loading Behavior

Lazy route loading continues to use the existing `RouteFallback`. The persistent navigation remains visible while a route chunk loads. Existing error boundaries and provider error handling are unchanged.

## Tests

Add an E2E navigation regression test that:

- starts at `/buy`;
- records stable sidebar and bottom-navigation elements;
- navigates to `/swap`, `/pay`, `/history`, and back to `/buy` through visible controls;
- verifies URL and route content after each interaction;
- verifies the document did not reload and shared navigation stayed mounted;
- keeps the existing test proving that amount input survives `Buy` to `Sell` to `Buy`.

Run the focused E2E navigation tests, frontend unit suite, production build, and rendered desktop/mobile checks with console inspection.

## Out Of Scope

- Activating unfinished providers or changing provider credentials.
- Completing the SwapKit quote/execution flow.
- Enabling `/pay` for production before written provider approval.
- Rewriting legal content or fixing unrelated pricing and currency behavior.
