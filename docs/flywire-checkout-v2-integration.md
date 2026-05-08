# Flywire Checkout V2 — Integration Reference

> Hands-on reference for adding Flywire Checkout V2 to any web app, using this repo as a working example.

---

## TL;DR

Three files. Read them in this order:

1. **[`public/index.html`](../public/index.html)** — `<script>` tag that loads `connect.js`.
2. **[`public/flywire-checkout.js`](../public/flywire-checkout.js)** — the entire SDK integration. Copy this file as-is.
3. **[`server.js`](../server.js)** — `/api/flywire-session` proxy that creates authenticated sessions with the secret API key.

Everything else in this repo is demo-app scaffolding (rooms, guest form, success view) and is irrelevant to the integration.

---

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│ Browser                     │         │ Your server                  │
│                             │         │                              │
│  index.html                 │         │  POST /api/flywire-session   │
│  ├─ <script connect.js>     │ ──────▶ │  └─ X-Authentication-Key     │
│  │  → window.cpxCore        │         │     ────▶ Flywire Checkout   │
│  │                          │         │           V2 API             │
│  ├─ flywire-checkout.js     │         │                              │
│  │  └─ FlywireCheckout      │         └──────────────────────────────┘
│  │     .launch()            │
│  │     → cpxCore.start(…)   │
│  │                          │
│  └─ app.js (host app)       │
└─────────────────────────────┘
```

The browser only ever talks to:
- `connect.js` (CDN, public)
- Your server proxy (for tokenization sessions)

The **secret API key never leaves your server**.

---

## Playground crosswalk

Each flow this repo implements maps 1:1 to a playground sample.

| App option         | Flow name        | Transaction payload                                          | Session?      | Playground                                                                                                            |
| ------------------ | ---------------- | ------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Pay in Full**    | `payment`        | `{ type: 'payment', details: { amount } }`                   | anonymous     | [Payment minimum fields](https://checkout.demo.flywire.com/playground/1-payment/1-payment-minimum-fields/)            |
| **Reserve & Hold** | `preauth`        | `{ type: 'payment', details: { amount, authorization: 'preauth' } }` | anonymous     | [Payment with preauth](https://checkout.demo.flywire.com/playground/1-payment/6-payment-with-preauth/)                |
| **Save Card**      | `tokenization`   | `{ type: 'tokenization' }`                                   | **required**  | [Tokenization without amount](https://checkout.demo.flywire.com/playground/2-tokenization/1-tokenization-without-amount/) |

Session creation itself follows: [Create session](https://checkout.demo.flywire.com/playground/100-authenticated-sessions/1-create-session/).

---

## Step 1 — Load the SDK

```html
<script src="https://checkout.demo.flywire.com/gateway/connect.js" async></script>
```

This installs `window.cpxCore`, which exposes a single method:

```js
window.cpxCore.start(initFields)   // opens the full-screen overlay
```

Use the **demo** URL above for sandbox; swap to the production URL before go-live.

> Note: the SDK global is named `window.cpxCore` for historical reasons; the public product is **Flywire Checkout V2**.

---

## Step 2 — Build `initFields` and call `start()`

The SDK takes a single object. Minimum required keys:

```js
window.cpxCore.start({
  recipient:   { clientId: '…', code: '…' },          // who receives the payment
  transaction: { type: 'payment', details: { amount: '7350.00' } },
  response: {
    onEnd:   (reason, payload) => { /* completion / cancel */ },
    onError: (type,   payload) => { /* error */ },
  },
});
```

Optional keys:

| Key       | When to use                                              |
| --------- | -------------------------------------------------------- |
| `payer`   | Prefill payer data: `{ fields: { firstName, … } }`       |
| `session` | Required for `tokenization`; opt-in for `payment` flows  |
| `config`  | Embed inside an element: `{ embedTo: '#css-selector' }`  |

See [`public/flywire-checkout.js`](../public/flywire-checkout.js) for the wrapped form this repo uses.

---

## Step 3 — Server-side session (Save Card only)

Tokenization flows must be authenticated. The browser calls your proxy; your proxy calls Flywire with the secret key:

```bash
curl -X POST \
  -H "X-Authentication-Key: $CPX_API_KEY" \
  -H "Content-Type: application/json" \
  "$CPX_API_BASE/commercial-payex/v2/session"
```

Response:

```json
{ "id": "…", "runId": "…", "runToken": "…" }
```

Drop that response straight into `initFields.session`:

```js
const session = await fetch('/api/flywire-session', { method: 'POST' }).then(r => r.json());

window.cpxCore.start({
  recipient: { clientId, code },
  transaction: { type: 'tokenization' },
  session,
  response: { onEnd, onError },
});
```

The reference proxy lives in [`server.js`](../server.js) (`POST /api/flywire-session`).

---

## Step 4 — Handle completion

```js
function onEnd(reason, payload) {
  if (reason === 'canceled') {
    // payer dismissed the overlay; SDK already cleaned up
    return;
  }
  // success — but treat the webhook as the source of truth before charging
  showSuccess(payload);
}

function onError(type, payload) {
  // The SDK keeps the overlay open on error so the payer can retry inside it.
  // Show your own error UI only if/when the payer eventually closes the overlay.
  console.error(type, payload);
}
```

This repo wraps the same behaviour inside `FlywireCheckout.launch()` — see the
`response.onEnd` / `response.onError` adapters in `flywire-checkout.js`.

---

## Environment variables

> The `CPX_*` prefix is preserved for backwards compatibility with existing deployments; the public product name is **Flywire Checkout V2**.

| Variable          | Where           | Description                                                                       |
| ----------------- | --------------- | --------------------------------------------------------------------------------- |
| `CPX_CLIENT_ID`   | server + client | Public recipient identifier; goes into `initFields.recipient.clientId`            |
| `CPX_CODE`        | server + client | Public recipient code; goes into `initFields.recipient.code`                      |
| `CPX_API_KEY`     | **server only** | Secret used as `X-Authentication-Key` when creating sessions. Never expose.        |
| `CPX_API_BASE`    | server only     | Base URL for the V2 API. Demo: `https://checkout.demo.flywire.com/public-api-demo` |

---

## Further reading

- Playground (full index): <https://checkout.demo.flywire.com/playground/>
- Authenticated sessions samples: <https://checkout.demo.flywire.com/playground/100-authenticated-sessions/1-create-session/>
