/**
 * Flywire Checkout V2 — SDK integration reference
 * ------------------------------------------------
 *
 * This single file is the entire Flywire Checkout V2 integration for this
 * demo. Copy it into your own project (along with the matching
 * `<script src="…/gateway/connect.js">` tag and a server-side session
 * endpoint) to add Flywire Checkout V2 to any web app.
 *
 * Playground (canonical reference for every payload below):
 *   - Payment minimum fields:    https://checkout.demo.flywire.com/playground/1_payment/1_payment_minimum_fields/
 *   - Payment common fields:     https://checkout.demo.flywire.com/playground/1_payment/2_payment_common_fields/
 *   - Payment with preauth:      https://checkout.demo.flywire.com/playground/1_payment/6_payment_with_preauth/
 *   - Tokenization (no amount):  https://checkout.demo.flywire.com/playground/2_tokenization/1_tokenization_without_amount/
 *   - Create session (server):   https://checkout.demo.flywire.com/playground/4_authenticated_sessions/1_create_session/
 *
 * The SDK script (loaded separately in the HTML) installs `window.cpx_core`,
 * which exposes a single method:
 *
 *     cpx_core.start(initFields)   // opens the full-screen checkout overlay
 *
 * `initFields` shape (all keys are snake_case as of the current SDK version):
 *
 *     {
 *       recipient:   { client_id, code },                 // required — who receives the payment
 *       transaction: { type, details?: { amount } },        // required — amount is integer in cents; see buildTransaction()
 *       payer?:      { fields: { first_name, ... } },     // optional — prefill payer info
 *       session?:    { id, run_id, run_token },           // required for tokenization, optional otherwise
 *       config?:     { embed_to: '#css-selector' },       // optional — embedded mode instead of overlay
 *       response: {
 *         on_end:   (reason, payload) => {},              // required — fired on completion or cancel
 *         on_error: (type,   payload) => {},              // optional — fired on errors
 *       },
 *     }
 *
 * `on_end`'s `reason` is `'canceled'` when the payer dismisses the overlay;
 * otherwise the flow completed successfully. Any non-cancel termination is
 * treated as success in this wrapper — your backend webhook is the source of
 * truth for the final transaction state.
 */
(function (global) {
    'use strict';

    const SDK_LOAD_TIMEOUT_MS = 15000;

    // Your own server proxy that calls Flywire's
    // `POST /commercial-payex/v2/session` with the secret `X-Authentication-Key`.
    // The key MUST stay server-side; never expose it to the browser.
    const SESSION_ENDPOINT = '/api/flywire-session';

    /**
     * Launch the Flywire Checkout V2 overlay.
     *
     * @param {Object} opts
     * @param {'payment'|'tokenization'|'preauth'} opts.flow
     *        Which playground pattern to run.
     * @param {{client_id: string, code: string}} opts.recipient
     *        Recipient identifiers (public; safe to ship to the browser).
 * @param {number} [opts.amount]
 *        Integer in minor units (cents), e.g. `735000` for $7,350.00. Required for
 *        `payment` and `preauth`; ignored for `tokenization`.
     * @param {Object} [opts.payer]
     *        Optional prefill: `{ first_name, last_name, email, phone, address, city, country }`.
     * @param {string} [opts.embedTo]
     *        CSS selector of the element to embed the checkout iframe into.
     *        When omitted (default), the SDK opens a full-page overlay.
     *        Maps to `initFields.config.embed_to`.
     *        Playground: https://checkout.demo.flywire.com/playground/1_payment/4_payment_embedded/
     * @param {Function} [opts.onSuccess]   Called when the payer completes the flow.
     * @param {Function} [opts.onCancel]    Called when the payer dismisses the overlay.
     * @param {Function} [opts.onError]     Called with `{ type, payload }` on errors.
     */
    async function launch(opts) {
        await waitForSDK();

        const initFields = {
            recipient: opts.recipient,
            transaction: buildTransaction(opts.flow, opts.amount),
            response: {
                on_end: (reason, payload) => {
                    console.log('[FlywireCheckout] on_end', { reason, payload });
                    if (reason === 'canceled') {
                        opts.onCancel?.(payload);
                    } else {
                        opts.onSuccess?.({ reason, payload });
                    }
                },
                on_error: (type, payload) => {
                    console.error('[FlywireCheckout] on_error', { type, payload });
                    opts.onError?.({ type, payload });
                },
            },
        };

        if (opts.payer) {
            initFields.payer = { fields: opts.payer };
        }

        // Display mode: full-page overlay (default) vs embedded into a host element.
        // https://checkout.demo.flywire.com/playground/1_payment/4_payment_embedded/
        if (opts.embedTo) {
            initFields.config = { embed_to: opts.embedTo };
        }

        // Tokenization (Save Card) requires an authenticated session. The other
        // two flows can run anonymously with just `recipient` + `transaction`.
        if (opts.flow === 'tokenization') {
            initFields.session = await createSession();
        }

        console.log('[FlywireCheckout] cpx_core.start', initFields);
        global.cpx_core.start(initFields);
    }

    /**
     * Map a flow name to the V2 `transaction` payload, mirroring the
     * playground samples one-to-one.
     */
    function buildTransaction(flow, amount) {
        switch (flow) {
            // https://checkout.demo.flywire.com/playground/1_payment/1_payment_minimum_fields/
            case 'payment':
                requireAmount(flow, amount);
                return { type: 'payment', details: { amount } };

            // https://checkout.demo.flywire.com/playground/1_payment/6_payment_with_preauth/
            // `authorization: 'preauth'` authorizes the card without capturing.
            // Capture later via the Flywire Checkout V2 API.
            case 'preauth':
                requireAmount(flow, amount);
                return { type: 'payment', details: { amount, authorization: 'preauth' } };

            // https://checkout.demo.flywire.com/playground/2_tokenization/1_tokenization_without_amount/
            // Stores a reusable token for later charges; no amount, no charge now.
            case 'tokenization':
                return { type: 'tokenization' };

            default:
                throw new Error(`FlywireCheckout: unknown flow "${flow}". Expected 'payment' | 'tokenization' | 'preauth'.`);
        }
    }

    function requireAmount(flow, amount) {
        if (!amount) {
            throw new Error(`FlywireCheckout: 'amount' is required for flow "${flow}".`);
        }
    }

    /**
     * Hit the local server proxy to create a Flywire Checkout V2 session.
     *
     * The proxy maps to:
     *
     *   POST {API_BASE}/commercial-payex/v2/session
     *     headers: { 'X-Authentication-Key': '<server-only secret>' }
     *
     * Returns `{ id, run_id, run_token }` which is passed straight into
     * `initFields.session`. See `server.js` (`/api/flywire-session`) for the
     * server-side half.
     *
     * Playground reference:
     *   https://checkout.demo.flywire.com/playground/4_authenticated_sessions/1_create_session/
     */
    async function createSession() {
        const res = await fetch(SESSION_ENDPOINT, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = data.error || data.message || `Session creation failed (${res.status})`;
            throw new Error(msg);
        }
        return data;
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

    global.FlywireCheckout = { launch };
})(window);
