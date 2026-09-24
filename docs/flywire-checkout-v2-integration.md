# Flywire Checkout V2 — Integration Reference

> Hands-on reference for adding Flywire Checkout V2 to any web app, using this repo as a working example.

---

## TL;DR

Three files. Read them in this order:

1. **[`public/index.html`](../public/index.html)** — `<script>` tag that loads `connect.js`.
2. **[`public/flywire-checkout.js`](../public/flywire-checkout.js)** — the entire SDK integration. Copy this file as-is.
3. **[`server.js`](../server.js)** — `/api/flywire-session` proxy that creates and reads authenticated sessions with the secret API key.

Everything else in this repo is demo-app scaffolding (rooms, guest form, success view, sales drawer) and is irrelevant to the integration.

---

## Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────────┐
│ Browser                      │         │ Your server                      │
│                              │         │                                  │
│  index.html                  │         │  POST /api/flywire-session       │
│  ├─ <script connect.js>      │ ──────▶ │  GET  /api/flywire-session/:id   │
│  │  → window.cpx_core        │         │  └─ X-Authentication-Key         │
│  │                           │         │     ────▶ api-platform.flywire   │
│  ├─ flywire-checkout.js      │         │           /commercial_payex/v2/  │
│  │  └─ FlywireCheckout       │         │           session                │
│  │     .launch()             │         └──────────────────────────────────┘
│  │     → cpx_core.start(…)   │
│  │                           │
│  └─ app.js (host app)        │
└──────────────────────────────┘
```

The browser only ever talks to:
- `connect.js` (CDN, public)
- Your server proxy (session create and lookup)

The **secret API key never leaves your server**.

---

## Playground crosswalk

`FlywireCheckout.launch()` takes the `transaction`, `config` and `styles` sections exactly as the SDK expects them. The demo drawer combines these samples:

| Capability                    | Payload                                                                         | Session           | Playground                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Payment                       | `{ type: 'payment', details: { amount } }`                                      | recommended       | [Common fields](https://checkout.demo.flywire.com/playground/payment/common_fields)                                     |
| Pre-authorization             | `details.authorization: 'preauth'`                                              | recommended       | [Payment with preauth](https://checkout.demo.flywire.com/playground/payment/with_preauth)                               |
| Split payment                 | `details.split: [{ recipient, amount, description }]`                           | recommended       | [Payment with split](https://checkout.demo.flywire.com/playground/payment/split)                                        |
| Waive surcharge               | `details.waive_adjustments: ['surcharge']`                                      | recommended       | [Waived surcharge](https://checkout.demo.flywire.com/playground/payment/waive_adjustments)                              |
| MOTO                          | `details.channel: 'moto'` (payment only)                                        | recommended       | [MOTO payment](https://checkout.demo.flywire.com/playground/payment/moto) *(not yet on demo)*                           |
| Tokenization                  | `{ type: 'tokenization', details?: { amount, authorization? } }`                | **required**      | [Tokenization](https://checkout.demo.flywire.com/playground/tokenization/without_amount)                                |
| Optional tokenization         | `{ type: 'optional_tokenization', details: { amount, authorization? } }`        | **required**      | [Optional tokenization](https://checkout.demo.flywire.com/playground/optional_tokenization/standard)                    |
| Implicit tokenization         | `{ type: 'implicit_tokenization', details: { amount, authorization? } }`        | **required**      | [Implicit tokenization](https://checkout.demo.flywire.com/playground/implicit_tokenization/standard)                    |
| Embedded                      | `config.embed_to: '#selector'`                                                  | any               | [Payment embedded](https://checkout.demo.flywire.com/playground/payment/embedded)                                       |
| Offer rules                   | `config.offer_rules: { filters, sort }`                                         | any               | [Offer rules](https://checkout.demo.flywire.com/playground/payment/offer_rules)                                         |
| Timeout                       | `config.timeout: { type: 'checkout' \| 'operation', duration }` (≥ 180 s)       | any               | [Payment with timeout](https://checkout.demo.flywire.com/playground/payment/timeout) *(not yet on demo)*                |
| Custom styles                 | `styles: { primary_color, primary_font, base_font_size, base_space }`           | any               | [Custom styles](https://checkout.demo.flywire.com/playground/payment/with_styles)                                       |

Amounts are integers in minor units (`735000` = $7,350.00). Split portions are part of `amount`, not on top of it.

---

## Step 1 — Load the SDK

```html
<script src="https://checkout.demo.flywire.com/gateway/connect.js" async></script>
```

This installs `window.cpx_core`, which exposes a single method:

```js
window.cpx_core.start(initFields)   // opens the checkout
```

Use the **demo** URL above for sandbox; swap to `https://checkout.flywire.com/gateway/connect.js` before go-live.

---

## Step 2 — Create an authenticated session on your server

Authenticated sessions are recommended for every flow and required for all tokenization types. Your server calls Flywire with the secret key:

```bash
curl -X POST \
  -H "X-Authentication-Key: $CPX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config":{"event_url":"https://your-app.example.com/flywire/events"}}' \
  "https://api-platform.demo.flywire.com/commercial_payex/v2/session"
```

Response (safe to send to the browser):

```json
{ "id": "…", "run_id": "…", "run_token": "…" }
```

`config.event_url` is optional; when set, Flywire posts session events there. The reference proxy is `POST /api/flywire-session` in [`server.js`](../server.js).

---

## Step 3 — Build `initFields` and call `start()`

```js
const session = await fetch('/api/flywire-session', { method: 'POST' }).then(r => r.json());

window.cpx_core.start({
  recipient:   { client_id: '…', code: '…' },
  transaction: { type: 'payment', details: { amount: 735000 } },
  payer:       { fields: { first_name: '…', last_name: '…', email: '…' } },
  config:      { locale: 'en' },
  session,
  response: {
    on_end:   (reason, payload) => handleEnd(reason, payload),
    on_error: (type, payload) => handleError(type, payload),
  },
});
```

[`public/flywire-checkout.js`](../public/flywire-checkout.js) wraps this as `FlywireCheckout.launch({ recipient, transaction, payer, config, styles, authenticated, onComplete, onCancel, onTimeout, onError })`.

---

## Step 4 — Handle completion

```js
async function handleEnd(reason, payload) {
  if (reason === 'canceled') return;              // payer closed checkout
  if (reason === 'timeout') return showTimeout(); // config.timeout expired

  // 'completed' — ask your backend for the outcome instead of trusting the browser
  const report = await fetch(`/api/flywire-session/${session.id}`).then(r => r.json());
  if (report.payment_report?.status === 'ALL_UNSUCCESSFUL') return showDeclined();
  showSuccess(report);
}

function handleError(type, payload) {
  // Informational. Checkout stays open so the payer can retry;
  // the final outcome still arrives through on_end.
  console.error(type, payload);
}
```

The session lookup maps to:

```bash
curl -H "X-Authentication-Key: $CPX_API_KEY" \
  "https://api-platform.demo.flywire.com/commercial_payex/v2/session/SESSION_ID"
```

It returns `{ session_report: { status }, payment_report: { status, payment_watchlist, … } }`. For anonymous sessions the same shape arrives as the `on_end` payload.

---

## Environment variables

> The `CPX_*` prefix is preserved for backwards compatibility with existing deployments; the public product name is **Flywire Checkout V2**.

| Variable          | Where           | Description                                                                         |
| ----------------- | --------------- | ----------------------------------------------------------------------------------- |
| `CPX_CLIENT_ID`   | server + client | Public recipient identifier; goes into `initFields.recipient.client_id`             |
| `CPX_CODE`        | server + client | Public recipient code; goes into `initFields.recipient.code`                        |
| `CPX_API_KEY`     | **server only** | Secret used as `X-Authentication-Key` for session calls. Never expose.              |
| `CPX_API_BASE`    | server only     | Public API base. Demo: `https://api-platform.demo.flywire.com`                      |
| `CPX_EVENT_URL`   | server only     | Optional `config.event_url` for session events                                      |

---

## Further reading

- Playground (full index): <https://checkout.demo.flywire.com/playground/>
- Session API samples: <https://checkout.demo.flywire.com/playground/authenticated_sessions/create_session>
