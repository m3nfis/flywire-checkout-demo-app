/**
 * Flywire Checkout V2 — SDK integration reference
 * ------------------------------------------------
 *
 * This single file is the entire Flywire Checkout V2 integration for this
 * demo. Copy it into your own project (along with the matching
 * `<script src="…/gateway/connect.js">` tag and the two server-side session
 * endpoints in `server.js`) to add Flywire Checkout V2 to any web app.
 *
 * Playground (canonical reference for every payload below):
 *   https://checkout.demo.flywire.com/playground/
 *
 * The SDK script (loaded separately in the HTML) installs `window.cpx_core`,
 * which exposes a single method:
 *
 *     cpx_core.start(initFields)   // opens the checkout (overlay, or embedded with config.embed_to)
 *
 * `initFields` shape (all keys are snake_case):
 *
 *     {
 *       recipient:   { client_id, code },                  // required — who receives the payment
 *       transaction: { type, details? },                   // required — see below
 *       payer?:      { fields: { first_name, ... } },      // optional — prefill payer info
 *       session?:    { id, run_id, run_token },            // authenticated session (recommended; required for tokenization)
 *       config?:     { locale, embed_to, offer_rules, timeout },
 *       styles?:     { primary_color, primary_font, base_font_size, base_space },
 *       response: {
 *         on_end:   (reason, payload) => {},               // required — 'completed' | 'canceled' | 'timeout'
 *         on_error: (type,   payload) => {},               // optional — informational, checkout stays open
 *       },
 *     }
 *
 * `transaction.type` is one of:
 *   'payment'                — one-off charge (details.amount required)
 *   'tokenization'           — save a reusable token, optionally charging details.amount
 *   'optional_tokenization'  — charge, and the payer may opt in to saving the method
 *   'implicit_tokenization'  — charge, and save the method whenever it supports recurring use
 *
 * `transaction.details` (amount is an integer in minor units, e.g. 735000 = $7,350.00):
 *   amount, authorization: 'preauth', split: [{ recipient, amount, description }],
 *   waive_adjustments: ['surcharge'], channel: 'moto' (payment only)
 */
(function (global) {
    'use strict';

    const SDK_LOAD_TIMEOUT_MS = 15000;

    // Your own server proxy for Flywire's session API. It holds the secret
    // `X-Authentication-Key`; never expose that key to the browser.
    const SESSION_ENDPOINT = '/api/flywire-session';

    /**
     * Launch Flywire Checkout V2.
     *
     * @param {Object} opts
     * @param {{client_id: string, code: string}} opts.recipient
     * @param {{type: string, details?: Object}} opts.transaction
     * @param {Object} [opts.payer]    Prefill: `{ first_name, last_name, email, phone, address, city, zip, country }`.
     * @param {Object} [opts.config]   `initFields.config` (locale, embed_to, offer_rules, timeout).
     * @param {Object} [opts.styles]   `initFields.styles`.
     * @param {boolean} [opts.authenticated=true]
     *        Create a server-side session first. Required for every tokenization type;
     *        anonymous sessions only support one-off payments.
     * @param {{id: string, run_id: string, run_token: string}} [opts.session]
     *        Existing session credentials, e.g. from resuming a session on your server.
     * @param {Function} [opts.onComplete]  `({ report, sessionId })` — report is `{ session_report, payment_report }`.
     * @param {Function} [opts.onCancel]    The payer closed the checkout.
     * @param {Function} [opts.onTimeout]   `config.timeout` expired.
     * @param {Function} [opts.onError]     `({ type, payload })` — the checkout stays open so the payer can retry.
     * @param {Function} [opts.onEvent]     `(name, detail)` — optional trace of every step, for logging or debugging:
     *        'session_created' | 'session_resumed' | 'start' | 'on_error' | 'on_end' | 'session_report' | 'session_report_failed'.
     */
    async function launch(opts) {
        const emit = (name, detail) => opts.onEvent?.(name, detail);
        const authenticated = opts.authenticated !== false;
        if (!authenticated && opts.transaction.type !== 'payment') {
            throw new Error(`FlywireCheckout: '${opts.transaction.type}' requires an authenticated session.`);
        }

        await waitForSDK();

        // A resumed session (from your server's resume endpoint) replaces creating a new one.
        const session = opts.session || (authenticated ? await createSession() : undefined);
        if (session) emit(opts.session ? 'session_resumed' : 'session_created', { session });

        const initFields = buildInitFields({
            ...opts,
            session,
            response: {
                on_end: async (reason, payload) => {
                    console.log('[FlywireCheckout] on_end', { reason, payload });
                    emit('on_end', { reason, payload });
                    if (reason === 'canceled') return opts.onCancel?.();
                    if (reason === 'timeout') return opts.onTimeout?.();

                    // Authenticated: ask your backend for the outcome instead of trusting the browser.
                    let report = payload;
                    if (session) {
                        try {
                            report = await getSession(session.id);
                            emit('session_report', { sessionId: session.id, report });
                        } catch (error) {
                            emit('session_report_failed', { sessionId: session.id, error: error.message });
                        }
                    }
                    opts.onComplete?.({ report, sessionId: session?.id });
                },
                on_error: (type, payload) => {
                    console.error('[FlywireCheckout] on_error', { type, payload });
                    emit('on_error', { type, payload });
                    opts.onError?.({ type, payload });
                },
            },
        });

        console.log('[FlywireCheckout] cpx_core.start', initFields);
        emit('start', { initFields });
        global.cpx_core.start(initFields);
    }

    /**
     * Assemble `initFields` from its parts, omitting empty sections.
     * Exposed so host apps can preview exactly what will be sent.
     */
    function buildInitFields({ recipient, transaction, payer, config, styles, session, response }) {
        const initFields = { recipient, transaction: compact(transaction) };

        if (payer && Object.keys(payer).length) initFields.payer = { fields: payer };
        if (config && Object.keys(compact(config)).length) initFields.config = compact(config);
        if (styles && Object.keys(compact(styles)).length) initFields.styles = compact(styles);
        if (session) initFields.session = session;
        if (response) initFields.response = response;

        return initFields;
    }

    /**
     * Create an authenticated session via your server:
     *   POST {API_BASE}/commercial_payex/v2/session  (X-Authentication-Key on the server)
     * Returns `{ id, run_id, run_token }`, passed straight into `initFields.session`.
     */
    async function createSession() {
        return requestJson(SESSION_ENDPOINT, { method: 'POST' }, 'Session creation failed');
    }

    /**
     * Read the session outcome via your server:
     *   GET {API_BASE}/commercial_payex/v2/session/{id}
     */
    async function getSession(id) {
        return requestJson(`${SESSION_ENDPOINT}/${encodeURIComponent(id)}`, {}, 'Session lookup failed');
    }

    async function requestJson(url, init, failureMessage) {
        const res = await fetch(url, init);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || data.detail || data.message || `${failureMessage} (${res.status})`);
        }
        return data;
    }

    function compact(obj) {
        if (!obj) return obj;
        const out = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined) continue;
            out[key] = value && typeof value === 'object' && !Array.isArray(value) ? compact(value) : value;
        }
        return out;
    }

    /**
     * Wait for `connect.js` to populate `window.cpx_core`. The `<script>` tag
     * uses `async`, so on slow networks our first call may race the load.
     */
    async function waitForSDK() {
        const start = Date.now();
        while (!(global.cpx_core && typeof global.cpx_core.start === 'function')) {
            if (Date.now() - start > SDK_LOAD_TIMEOUT_MS) {
                throw new Error('Flywire Checkout V2 SDK did not load. Is connect.js included in the page?');
            }
            await new Promise((r) => setTimeout(r, 100));
        }
    }

    global.FlywireCheckout = { launch, buildInitFields, getSession };
})(window);
