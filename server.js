/**
 * Caldera House demo — minimal Express backend for the Flywire Checkout V2 demo.
 *
 * Two responsibilities:
 *   1. Serve the static client (index.html, app.js, flywire-checkout.js, styles.css).
 *   2. Proxy the Flywire Checkout V2 session API using the server-only
 *      `X-Authentication-Key`:
 *        POST /api/flywire-session       → create an authenticated session
 *        GET  /api/flywire-session/:id   → read the session outcome after `on_end`
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
const DEFAULT_API_BASE = 'https://api-platform.demo.flywire.com';

// The old checkout-hosted proxies no longer serve the session API (they answer 405).
const LEGACY_API_BASES = {
    'https://checkout.demo.flywire.com/public-api-demo': 'https://api-platform.demo.flywire.com',
    'https://checkout.flywire.com/public-api-prod': 'https://api-platform.flywire.com',
};

const CPX_CLIENT_ID = process.env.CPX_CLIENT_ID;
const CPX_CODE = process.env.CPX_CODE;
const CPX_API_KEY = process.env.CPX_API_KEY;
const CPX_API_BASE = resolveApiBase(process.env.CPX_API_BASE);
const CPX_EVENT_URL = process.env.CPX_EVENT_URL;
const CPX_SPLIT_RECIPIENTS = listFromEnv(process.env.CPX_SPLIT_RECIPIENTS, ['EVT', 'UUI']);
// Capabilities that exist in the SDK but are not deployed to every environment yet.
const CPX_PREVIEW_FEATURES = listFromEnv(process.env.CPX_PREVIEW_FEATURES, []);

const SESSION_PATH = '/commercial_payex/v2/session';
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveApiBase(value) {
    const base = (value || DEFAULT_API_BASE).replace(/\/+$/, '');
    if (LEGACY_API_BASES[base]) {
        console.warn(`⚠  CPX_API_BASE=${base} is retired; using ${LEGACY_API_BASES[base]} instead. Update your environment.`);
        return LEGACY_API_BASES[base];
    }
    return base;
}

function listFromEnv(value, fallback) {
    if (!value) return fallback;
    return value.split(',').map(item => item.trim()).filter(Boolean);
}

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
 * Returns the public recipient identifiers used in `initFields.recipient`,
 * plus demo settings for the configuration drawer.
 */
app.get('/api/config', (req, res) => {
    res.json({
        client_id: CPX_CLIENT_ID,
        code: CPX_CODE,
        authenticated_sessions: Boolean(apiKeyFor(req)),
        split_recipients: CPX_SPLIT_RECIPIENTS,
        preview_features: CPX_PREVIEW_FEATURES
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
 * Which API key to use for a request.
 *
 * Normally the server's `CPX_API_KEY`. For demos, the hotel dashboard can send
 * its own key in `X-Demo-Api-Key` so sales can switch Flywire accounts without
 * redeploying. Never accept an API key from the browser in production.
 */
function apiKeyFor(req) {
    return demoApiKey(req) || CPX_API_KEY;
}

function demoApiKey(req) {
    const key = String(req.get('X-Demo-Api-Key') || '').trim();
    return key && key.length <= 512 && /^[\x21-\x7e]+$/.test(key) ? key : '';
}

function requireApiKey(req, res) {
    const key = apiKeyFor(req);
    if (!key) {
        res.status(500).json({ error: 'No API key: set CPX_API_KEY on the server or add one in the hotel dashboard.' });
    }
    return key;
}

/**
 * POST /api/flywire-session
 *
 * Creates an authenticated Flywire Checkout V2 session. Authenticated sessions
 * are the recommended integration for every flow and are required for all
 * tokenization flows.
 *
 * The upstream call needs an `X-Authentication-Key` that MUST stay on the
 * server. The browser receives only `{ id, run_id, run_token }`, which it drops
 * into `initFields.session`.
 *
 * Equivalent curl:
 *
 *   curl -X POST \
 *     -H "X-Authentication-Key: $CPX_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"config":{"event_url":"https://your-app.example.com/flywire/events"}}' \
 *     "https://api-platform.demo.flywire.com/commercial_payex/v2/session"
 *
 * Playground:
 *   https://checkout.demo.flywire.com/playground/authenticated_sessions/create_session
 *   https://checkout.demo.flywire.com/playground/authenticated_sessions/create_session_with_events
 */
app.post('/api/flywire-session', async (req, res) => {
    const key = requireApiKey(req, res);
    if (!key) return;

    const body = CPX_EVENT_URL ? { config: { event_url: CPX_EVENT_URL } } : undefined;
    await proxyFlywireApi(res, key, 'POST', SESSION_PATH, body);
});

/**
 * GET /api/flywire-session/:id
 *
 * Reads the session outcome (`session_report`, `payment_report`,
 * `tokenization_report`). Call this from `on_end` instead of trusting the
 * browser: your backend decides what the payer sees next.
 *
 * Playground:
 *   https://checkout.demo.flywire.com/playground/authenticated_sessions/get_session
 */
app.get('/api/flywire-session/:id', async (req, res) => {
    const key = requireApiKey(req, res);
    if (!key) return;
    if (!SESSION_ID_PATTERN.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid session id.' });
    }

    await proxyFlywireApi(res, key, 'GET', `${SESSION_PATH}/${req.params.id}`);
});

/**
 * POST /api/flywire-session/:id/resume
 *
 * Returns fresh run credentials for an existing session so checkout can
 * continue from the last saved point (e.g. the guest closed checkout earlier).
 *
 * Playground:
 *   https://checkout.demo.flywire.com/playground/authenticated_sessions/resume_session
 */
app.post('/api/flywire-session/:id/resume', async (req, res) => {
    const key = requireApiKey(req, res);
    if (!key) return;
    if (!SESSION_ID_PATTERN.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid session id.' });
    }

    await proxyFlywireApi(res, key, 'POST', `${SESSION_PATH}/${req.params.id}`);
});

// ─── Payments API (after checkout) ───────────────────────────────────────────

const PAYMENT_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

function requirePositiveAmount(req, res) {
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive integer in minor units (cents).' });
        return null;
    }
    return amount;
}

/**
 * POST /api/payments/:paymentId/captures  { amount }
 *
 * Captures a pre-authorized payment, fully or partially.
 * Playground: https://checkout.demo.flywire.com/playground/authenticated_sessions/capture_payment
 */
app.post('/api/payments/:paymentId/captures', async (req, res) => {
    const key = requireApiKey(req, res);
    if (!key) return;
    if (!PAYMENT_ID_PATTERN.test(req.params.paymentId)) return res.status(400).json({ error: 'Invalid payment id.' });
    const amount = requirePositiveAmount(req, res);
    if (!amount) return;

    await proxyFlywireApi(res, key, 'POST', `/payments/v1/payments/${req.params.paymentId}/captures`, { amount });
});

/**
 * POST /api/payments/:paymentId/authorization_adjustments  { amount }
 *
 * Extends a pre-authorization hold to 7 days from today and, optionally,
 * raises the authorized amount (increase only).
 * Playground: https://checkout.demo.flywire.com/playground/authenticated_sessions/extend_preauth
 */
app.post('/api/payments/:paymentId/authorization_adjustments', async (req, res) => {
    const key = requireApiKey(req, res);
    if (!key) return;
    if (!PAYMENT_ID_PATTERN.test(req.params.paymentId)) return res.status(400).json({ error: 'Invalid payment id.' });
    const amount = requirePositiveAmount(req, res);
    if (!amount) return;

    await proxyFlywireApi(res, key, 'POST', `/payments/v1/payments/${req.params.paymentId}/authorization_adjustments`, { amount });
});

/**
 * POST /api/payments/charge  { payment_method_token, mandate_id, payor_id, recipient_code, external_reference, amount } (all required)
 *
 * `external_reference` is your own reference for the charge (e.g. the booking number); Flywire requires it.
 *
 * Charges a saved payment method (merchant-initiated, unscheduled).
 * Playground: https://checkout.demo.flywire.com/playground/authenticated_sessions/charge_token
 */
app.post('/api/payments/charge', async (req, res) => {
    const key = requireApiKey(req, res);
    if (!key) return;
    const amount = requirePositiveAmount(req, res);
    if (!amount) return;

    const { payment_method_token, mandate_id, payor_id, recipient_code, external_reference } = req.body || {};
    if (!payment_method_token || !mandate_id || !payor_id || !recipient_code || !external_reference) {
        return res.status(400).json({ error: 'payment_method_token, mandate_id, payor_id, recipient_code and external_reference are required.' });
    }

    await proxyFlywireApi(res, key, 'POST', '/payments/v1/payments/charge', {
        payment_method_token: String(payment_method_token).trim(),
        mandate_id: String(mandate_id).trim(),
        payor_id: String(payor_id).trim(),
        charge_intent: { mode: 'unscheduled' },
        recipient: { id: String(recipient_code).trim() },
        items: [{ id: 'default', amount }],
        external_reference: String(external_reference).trim(),
    });
});

/**
 * GET /api/credentials/check
 *
 * Verifies the API key without creating anything: looking up a session that
 * cannot exist answers 404 for a valid key and 401 for an invalid one.
 */
app.get('/api/credentials/check', async (req, res) => {
    const key = apiKeyFor(req);
    const source = demoApiKey(req) ? 'browser' : 'server';
    if (!key) return res.json({ ok: false, source: 'none', detail: 'No API key configured.' });

    try {
        const response = await fetch(`${CPX_API_BASE}${SESSION_PATH}/00000000-0000-0000-0000-000000000000`, {
            headers: { 'X-Authentication-Key': key },
        });
        if (response.status === 401 || response.status === 403) {
            const data = await response.json().catch(() => ({}));
            return res.json({ ok: false, source, detail: data.detail || 'The API key was rejected.' });
        }
        res.json({ ok: response.status === 404 || response.ok, source, detail: `API answered ${response.status}.` });
    } catch {
        res.status(502).json({ ok: false, source, detail: 'Could not reach the Flywire API.' });
    }
});

async function proxyFlywireApi(res, key, method, pathname, body) {
    try {
        const response = await fetch(`${CPX_API_BASE}${pathname}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Authentication-Key': key
            },
            body: body ? JSON.stringify(body) : undefined
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(`Flywire API ${method} ${pathname} failed:`, response.status, data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (err) {
        console.error(`Flywire API ${method} ${pathname} error:`, err);
        res.status(502).json({ error: 'Could not reach the Flywire API' });
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!CPX_CLIENT_ID || !CPX_CODE) {
        console.warn('⚠  CPX_CLIENT_ID / CPX_CODE not set — checkout will fail until configured in .env');
    }
    if (!CPX_API_KEY) {
        console.warn('⚠  CPX_API_KEY not set — only anonymous payment flows will be available');
    }
});
