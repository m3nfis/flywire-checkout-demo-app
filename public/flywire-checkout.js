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
 *   - Payment minimum fields:    https://checkout.demo.flywire.com/playground/1-payment/1-payment-minimum-fields/
 *   - Payment common fields:     https://checkout.demo.flywire.com/playground/1-payment/2-payment-common-fields/
 *   - Payment with preauth:      https://checkout.demo.flywire.com/playground/1-payment/6-payment-with-preauth/
 *   - Tokenization (no amount):  https://checkout.demo.flywire.com/playground/2-tokenization/1-tokenization-without-amount/
 *   - Create session (server):   https://checkout.demo.flywire.com/playground/100-authenticated-sessions/1-create-session/
 *
 * The SDK script (loaded separately in the HTML) installs `window.cpxCore`,
 * which exposes a single method:
 *
 *     cpxCore.start(initFields)   // opens the full-screen checkout overlay
 *
 * `initFields` shape:
 *
 *     {
 *       recipient:   { clientId, code },              // required — who receives the payment
 *       transaction: { type, details? },              // required — see buildTransaction() below
 *       payer?:      { fields: { firstName, ... } },  // optional — prefill payer info
 *       session?:    { id, runId, runToken },         // required for tokenization, optional otherwise
 *       config?:     { embedTo: '#css-selector' },    // optional — embedded mode instead of overlay
 *       response: {
 *         onEnd:   (reason, payload) => {},           // required — fired on completion or cancel
 *         onError: (type,   payload) => {},           // optional — fired on errors
 *       },
 *     }
 *
 * `onEnd`'s `reason` is `'canceled'` when the payer dismisses the overlay;
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
     * @param {{clientId: string, code: string}} opts.recipient
     *        Recipient identifiers (public; safe to ship to the browser).
     * @param {string} [opts.amount]
     *        Decimal string in major units, e.g. `'7350.00'`. Required for
     *        `payment` and `preauth`; ignored for `tokenization`.
     * @param {Object} [opts.payer]
     *        Optional prefill: `{ firstName, lastName, email, phone, address, city, country }`.
     * @param {string} [opts.embedTo]
     *        CSS selector of the element to embed the checkout iframe into.
     *        When omitted (default), the SDK opens a full-page overlay.
     *        Maps to `initFields.config.embedTo`.
     *        Playground: https://checkout.demo.flywire.com/playground/1-payment/4-payment-embedded/
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
                onEnd: (reason, payload) => {
                    console.log('[FlywireCheckout] onEnd', { reason, payload });
                    if (reason === 'canceled') {
                        opts.onCancel?.(payload);
                    } else {
                        opts.onSuccess?.({ reason, payload });
                    }
                },
                onError: (type, payload) => {
                    console.error('[FlywireCheckout] onError', { type, payload });
                    opts.onError?.({ type, payload });
                },
            },
        };

        if (opts.payer) {
            initFields.payer = { fields: opts.payer };
        }

        // Display mode: full-page overlay (default) vs embedded into a host element.
        // https://checkout.demo.flywire.com/playground/1-payment/4-payment-embedded/
        if (opts.embedTo) {
            initFields.config = { embedTo: opts.embedTo };
        }

        // Tokenization (Save Card) requires an authenticated session. The other
        // two flows can run anonymously with just `recipient` + `transaction`.
        if (opts.flow === 'tokenization') {
            initFields.session = await createSession();
        }

        console.log('[FlywireCheckout] cpxCore.start', initFields);
        global.cpxCore.start(initFields);
    }

    /**
     * Map a flow name to the V2 `transaction` payload, mirroring the
     * playground samples one-to-one.
     */
    function buildTransaction(flow, amount) {
        switch (flow) {
            // https://checkout.demo.flywire.com/playground/1-payment/1-payment-minimum-fields/
            case 'payment':
                requireAmount(flow, amount);
                return { type: 'payment', details: { amount } };

            // https://checkout.demo.flywire.com/playground/1-payment/6-payment-with-preauth/
            // `authorization: 'preauth'` authorizes the card without capturing.
            // Capture later via the Flywire Checkout V2 API.
            case 'preauth':
                requireAmount(flow, amount);
                return { type: 'payment', details: { amount, authorization: 'preauth' } };

            // https://checkout.demo.flywire.com/playground/2-tokenization/1-tokenization-without-amount/
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
     * Returns `{ id, runId, runToken }` which is passed straight into
     * `initFields.session`. See `server.js` (`/api/flywire-session`) for the
     * server-side half.
     *
     * Playground reference:
     *   https://checkout.demo.flywire.com/playground/100-authenticated-sessions/1-create-session/
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
     * Wait for `connect.js` to populate `window.cpxCore`. The `<script>` tag
     * uses `async`, so on slow networks our first call may race the load.
     */
    async function waitForSDK() {
        const start = Date.now();
        while (!(global.cpxCore && typeof global.cpxCore.start === 'function')) {
            if (Date.now() - start > SDK_LOAD_TIMEOUT_MS) {
                throw new Error('Flywire Checkout V2 SDK did not load. Is connect.js included in the page?');
            }
            await new Promise((r) => setTimeout(r, 100));
        }
    }

    global.FlywireCheckout = { launch };
})(window);
