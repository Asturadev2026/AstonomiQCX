# @aq/web — the AstronomiQ CX frontend

Exact port of `docs/AstronomiQ-CX_1.html`. That file is the pixel spec — keep it
open in a browser next to your editor.

## Run

```bash
pnpm --filter @aq/web dev   # http://localhost:3000
```

**There is no mock data anywhere.** Every hook in `src/lib/api/hooks.ts` makes
a real HTTP call to `/api/v1/*` (proxied to the NestJS API on :4000). Until the
API + database are running, views render their error state — that's correct.
The demo data lives in the DATABASE (seed scripts, Plan §3.3), never in this app.

## How to port a view (the pattern)

`src/modules/overview/CommandCentre.tsx` is the finished example. For each view:

1. Open the prototype, find `<section id="{viewId}">` and its `render*()`
   functions + data arrays in the `<script>`.
2. Create `src/modules/{viewId}/{Name}.tsx`. Copy the markup as JSX —
   **same class names, verbatim** (`class`→`className`, `stroke-width`→`strokeWidth`,
   inline styles→objects). All styling already exists in `styles/prototype.css`.
3. Define the response type in `src/lib/api/types.ts` (endpoint contract is in
   `docs/AstronomiQ-CX-Implementation-Plan.md` §5), add a hook in
   `src/lib/api/hooks.ts`, and read ONLY from the hook. The view's dummy arrays
   from the prototype become DATABASE SEED rows (`packages/db/src/seed`), never
   frontend code. Use `LoadingState`/`ErrorState`/`EmptyState` from
   `components/states.tsx`. No literals in the component.
4. Register the component in the `PORTED` map in `src/App.tsx`.
5. Compare against the prototype side by side. It must be indistinguishable.

## Work split suggestion (Phase A, UI-first)

| Dev 1 | Dev 2 |
|---|---|
| inbox (3-pane, biggest) | tickets (kanban) |
| convhub | sla (scorecards + countdowns) |
| chatbot + kb | customer (C360) + departments |
| analytics (SVG charts) | surveys + qa |
| telephony (6 tabs, big) | workforce + contactcentre |
| campaigns + journey | automations + macros + audit |
| voice + builder | billing + settings + portal + fieldservice + priomatrix |

Countdown timers (SLA breaches): render from a `targetAt` timestamp in the
fixture, ticking with `Date.now()` — never a decrementing counter (Plan §10.3).
