# AstronomiQ CX — Multilingual (Hindi) Chatbot, Sarvam, and Exotel Plan

**Status:** proposed · **Owner:** Samiksha · **Date:** 2026-08-06
**Scope, as agreed:** English + Hindi only for now (no other languages, no general i18n
framework). Sarvam is already partly integrated — this plan finishes wiring it in, it doesn't
add it from scratch. Exotel: get the *existing* voice/IVR code working end-to-end on a free/
trial account — no new channels (SMS/WhatsApp-via-Exotel is explicitly out of scope, see §9).

---

## 1. The problem, stated precisely

None of this is "add multilingual support from zero" — most of the plumbing already exists
and just isn't switched on, or is switched on for the wrong channel. Three separate gaps:

| # | Gap | Evidence |
|---|---|---|
| 1 | The chatbot's Hindi support is cosmetic | `apps/web/src/modules/chatbot/AiChatbot.tsx` — the welcome message says "in English or Hindi" and there's a 🇮🇳 quick-reply, but `send()` calls `ask.mutate({ question, contactId, channel: 'chat' })` with **no `language`**. `AiService.ask()` (`apps/api/src/ai/ai.service.ts`) defaults `options.language` to `'en'` and puts `Reply in en.` in the prompt literally every time — so a customer typing in Hindi still gets an English reply forced by the prompt. Same gap in WhatsApp: `apps/api/src/whatsapp/whatsapp.service.ts:123` calls `this.ai.ask(...)` with no `language` either. |
| 2 | Sarvam is integrated, but only for one thing, in one place that isn't live yet | `VoiceService.transcribeAudio()` (`apps/api/src/voice/voice.service.ts`) really does call Sarvam's `saaras:v3` STT and returns a `languageCode` — but the only caller is `VoiceAi.tsx`, a **browser-mic demo panel** (Guide §10.5/§10.6), not a real phone call. That demo calls `ask.mutateAsync({ question: transcript, channel: 'voice', contactId })` — it throws away the `languageCode` Sarvam just gave it and never passes `language`, so even this one live Sarvam call doesn't reach the language switch in gap #1. The browser-fallback STT path (`VoiceAi.tsx`, used when `SARVAM_API_KEY` isn't set) is hardcoded `recognition.lang = 'en-IN'` — it cannot pick up Hindi at all; only the real Sarvam path can. |
| 3 | Exotel is fully built, but unconfigured and has one function call that will crash on first real use | `TelephonyService`, `ExotelWebhookService`, `IvrFlowService`/`IvrFlowExecutionService` (`apps/api/src/telephony/*`) implement real Exotel calling, bridging, CDR, and DTMF IVR flows — but `EXOTEL_SID` / `EXOTEL_API_KEY` / `EXOTEL_API_TOKEN` are blank in `.env`/`.env.example`, so `isExotelConfigured()` is false and every Exotel-backed feature currently shows "not configured." Separately: **`ExotelWebhookService.resolveTenantId()` calls `resolve_tenant_by_virtual_number(...)` via `$queryRaw`, but that function exists in no migration and not in `packages/db/prisma/rls.sql`** (verified — the file has zero `CREATE FUNCTION` statements today). Same bug class as the `resolve_tenant_by_oidc_subject` issue found during the auth work: the very first real inbound call will 500 instead of routing. |

### What "done" looks like

1. A customer types a question in Hindi in the chat widget (or WhatsApp) and gets a reply in
   Hindi, grounded in the same English-language Knowledge Base — no separate Hindi content
   required. Ask in English, get English back, in the same conversation.
2. The Voice AI demo panel's Sarvam transcription result actually drives which language Astra
   replies in, instead of being silently dropped.
3. A real Exotel trial account is configured; `TelephonyService.integrationStatus()` shows
   `configured: true`; a real inbound call to the trial number is correctly attributed to the
   tenant, drives the published IVR flow, and shows up in Live Calls / CDR.

---

## 2. Decisions

Locked in by your answers:

| Decision | Choice |
|---|---|
| Deliverable | This plan document first; implementation happens in a follow-up pass, phase by phase (same pattern as the Auth & Onboarding plan). |
| Exotel scope | Get the *already-built* voice/IVR features working on a free/trial account. No new Exotel channels (SMS/WhatsApp-via-Exotel) — WhatsApp already has its own Meta Cloud API integration. |
| Languages | English + Hindi only, for now. |

### Decisions I'm making, with rationale — flag if you disagree

**No manual language toggle in the chat widget for v1 — auto-detect from what the customer types.**
Adding a language switcher is more UI/state than the problem needs: the LLM providers already
in use (Claude / GPT via `apps/api/src/ai/llm.ts`) read and write Hindi and Hinglish natively.
The actual fix is to stop the prompt from **forcing** English, and instead ask the model to
mirror the customer's language. This means the fix lives almost entirely in
`AiService.ask()` — it fixes chat **and** WhatsApp in one place, since neither caller currently
passes `language` anyway (both silently get the same `'en'` default today).

**No Sarvam translation layer, and no Hindi copy of the Knowledge Base.**
The KB stays English-only; the LLM translates on the fly as part of answering, the same way it
already turns KB markdown into plain spoken sentences for voice (`reply-style.ts`). Sarvam's
job here is limited to what it's actually good at: Indic speech-to-text (already wired) and,
optionally, more reliable language identification than a regex on Hinglish text would give
(see Phase 3B). Sarvam's own translate API is a fine option later if the KB content itself
needs to *look* Hindi somewhere (e.g. a customer-facing self-service portal) — that's explicit
non-goal #4 in §9.

**Exotel's webhook needs a real reachable URL to test against, not localhost.**
`TelephonyService.integrationStatus()` hardcodes
`webhookUrl: 'https://api.astronomiq.in/api/v1/webhooks/exotel/call'` — a production domain
Exotel can actually reach. Exotel cannot call back into a laptop's `localhost:4000`. Testing a
*real* inbound call therefore needs either a tunnel (ngrok/cloudflared) pointed at local dev, or
running this against a real deployed API URL. Flagging this now so Phase 2 doesn't stall
discovering it mid-test.

---

## 3. Target model

### Language flow (chat + WhatsApp)

```
customer message (any mix of English/Hindi/Hinglish)
        │
        ▼
AiService.ask(tenantId, question, { language: 'auto' (default) })
        │
        ▼
prompt instruction becomes:
  "Reply in the same language the customer's message is written in — only
   English or Hindi are supported right now; if it's a mix, reply in
   whichever is more prominent."
        │
        ▼
LLM (Claude/GPT) answers in that language, grounded in the (English) KB context
```

An explicit `language: 'en' | 'hi'` still works and skips detection — used by Phase 3B for the
Voice AI demo, and available later for anything that already knows the language for certain
(e.g. a future IVR "press 1 for English, 2 for Hindi" menu node).

### Exotel tenant resolution (the missing piece)

```
Inbound call → Exotel → POST/GET /webhooks/exotel/call?CallTo=<virtual number>
        │
        ▼
ExotelWebhookService.resolveTenantId(virtualNumber)
        │
        ▼
  SELECT resolve_tenant_by_virtual_number($1)   ← does not exist today, added in Phase 0
        │
        ▼
withTenant(...) → upsert Call row → drive IVR flow → return Exoml
```

---

## 4. Phased plan

### Phase 0 — Fix the missing tenant-resolution function *(~1 hour, blocks Phase 2)*

- **Edit** `packages/db/prisma/rls.sql` — add, mirroring the shape of the already-planned
  `resolve_tenant_by_oidc_subject` (same `SECURITY DEFINER`/`STABLE`/`search_path = public`
  pattern):

  ```sql
  create or replace function resolve_tenant_by_virtual_number(p_number text)
  returns uuid
  language sql
  security definer
  stable
  set search_path = public
  as $$
    select tenant_id from numbers where number = p_number limit 1
  $$;

  revoke execute on function resolve_tenant_by_virtual_number(text) from public;
  grant execute on function resolve_tenant_by_virtual_number(text) to astronomiq_app;
  ```

- **New migration** `add_resolve_tenant_by_virtual_number` (`--create-only`, paste the above in,
  same recipe as `REQUIREMENTS.txt` describes for the RLS migration).

**Exit check:** `select resolve_tenant_by_virtual_number('+911234500000')` returns `null` for an
unknown number and the tenant's real uuid for a number actually present in `numbers`.

---

### Phase 1 — Exotel free-trial account & credentials *(ops, ~half a day, mostly external wait time)*

- Sign up for Exotel's free/trial plan; obtain **Account SID**, **API Key**, **API Token**, and
  one trial virtual number. Confirm the trial subdomain (usually still `api.exotel.com`).
- **Important trial constraint to plan around:** Exotel trial accounts typically only allow
  calls to/from numbers you've explicitly verified in the account — a call to an unlisted number
  will fail and look exactly like a credentials bug if you don't know this going in. Verify the
  numbers you intend to test with (yours, a colleague's) in the Exotel dashboard first.
- Fill in `.env`: `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SUBDOMAIN` (all
  currently blank in `.env.example`).
- Stand up a tunnel (ngrok/cloudflared) to local `:4000`, or point at a real deployed API URL,
  and set that as the Exotel app's webhook target for `/webhooks/exotel/call` — per the decision
  in §2, `localhost` will not work.
- **Edit** `apps/api/src/telephony/telephony.service.ts#integrationStatus` — `webhookUrl` is
  currently hardcoded to `https://api.astronomiq.in/...`; while at it, make it derive from
  `APP_URL`/env instead so dev and prod show their own real webhook URL, rather than always
  showing production's.
- Buy/claim the trial virtual number in-app: `apps/web/src/modules/telephony/CloudTelephony.tsx`
  → Numbers tab → `createNumber` (`POST` via `TelephonyService.createNumber`), and map it
  (`mappedTo`) to an IVR flow name you'll publish in Phase 2.

**Exit check:** `GET /telephony/integration-status` → `configured: true`, with masked SID/token
visible in the UI (`CloudTelephony.tsx`'s integration card).

---

### Phase 2 — Validate the existing voice/IVR code end-to-end *(~half a day, no new features)*

Everything here already exists in code — this phase is exercising it for real, per the agreed
Exotel scope ("just get the existing voice/IVR features working").

- `TelephonyService.sendTestCall()` — a real Exotel Connect-Two-Numbers loop-back call to a
  verified number completes and shows a `callSid`.
- `TelephonyService.bridgeCall()` — bridges two distinct verified numbers.
- Build a small flow in the IVR builder (Play → Menu → Forward/Voicemail/Hangup), publish it,
  map the trial number to it (`numbers.mappedTo` = flow name).
- Call the trial number from a verified phone: confirm `ExotelWebhookService.handleCallEvent()`
  (now unblocked by Phase 0) upserts the `Call` row through ringing → live → completed, and that
  `IvrFlowExecutionService.step()` drives the right Exoml (`<Gather>`/`<Dial>`/`<Record>`/
  `<Hangup>`) at each turn.
- Confirm `CloudTelephony.tsx`'s Live Calls and CDR tabs populate from these real rows (they
  already read real data — Guide §13.4 — so this should just work once the above is true).

**Exit check:** one full real phone call, inbound, through a published IVR menu, ending in
either a forward or a voicemail, shows up correctly in both the Live console (while ringing) and
the CDR (after completion).

---

### Phase 3 — Make the chatbot actually reply in Hindi *(~half a day)*

This is the smallest phase and the one your message was really about. The DTO already supports
it end to end (`AskAstraDto.language?: string` → `AiController` → `AiService.ask()`); the fix is
almost entirely in one file.

- **Edit** `packages/shared/src/dto/ai.ts` — narrow `language?: string` to
  `language?: 'en' | 'hi' | 'auto'`; document `'auto'` as the default.
- **Edit** `apps/api/src/ai/ai.controller.ts` / `ask-astra.dto.ts` — widen the `@IsIn` /
  type to match; default to `'auto'` when the field is omitted (today it silently becomes
  `'en'` inside `AiService.ask()` — make that default explicit and named).
- **Edit** `apps/api/src/ai/ai.service.ts` — both prompt sites (`ask()`'s order-aware branch and
  its plain-KB branch) currently do `Reply in ${language}.`. When `language` is `'auto'`,
  replace that line with:
  > "Reply in the same language the customer's message is written in — only English or Hindi
  > are supported right now; if it's a mix of both, reply in whichever is more prominent."

  When `language` is explicitly `'en'` or `'hi'`, keep the direct instruction — that path is for
  Phase 3B and any future explicit-language caller.
- No change needed in `AiChatbot.tsx` or `whatsapp.service.ts` — neither passes `language`
  today, so once the default flips from forced-`'en'` to `'auto'`, both channels pick up real
  Hindi replies automatically.

**Exit check:** typing "Mera order kahan hai?" in the chat widget (the existing quick-reply)
gets a Hindi reply grounded in the customer's real order data, not a forced-English one. The
existing English quick-replies still get English replies.

---

### Phase 3B — Wire Sarvam's language signal into the Voice AI demo *(~1–2 hours, optional but cheap)*

Small follow-on now that Phase 3 exists to plug into. Makes actual use of the `languageCode`
Sarvam's STT already returns instead of discarding it.

- **Edit** `apps/web/src/modules/voice/VoiceAi.tsx#stopRecordingAndTranscribe` — the
  `/voice/transcribe` response includes `languageCode` (Sarvam gives e.g. `hi-IN`/`en-IN`);
  pass a mapped `language: 'hi' | 'en'` (prefix match on the code) into the
  `ask.mutateAsync({...})` call in `handleTranscript`, instead of omitting it.
- Leave the browser-fallback path (`recognition.lang = 'en-IN'`) as English-only and unchanged —
  it can't detect Hindi regardless, so there's nothing to wire there; the demo's notice text
  already tells the user this is the "no key" fallback.

**Exit check:** speaking a Hindi sentence into the mic (real Sarvam path, `SARVAM_API_KEY` set)
produces a Hindi transcript *and* a Hindi spoken reply back, in one turn.

---

## 5. Suggested sequencing

| Order | Phases | Why together | Rough size |
|---|---|---|---|
| 1 | 0 | Tiny, unblocks Phase 2, zero risk. Do it first regardless of Exotel account status. | ~1 hour |
| 2 | 3, 3B | Independent of Exotel entirely — can land the same day, unblocks visible Hindi support immediately. | ~half a day |
| 3 | 1 | Ops task — sign-up, credential collection, tunnel setup. Can run in parallel with step 2's coding. | ~half a day (+ Exotel's own approval time, if any) |
| 4 | 2 | Needs both Phase 0 (code) and Phase 1 (credentials/tunnel) done first. | ~half a day |

**~1.5–2 working days** total, most of it validation rather than new code — this is a "turn on
what's already built" pass, not a build-from-scratch one.

---

## 6. Environment variables

No new variables required — `EXOTEL_SID` / `EXOTEL_API_KEY` / `EXOTEL_API_TOKEN` /
`EXOTEL_SUBDOMAIN` and `SARVAM_API_KEY` already exist in `apps/api/src/config/env.ts`'s zod
schema and `.env.example`; they just need real values (Phase 1). One optional addition while
touching `telephony.service.ts` in Phase 1:

```ini
# ---- optional: only if you don't want the webhook URL shown in the UI to always say prod ----
PUBLIC_WEBHOOK_BASE_URL=          # e.g. your ngrok URL in dev, APP_URL-derived in prod
```

---

## 7. Risks and how they're handled

| Risk | Handling |
|---|---|
| Exotel trial account can't call unverified numbers | Called out in Phase 1 before anyone burns time thinking it's a code bug. |
| Exotel can't reach `localhost` for webhooks | Tunnel or deployed URL, decided in §2 before Phase 2 starts. |
| Hinglish (code-mixed English/Hindi) is genuinely ambiguous to detect | The prompt instruction in Phase 3 explicitly tells the model to pick "whichever is more prominent" rather than requiring a hard classification; Phase 3B's Sarvam signal is authoritative when available (voice), the LLM's own read is used everywhere else (chat/WhatsApp). |
| Missing SQL function repeats the exact class of bug found in the auth work | Phase 0 exists specifically because this was caught by re-checking the pattern, not by a failed live call. |
| Reply quality in Hindi depends on the configured LLM provider, not something this repo controls | No code fix possible here — both Claude and GPT-4o-mini (the two supported providers) produce fluent Hindi; if quality is ever a problem it's a model/prompt tuning question, not a plumbing one. |

---

## 8. Explicitly out of scope

A live, speech-driven voice bot over real Exotel phone calls (STT → LLM → TTS *during an actual
call*, not the browser-mic demo) — `VoiceService`'s own comment already flags this as "a
separate, much bigger piece," and it's unrelated to getting the existing DTMF-only IVR working ·
Exotel for SMS or WhatsApp (WhatsApp already has its own Meta Cloud API integration) ·
languages beyond English/Hindi · a general i18n framework for UI chrome (buttons, labels, admin
screens) — this plan only makes the *conversation* bilingual, not the product UI · translating
the Knowledge Base into Hindi · Sarvam's Translate API · an in-widget manual language switcher.
