# Caldera Hotel — Flywire Checkout V2 Demo

A **luxury hotel booking demo** for *The Caldera House* (Santorini): guests pick a room, enter details, then pay with **Flywire Checkout V2** (sandbox). The UI is a static front end served by a small **Express** server.

It serves two audiences:

- **Flywire sales** use it to show Checkout V2 to travel clients (boutique hotels, liveaboard dive operators, experience travel agencies). The small cog next to *Oia, Santorini* in the header opens a drawer where you pick the flow and options to demo.
- **Developers** can copy a single self-contained module ([`public/flywire-checkout.js`](public/flywire-checkout.js)) plus the matching server proxy in [`server.js`](server.js).

## Demo drawer — what sales can show

Click the cog next to *Oia, Santorini* in the header to open **Checkout settings**. Settings are saved in the browser and apply the next time checkout opens. The guest-facing payment panel and button label update to match the selected flow.

| Section                       | What it demos                                                                                                                                 | Playground sample                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Flow › Payments**           | Pay in full · Reserve & hold (preauth) · Phone & email bookings (MOTO, *coming soon*)                                                          | [Common fields](https://checkout.demo.flywire.com/playground/payment/common_fields), [Preauth](https://checkout.demo.flywire.com/playground/payment/with_preauth) |
| **Flow › Card on file**       | Save card, charge later · Pay now & save card · Hold & save card                                                                                | [Tokenization](https://checkout.demo.flywire.com/playground/tokenization/without_amount)                                              |
| **Flow › Guest chooses**      | Pay (or hold) and let the guest opt in to saving the card                                                                                      | [Optional tokenization](https://checkout.demo.flywire.com/playground/optional_tokenization/standard)                                  |
| **Flow › Saved automatically**| Pay (or hold) and keep the card whenever the method supports it                                                                                | [Implicit tokenization](https://checkout.demo.flywire.com/playground/implicit_tokenization/standard)                                  |
| **Display**                   | Full-screen overlay or embedded in the booking panel                                                                                          | [Payment embedded](https://checkout.demo.flywire.com/playground/payment/embedded)                                                     |
| **Pages & guest experience**  | Payer details page and custom fields page: Auto / Always show / Hide (`show_payer_form`, `show_recipient_form`) · read-only payer fields (`disabled_fields`) · hide the close button (`close_button: 'hidden'`) · don't email the payer (`disable_payer_emails`) | [Checkout V2 configuration guide](https://developers.flywire.com/travel-b2b/Content/Travel-B2B/integrations/checkout-v2.htm) |
| **Payment options**           | Split with partners (editable partner portal codes, amounts and descriptions, validated like checkout does) · Waive card surcharge · Checkout timeout (not yet in the demo environment's checkout; ignored there until released) | [Split](https://checkout.demo.flywire.com/playground/payment/split), [Waived surcharge](https://checkout.demo.flywire.com/playground/payment/waive_adjustments), [Timeout](https://checkout.demo.flywire.com/playground/payment/timeout) |
| **Payment methods & currency**| Show only some methods, hide Amex, restrict to guest's or hotel's currency                                                                   | [Offer rules](https://checkout.demo.flywire.com/playground/payment/offer_rules)                                                       |
| **Branding & language**       | Client colour, font, text size (`base_font_size`) and spacing (`base_space`); 15 checkout languages                                                                                                  | [Custom styles](https://checkout.demo.flywire.com/playground/payment/with_styles)                                                     |
| **Session**                   | Authenticated (recommended; required for card on file) or anonymous                                                                           | [Authenticated session](https://checkout.demo.flywire.com/playground/payment/authenticated)                                           |
| **Integration code**          | The exact `cpx_core.start()` payload for the current settings, with links to the matching playground samples                                  | —                                                                                                                                     |

Options that don't apply to the selected flow are disabled with the reason shown (e.g. split needs an amount, so it is off for *Save card, charge later*). **MOTO** and **timeout** are built into the SDK but not yet deployed to the demo environment's checkout (checked 23 Sep 2026). MOTO stays locked and timeout shows a warning under its toggle until you set `CPX_PREVIEW_FEATURES=moto,timeout`, once the release is live.

To show how the amount changes, click the dates line on the rooms page (*… · 3 Nights · 2 Guests*, with the pencil icon) to pick new dates and guests. Default dates are always 3–8 weeks in the future. Rates include 2 guests; each extra guest adds $150 per night.

## Hotel back office — what the merchant does after checkout

[`/dashboard/`](public/dashboard/) is a mini hotel back office (open it with the grid icon in the booking site header, or *Open in hotel dashboard* on the success screen). Every checkout started on the booking site is saved as a booking in the browser's localStorage, with its session id, payments and saved-card details, so it survives a refresh. Two tabs side by side (booking site + dashboard) update live.

For each booking you can run the session-based actions from the playground's *Authenticated sessions* section, through this demo's server:

| Action | When | Flywire API | Playground |
| --- | --- | --- | --- |
| **Refresh status** | authenticated sessions | `GET /commercial_payex/v2/session/{id}` | [Get session](https://checkout.demo.flywire.com/playground/authenticated_sessions/get_session) |
| **Resume session** | authenticated sessions (e.g. the guest abandoned checkout) | `POST /commercial_payex/v2/session/{id}`, then checkout reopens with the new run credentials | [Resume session](https://checkout.demo.flywire.com/playground/authenticated_sessions/resume_session) |
| **Capture payment** | Reserve & hold flows, once a payment id exists; full or partial | `POST /payments/v1/payments/{id}/captures` | [Capture a payment](https://checkout.demo.flywire.com/playground/authenticated_sessions/capture_payment) |
| **Extend hold** | Reserve & hold flows; resets the hold to 7 days, can raise (never lower) the amount | `POST /payments/v1/payments/{id}/authorization_adjustments` | [Extend a preauth payment](https://checkout.demo.flywire.com/playground/authenticated_sessions/extend_preauth) |
| **Charge saved card** | card-on-file flows; token details come from the session's `tokenization_report` or can be pasted | `POST /payments/v1/payments/charge` | [Charge token](https://checkout.demo.flywire.com/playground/authenticated_sessions/charge_token) |

Actions that don't apply are disabled with the reason listed. Each booking keeps an activity log with the request and Flywire's response.

**Flywire connection** at the top of the dashboard sets the Client ID, recipient code and API key used by both pages (saved in localStorage; empty fields fall back to the server's `.env`). Pasted values are cleaned automatically: surrounding quotes, a `X-Authentication-Key:` / `Bearer` prefix, line breaks, spaces and invisible characters are removed, and the page says what it fixed. **Save & test connection** checks the key without creating anything; **Use server defaults** clears the saved values.

> Demo only: the browser sends its saved key to this demo's server in `X-Demo-Api-Key`, and the server uses it instead of `CPX_API_KEY`. In production the API key stays on your server.

## Checkout activity drawer — what Checkout V2 returns

The pulse icon next to the settings cog (and *View checkout activity* on the success and error screens) opens a live trace of each checkout run. A blue dot on the icon means there is new activity.

- **Status:** starting, checkout open, completed, declined, canceled, timed out or failed, plus flow, amount, session id and time spent in checkout.
- **Outcome:** the `on_end` reason, session status and payment status (each with a plain-English explanation), reported amount and the payments list (payment id, method, card brand icon and last four, plus expiry when the report includes it). **Refresh status** reads the session again from the server, e.g. while a bank transfer is pending.
- **Timeline:** every step with timing and the raw JSON: session created by the server, the exact `cpx_core.start()` payload, each `on_error`, `on_end`, and the session report read back with `GET /commercial_payex/v2/session/{id}`. `run_token` is masked.
- **Copy log** copies all runs as JSON. The log is saved in the browser's localStorage (last 20 runs) so it survives a refresh; **Clear** empties it. `run_token` is stored masked, and a run that was still open when the page reloaded shows as *Interrupted by reload*.

The trace comes from the optional `onEvent` hook on `FlywireCheckout.launch()`.

After checkout, the success screen shows what Flywire returned for the session (status, payment status, card brand and last four) under *Returned by Flywire · demo*.

## For developers — where the integration lives

| File                                                                                 | Purpose                                                                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [`public/index.html`](public/index.html)                                             | Loads `connect.js` (installs `window.cpx_core`) and pulls in the integration module.                     |
| [`public/flywire-checkout.js`](public/flywire-checkout.js)                           | **The entire SDK integration.** Session handling, `on_end` reasons, outcome lookup. Copy as-is.          |
| [`server.js`](server.js)                                                             | Express backend; `POST /api/flywire-session` and `GET /api/flywire-session/:id` are the integration part. |
| [`docs/flywire-checkout-v2-integration.md`](docs/flywire-checkout-v2-integration.md) | Step-by-step integration guide with playground crosswalk and curl examples.                              |

Everything else is **demo scaffolding**: `app.js` (booking views), `demo-config.js` / `demo-config.css` (sales drawer), `styles.css`, room data and the guest form.

## Stack

- **Node.js** 18+ (20 recommended)
- **Express** — static files from `public/`, JSON APIs under `/api/*`
- **Flywire Checkout V2** — sandbox SDK loaded from `https://checkout.demo.flywire.com/gateway/connect.js`

## How the integration works

The frontend loads the gateway script, which exposes `window.cpx_core`. When the guest clicks the payment button, [`flywire-checkout.js`](public/flywire-checkout.js):

1. Asks this server for an authenticated session (`POST /api/flywire-session`), unless the demo is set to anonymous.
2. Calls `cpx_core.start()`:

```js
window.cpx_core.start({
  recipient:   { client_id, code },                                  // public; from /api/config
  transaction: { type, details: { amount, authorization?, split?, waive_adjustments? } },
  payer:       { fields: { first_name, last_name, email, ... } },   // prefilled from the guest form
  config:      { locale, embed_to?, offer_rules?, timeout? },
  styles:      { primary_color, primary_font },                     // optional branding
  session:     { id, run_id, run_token },                           // authenticated sessions
  response: {
    on_end:   (reason, payload) => { /* 'completed' | 'canceled' | 'timeout' */ },
    on_error: (type,   payload) => { /* informational; checkout stays open */ },
  },
});
```

3. On `on_end('completed')`, asks this server for the session outcome (`GET /api/flywire-session/:id`) instead of trusting the browser, then shows the success or declined screen. `canceled` returns to the booking panel; `timeout` shows a "Time's up" screen.

The server proxies to `${CPX_API_BASE}/commercial_payex/v2/session` with the server-only `X-Authentication-Key`.

## Local development

```bash
npm install
cp .env.example .env   # then fill in your demo client id / code / api key
npm run dev            # or: npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

> The `CPX_*` prefix is preserved for backwards compatibility with existing deployments; the public product is **Flywire Checkout V2**.

| Variable               | Description                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CPX_CLIENT_ID`        | Recipient `client_id` (UUID), exposed to the browser via `/api/config`                                                                                   |
| `CPX_CODE`             | Recipient `code` (e.g. `DTT` for Demo Travel)                                                                                                            |
| `CPX_API_KEY`          | **Server-only** secret (`X-Authentication-Key`) for authenticated sessions. Required for every card-on-file flow; without it only anonymous payments work. |
| `CPX_API_BASE`         | Public API base URL. Defaults to `https://api-platform.demo.flywire.com`. The retired `https://checkout.demo.flywire.com/public-api-demo` is mapped automatically with a warning. |
| `CPX_EVENT_URL`        | Optional. Sent as `config.event_url` when creating sessions so Flywire posts session events there.                                                        |
| `CPX_SPLIT_RECIPIENTS` | Optional. Comma-separated recipient codes for *Split with partners*. Defaults to `EVT,UUI`.                                                             |
| `CPX_PREVIEW_FEATURES` | Optional. Comma-separated capabilities to unlock before they reach every environment: `moto`, `timeout`.                                                 |
| `PORT`                 | HTTP port (optional; defaults to `3000`. Render sets this automatically.)                                                                                |

Never commit `.env`. It is listed in `.gitignore`.

## Deploy on Render

### Option A — Blueprint (uses `render.yaml`)

1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), choose **New** → **Blueprint**.
3. Connect the repository and select the branch.
4. When prompted, set `CPX_CLIENT_ID`, `CPX_CODE`, `CPX_API_KEY`, and optionally the other variables above.
5. Apply the blueprint.

### Option B — Web Service manually

1. **New** → **Web Service**, connect the repo.
2. **Runtime:** Node
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Add `CPX_CLIENT_ID`, `CPX_CODE`, `CPX_API_KEY`, and optionally the other variables under **Environment**.
6. Deploy.

## Project layout

```
├── server.js                                  # Express: config, guest data, session + payments API proxy, key check
├── public/
│   ├── index.html                             # Booking flow (rooms → guest → payment) + demo drawer markup
│   ├── flywire-checkout.js                    # ★ Flywire Checkout V2 SDK integration (the interesting file)
│   ├── demo-config.js                         # Sales drawer: flow catalog, options, code preview
│   ├── demo-config.css                        # Settings cog + drawer styles (Flywire design tokens)
│   ├── checkout-activity.js                   # Activity drawer: live trace of checkout callbacks and results
│   ├── bookings-store.js                      # Demo bookings in localStorage (booking site ↔ dashboard)
│   ├── demo-credentials.js                    # Saved Client ID / code / API key + paste clean-up
│   ├── dashboard/                             # Hotel back office: session and payment actions
│   ├── stay.js                                # Dates & guests picker
│   ├── app.js                                 # Demo host: wires booking UI to FlywireCheckout.launch()
│   └── styles.css                             # Hotel theme
├── docs/
│   └── flywire-checkout-v2-integration.md     # Integration walkthrough for developers
├── package.json
├── render.yaml                                # Render Blueprint
└── .env.example                               # Template for local credentials
```

## QA

Remaining manual tests, setup and where to save evidence: [`docs/QA-HANDOFF.md`](docs/QA-HANDOFF.md).

## References

- [Flywire Checkout V2 Playground](https://checkout.demo.flywire.com/playground/) — every `initFields` shape this app uses comes from a sample here.
- This repo's integration walkthrough: [`docs/flywire-checkout-v2-integration.md`](docs/flywire-checkout-v2-integration.md)

## License

Private / demo — use per your organization's policy.
