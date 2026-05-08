# Caldera Hotel — Flywire Checkout V2 Demo

A **luxury hotel booking demo** for *The Caldera House* (Santorini): guests pick a room, enter details, then pay with **Flywire Checkout V2** (sandbox). The UI is a static front end served by a small **Express** server.

This repo doubles as a **reference integration** — devs looking to add Flywire Checkout V2 to their own app can copy a single self-contained module ([`public/flywire-checkout.js`](public/flywire-checkout.js)) plus the matching server proxy in [`server.js`](server.js).

## For developers — where the integration lives

| File                                                                       | Purpose                                                                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`public/index.html`](public/index.html)                                   | Loads `connect.js` (installs `window.cpxCore`) and pulls in the integration module.                |
| [`public/flywire-checkout.js`](public/flywire-checkout.js)                 | **The entire SDK integration.** Wraps `cpxCore.start()` for the three flows. Copy as-is.           |
| [`server.js`](server.js)                                                   | Express backend; the only endpoint that's part of the integration is `POST /api/flywire-session`.   |
| [`docs/flywire-checkout-v2-integration.md`](docs/flywire-checkout-v2-integration.md) | Step-by-step integration guide with playground crosswalk and curl examples.                         |

Everything else (`app.js` view logic, `styles.css`, room data, guest form) is **demo scaffolding** unrelated to Flywire Checkout V2.

## Stack

- **Node.js** 18+ (20 recommended)
- **Express** — static files from `public/`, JSON APIs under `/api/*`
- **Flywire Checkout V2** — sandbox SDK loaded from `https://checkout.demo.flywire.com/gateway/connect.js`

## How the integration works

The frontend loads the Flywire Checkout V2 gateway script, which exposes `window.cpxCore`. When the user picks a payment option and clicks **Continue to Payment**, [`flywire-checkout.js`](public/flywire-checkout.js) calls:

```js
window.cpxCore.start({
  recipient:   { clientId, code },                                // public; from /api/config
  transaction: { type, details: { amount, authorization? } },    // varies per flow
  payer:       { fields: { firstName, lastName, email, ... } },  // optional prefill
  session:     { id, runId, runToken },                           // tokenization only
  response: {
    onEnd:   (reason, payload) => { /* canceled | completed */ },
    onError: (type,   payload) => { /* error */ },
  },
});
```

> Note: the SDK global is named `window.cpxCore` for historical reasons; the public product is **Flywire Checkout V2**.

Each UI option maps to one playground sample:

| UI option       | `transaction` payload                                                | Session?     | Playground                                                                                                            |
| --------------- | -------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Pay in Full     | `{ type: 'payment', details: { amount } }`                           | anonymous    | [Payment minimum fields](https://checkout.demo.flywire.com/playground/1-payment/1-payment-minimum-fields/)            |
| Save Card       | `{ type: 'tokenization' }`                                           | **required** | [Tokenization without amount](https://checkout.demo.flywire.com/playground/2-tokenization/1-tokenization-without-amount/) |
| Reserve & Hold  | `{ type: 'payment', details: { amount, authorization: 'preauth' } }` | anonymous    | [Payment with preauth](https://checkout.demo.flywire.com/playground/1-payment/6-payment-with-preauth/)                |

For **Save Card** (tokenization), the frontend first calls `/api/flywire-session` on this Express server, which proxies to `${CPX_API_BASE}/commercial-payex/v2/session` using the server-only `X-Authentication-Key`. The returned `{ id, runId, runToken }` is then passed to `cpxCore.start({ ..., session })`. The other two flows skip this step. Reference: [Create session playground](https://checkout.demo.flywire.com/playground/100-authenticated-sessions/1-create-session/).

## Local development

```bash
npm install
cp .env.example .env   # then fill in your demo clientId / code / api key
npm run dev            # or: npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

> The `CPX_*` prefix is preserved for backwards compatibility with existing deployments; the public product is **Flywire Checkout V2**.

| Variable        | Description                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CPX_CLIENT_ID` | Flywire Checkout V2 recipient `clientId` (UUID), exposed to the browser via `/api/config`                                                                                  |
| `CPX_CODE`      | Flywire Checkout V2 recipient `code` (e.g. `DTT` for Demo Travel)                                                                                                          |
| `CPX_API_KEY`   | **Server-only** secret (`X-Authentication-Key`) used to create authenticated sessions. Required for the Save Card (tokenization) flow; the other two flows work without it. |
| `CPX_API_BASE`  | Flywire Checkout V2 public API base URL. Defaults to `https://checkout.demo.flywire.com/public-api-demo`. Swap for stage/prod per environment.                             |
| `PORT`          | HTTP port (optional; defaults to `3000`. Render sets this automatically.)                                                                                                  |

Never commit `.env`. It is listed in `.gitignore`.

## Deploy on Render

### Option A — Blueprint (uses `render.yaml`)

1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), choose **New** → **Blueprint**.
3. Connect the repository and select the branch.
4. When prompted, set `CPX_CLIENT_ID`, `CPX_CODE`, `CPX_API_KEY`, and (optionally) `CPX_API_BASE`.
5. Apply the blueprint.

### Option B — Web Service manually

1. **New** → **Web Service**, connect the repo.
2. **Runtime:** Node
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Add `CPX_CLIENT_ID`, `CPX_CODE`, `CPX_API_KEY`, and (optionally) `CPX_API_BASE` under **Environment**.
6. Deploy.

## Project layout

```
├── server.js                                  # Express: /api/config, /api/guest-data, /api/save-guest, /api/flywire-session
├── public/
│   ├── index.html                             # Booking flow (rooms → guest → payment)
│   ├── flywire-checkout.js                    # ★ Flywire Checkout V2 SDK integration (the interesting file)
│   ├── app.js                                 # Demo host: wires booking UI to FlywireCheckout.launch()
│   └── styles.css
├── docs/
│   └── flywire-checkout-v2-integration.md     # Integration walkthrough for developers
├── package.json
├── render.yaml                                # Render Blueprint
└── .env.example                               # Template for local credentials
```

## References

- [Flywire Checkout V2 Playground](https://checkout.demo.flywire.com/playground/) — every `initFields` shape this app uses comes from a sample here.
- This repo's integration walkthrough: [`docs/flywire-checkout-v2-integration.md`](docs/flywire-checkout-v2-integration.md)

## License

Private / demo — use per your organization's policy.
