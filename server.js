/**
 * Caldera House demo — minimal Express backend for the Flywire Checkout V2 demo.
 *
 * Two responsibilities:
 *   1. Serve the static client (index.html, app.js, flywire-checkout.js, styles.css).
 *   2. Expose `/api/flywire-session` — a thin proxy that creates an
 *      authenticated Flywire Checkout V2 session using the server-only
 *      `X-Authentication-Key`.
 *
 * Everything else (`/api/config`, `/api/guest-data`, `/api/save-guest`) is
 * demo scaffolding for the booking flow; not part of the SDK integration.
 *
 * References:
 *   - SDK loader:        https://checkout.demo.flywire.com/gateway/connect.js
 *   - Playground (root): https://checkout.demo.flywire.com/playground/
 *
 * Note on env var naming: the `CPX_*` prefix is preserved for backwards
 * compatibility with existing deployments. The product is publicly known as
 * "Flywire Checkout V2".
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Flywire Checkout V2 configuration ───────────────────────────────────────
// `clientId` and `code` are PUBLIC (recipient identifiers, safe in the browser).
// `apiKey` is SECRET (used to authenticate session creation; server-only).
// `apiBase` defaults to the demo public API; override per environment.
const CPX_CLIENT_ID = process.env.CPX_CLIENT_ID;
const CPX_CODE = process.env.CPX_CODE;
const CPX_API_KEY = process.env.CPX_API_KEY;
const CPX_API_BASE = process.env.CPX_API_BASE || 'https://checkout.demo.flywire.com/public-api-demo';

// ─── Demo guest data (booking-flow scaffolding, unrelated to Flywire Checkout) ───
const DUMMY_PAYOR = {
    first_name: 'Alejandro',
    last_name: 'Serrano',
    address: 'Calle de Serrano 47',
    city: 'Madrid',
    country: 'ES',
    phone: '0034914350672',
    email: 'alejandro.serrano@example.com',
    zip: '28001'
};

let guestData = { ...DUMMY_PAYOR };

/**
 * GET /api/config
 * Returns the public Flywire Checkout V2 recipient identifiers so the browser
 * can build `initFields.recipient = { clientId, code }`.
 * https://checkout.demo.flywire.com/playground/1-payment/1-payment-minimum-fields/
 */
app.get('/api/config', (_req, res) => {
    res.json({
        clientId: CPX_CLIENT_ID,
        code: CPX_CODE
    });
});

app.get('/api/guest-data', (_req, res) => {
    res.json(guestData);
});

app.post('/api/save-guest', (req, res) => {
    const fields = ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'country', 'zip'];
    const update = {};
    for (const f of fields) {
        if (req.body[f] !== undefined) update[f] = req.body[f];
    }
    guestData = { ...guestData, ...update };
    res.json({ success: true });
});

/**
 * POST /api/flywire-session
 *
 * Server-side session creation for authenticated Flywire Checkout V2 flows.
 * Required for tokenization (Save Card); optional for `payment` and `preauth`.
 *
 * Why a server proxy?
 *   The upstream `POST /commercial-payex/v2/session` requires an
 *   `X-Authentication-Key` that MUST stay on the server. The browser hits this
 *   endpoint, the server forwards the call with the secret, and we return the
 *   session JSON (`{ id, runId, runToken }`) back to the client, which the
 *   client then drops into `initFields.session`.
 *
 * Equivalent curl:
 *
 *   curl -X POST \
 *     -H "X-Authentication-Key: $CPX_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     "$CPX_API_BASE/commercial-payex/v2/session"
 *
 * Playground reference:
 *   https://checkout.demo.flywire.com/playground/100-authenticated-sessions/1-create-session/
 *
 * Used from the browser by the `createSession()` helper inside
 * `public/flywire-checkout.js` when the `tokenization` flow is selected.
 */
app.post('/api/flywire-session', async (_req, res) => {
    if (!CPX_API_KEY) {
        return res.status(500).json({
            error: 'CPX_API_KEY is not configured on the server. Required for tokenization (Save Card) flow.'
        });
    }

    try {
        const response = await fetch(`${CPX_API_BASE}/commercial-payex/v2/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Authentication-Key': CPX_API_KEY
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('Flywire Checkout V2 session creation failed:', response.status, data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (err) {
        console.error('Flywire Checkout V2 session error:', err);
        res.status(500).json({ error: 'Failed to create Flywire Checkout V2 session' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!CPX_CLIENT_ID || !CPX_CODE) {
        console.warn('⚠  CPX_CLIENT_ID / CPX_CODE not set — checkout will fail until configured in .env');
    }
});
