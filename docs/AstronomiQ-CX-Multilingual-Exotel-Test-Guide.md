# Test Guide — Hindi Chatbot, Sarvam & Exotel

**Date:** 2026-08-06 · **Covers:** what was implemented on 2026-08-06 (Phases 0, 1-partial, 3, 3B of
`AstronomiQ-CX-Multilingual-Sarvam-Exotel-Plan.md`). Migration applied, `pnpm typecheck` clean.

---

## 0. Before you start — your current config

Read this first; three of these change what you'll actually see.

| Thing | State | What it means for testing |
|---|---|---|
| `SARVAM_API_KEY` | **set** | Voice AI uses real Sarvam STT. Hindi speech will transcribe. |
| `ELEVENLABS_API_KEY` | **empty** | TTS falls back to your browser's speaker. Replies are *spoken by Chrome*, not ElevenLabs. Not a bug. |
| `ANTHROPIC_API_KEY` | **empty** | |
| `OPENAI_API_KEY` | **set** | **Your active LLM is OpenAI `gpt-4o-mini`.** `LLM_MODEL=claude-sonnet-5` in `.env` is ignored (that var only applies to Anthropic). Hindi quality is good but not Sonnet-level — if replies feel weak, that's the model, not the plumbing. |
| `EXOTEL_*` (4 vars) | **set** | Integration card should show "configured". |
| `PUBLIC_WEBHOOK_BASE_URL` | **empty** | Integration card will show the `APP_URL`-derived webhook URL. Set this once you have a tunnel (§4). |
| Published Agent Builder chat flow | **none** (seed creates zero) | Chat uses the plain KB path — the one the Hindi fix targets. **See §3.3 before you publish a flow.** |

Start the app:

```bash
pnpm dev          # web :3000, api :4000
```

Auth isn't wired yet, so the app still uses the `x-tenant` dev header — just open
`http://shopnova.localtest.me:3000` and you're in as the demo tenant.

---

## 1. Hindi chatbot — the main thing to test (5 min)

**Where:** left sidebar → **AI Chatbot**

| # | Do this | Expect |
|---|---|---|
| 1 | Type `Mera order kahan hai?` | Reply **in Hindi, in Devanagari script**, grounded in real order data. *Before this change it always answered in English.* |
| 2 | Click the **🇮🇳 Hindi me help** quick reply | Same — Hindi reply. |
| 3 | Type `Where is my order?` | Reply **in English**. Proves it mirrors the customer, not a global toggle. |
| 4 | Type `Mujhe refund chahiye` | Hindi reply, or a Hindi escalation + ticket ref. |
| 5 | Mixed: `Mera order ZK-6 ka status kya hai?` | Hindi reply naming order **ZK-6** specifically. |
| 6 | Alternate English → Hindi → English in one conversation | Each reply follows *that* message's language. |

**Use the "test as customer" panel on the right** — pick a contact with orders, otherwise order
questions can't ground on anything and you'll get "please share your order reference."

### What "pass" looks like
Language follows the customer's message every time, and English behaviour is unchanged from before.

### If Hindi doesn't come back
- Is `OPENAI_API_KEY` valid? A rejected key makes the widget say *"I'm not connected to an AI
  provider yet"* — that's a key problem, not a language problem.
- Did you publish an Agent Builder flow at some point? → §3.3.

---

## 2. WhatsApp — same fix, no extra work (2 min)

**Where:** sidebar → **WhatsApp Bot**

The same `AiService.ask()` powers WhatsApp, and it also never passed a language. Send a Hindi
message through the WhatsApp tester and expect a Hindi reply. If WhatsApp isn't connected
(`WA_*` vars are empty), skip this — nothing about it is specific to this change.

---

## 3. Voice AI — Sarvam's language now drives the reply (5 min)

**Where:** sidebar → **Voice AI** · needs a working mic, use Chrome or Edge

| # | Do this | Expect |
|---|---|---|
| 1 | Press the green call button | Notice reads: *"Sarvam speech-to-text is live (Hindi and English). Replies play through your browser's speaker — add ELEVENLABS_API_KEY…"* |
| 2 | Speak a Hindi sentence, e.g. *"Mera order kahan hai"* | Transcript appears in Hindi **and** the spoken reply is Hindi. |
| 3 | Speak English | English transcript, English reply. |
| 4 | Check the transcript panel | Your line under **You**, Astra's under **Astra AI**. |

**3.1 — The notice text is the tell.** If it still says *"no Sarvam/ElevenLabs key yet"*, the app
didn't pick up your `.env` — restart the API.

**3.2 — Robotic voice is expected.** That's Chrome's built-in speech, because ElevenLabs is
unset. Add `ELEVENLABS_API_KEY` to get real synthesized speech (its
`eleven_multilingual_v2` model handles Hindi).

**3.3 — Published Agent Builder flows are now bilingual too (fixed 2026-08-06).**
Publishing a chat flow (**Agent Builder → Publish**) switches every channel to
`FlowExecutionService`, which answers common intents from instant templates that never reach the
LLM. Those were English-only — a Hindi *"mujhe refund chahiye"* got an English refund card. Both
halves are now fixed: the templates have Hindi twins (`apps/api/src/ai/replies.ts`), and the
intent keywords understand Hindi phrasing (`kahan`, `wapas`, `paise`…), which previously caused
Hindi messages to misroute. Note the flow is cached 30s, so publishing/unpublishing takes up to
half a minute to take effect.

### Test the flow path (only if you have a published chat flow)

| Say this | Expect |
|---|---|
| `mujhe refund chahiye` | Refund eligibility card **in Devanagari** — *"आपके हाल के ऑर्डर में से अभी कोई भी रिफंड के लिए एलिजिबल नहीं है।"* |
| `I want a refund` | Same card in **English** |
| `mera order kahan hai` | Tracking card in Devanagari (*"आपके ऑर्डर का लेटेस्ट अपडेट यह है:"*) |
| `namaste` | Hindi greeting, in Devanagari |
| `hi` | English greeting — proves "hi" isn't misread as Hindi |

⚠️ **Language detection for these templates is a word-list heuristic, not the LLM** — templates
answer in milliseconds and can't wait for a model round-trip. It keys off romanized Hindi
function words (`mera`, `mujhe`, `kahan`, `chahiye`, `hai`…) and Devanagari **in the customer's
incoming message** — that detection is unaffected by this change. What changed is the *reply*
script: template replies and LLM replies now both render Hindi in Devanagari, not romanized
Hinglish. Very short or ambiguous messages (`ok`, `1`) default to English. Anything that reaches
the LLM still uses the model's own judgement, which is more accurate.

---

## 4. Exotel — read this before testing calls

Credentials are in, so the read-only parts work now. **Live inbound calls need two setup steps
that aren't done yet.**

### 4.1 — Works right now (1 min)
**Where:** sidebar → **Cloud Telephony → Integration**

- Shows **configured**, with masked SID and token (last 4 digits only).
- **Webhook URL** now reflects your environment instead of always claiming
  `api.astronomiq.in` — that was the bug fixed here.

### 4.2 — Test outbound calling (2 min)
Integration tab → **Send test call** with your own mobile number.

> ⚠️ **Exotel trial accounts only call numbers verified in the Exotel dashboard.** Verify your
> number there first. An unverified number fails in a way that looks exactly like bad
> credentials.

Expect your phone to ring; the UI returns a `callSid`. A `4xx` means credentials or an
unverified number.

### 4.3 — Inbound calls + IVR (needs setup)
This is the part the database fix unblocked. Exotel **cannot reach `localhost`**, so:

1. **Tunnel your API:** `ngrok http 4000` → copy the `https://…` URL.
2. Set `PUBLIC_WEBHOOK_BASE_URL=https://<your-ngrok>` in `.env`, restart the API.
3. In the **Exotel dashboard**, point your trial number's applet at
   `https://<your-ngrok>/api/v1/webhooks/exotel/call`.
4. **Cloud Telephony → Numbers → add your real trial number.** ⚠️ **Format must match exactly
   what Exotel sends as `CallTo`** (usually `0XXXXXXXXXX` or `+91XXXXXXXXXX`). The four seeded
   numbers (`1800-266-0000` etc.) are demo rows and will never match a real call. A format
   mismatch = *"this number is not in service"*.
5. Build a flow in **IVR Builder** (Play → Menu → Forward/Hangup), **Publish** it, and set the
   number's *Mapped to* field to that flow's name.
6. Call your trial number.

| Expect | Where |
|---|---|
| Call appears while ringing | **Live** tab |
| IVR prompt plays, keypress routes | your phone |
| Row with duration + disposition after hangup | **CDR** tab |

If you hear *"this number is not yet configured with a call flow"* → the number's *Mapped to*
doesn't match a **published** IVR flow name. If you hear *"not in service"* → step 4's format.

---

## 5. Regression check (2 min)

The language change touched a shared prompt path, so confirm nothing English broke:

- English chatbot answers, order tracking, and escalation-with-ticket all behave as before.
- Voice replies are still short spoken sentences with **no markdown read aloud** (asterisks
  etc.) — this shares the file the language helper moved into.
- **Knowledge Base** still saves articles normally (its own unrelated `language` field was
  deliberately left alone).

---

## 6. On UI changes — being straight with you

**No new UI controls were added, and that's deliberate on two counts.**

1. **The Hindi feature is auto-detect by design.** There's no language dropdown because the bot
   reads the customer's language from their message. A real customer would never touch a toggle
   — adding one is more state and more to get wrong for no gain.
2. **Repo Rule 4** (`REQUIREMENTS.txt`) says the UI must match `docs/AstronomiQ-CX_1.html`
   exactly. Adding widgets to the chat frame breaks that rule, so I didn't do it unasked.

What the widget already had before this work: the bilingual welcome line and the 🇮🇳 Hindi
quick reply. Those were previously **cosmetic promises** the backend didn't honour — this change
makes them real, which is why nothing visually moved.

The one UI change I did make is the **Voice AI notice text** (§3.1) — with Sarvam set and
ElevenLabs empty, it was flatly claiming no Sarvam key, hiding the fact that Hindi transcription
had gone live. It now reports each piece accurately.

**Optional, if you want them — say the word:**

- A small "🇬🇧 EN / 🇮🇳 हिं" pill on the chat header to force a language (useful for demos,
  where auto-detect on a short "hi" is a coin flip). Needs a Rule 4 exception.
- A detected-language badge on each Voice AI transcript line.
- Hindi versions of the Agent Builder template replies from §3.3 — the biggest real gap.

---

## 7. Fast path if you only have 10 minutes

1. `pnpm dev`
2. **AI Chatbot** → `Mera order kahan hai?` → Hindi reply ✅ *(the headline fix)*
3. Same widget → `Where is my order?` → English reply ✅ *(didn't break English)*
4. **Cloud Telephony → Integration** → shows configured, correct webhook URL ✅
5. **Voice AI** → press call, speak Hindi → Hindi transcript + reply ✅

That covers everything shipped. Exotel inbound (§4.3) is the only piece still needing setup.
