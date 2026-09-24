/**
 * Hotel back office — demo dashboard for what a merchant does with Flywire
 * Checkout V2 after checkout: look up a session, resume it, capture or extend
 * a pre-authorization, and charge a saved card.
 *
 * Bookings come from the demo bookings store (localStorage). Every action goes
 * through this demo's server, which calls the Flywire API with the API key.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const PLAYGROUND = 'https://checkout.demo.flywire.com/playground/authenticated_sessions/';
    const DEFAULT_API_BASE = 'https://api-platform.demo.flywire.com';
    const SESSION_API = '/commercial_payex/v2/session';
    const PREVIEW_LANG_KEY = 'caldera.dashboard.previewLang';

    const PAYMENT_STATUS = {
        NO_PAYMENTS: 'No payment was made.',
        SOME_IN_PROGRESS: 'A payment is still processing.',
        ALL_UNSUCCESSFUL: 'Every payment attempt failed.',
        FULLY_PAID: 'The full amount was paid or authorized.',
        PARTIALLY_PAID: 'Only part of the amount was paid.',
        OVERPAID: 'More than the requested amount was paid.',
    };

    const CHARGE_PRESETS = ['Minibar', 'Spa treatment', 'Late checkout', 'Airport transfer', 'Dive equipment rental', 'No-show fee'];

    let serverConfig = {};
    const CREDENTIALS_HASH = 'credentials';
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const PORTAL_CODE = /^(?:[A-Z]{3}|[A-Z][A-Z0-9]{4})$/;

    const hashBooking = () => {
        const hash = decodeURIComponent(location.hash.slice(1));
        return hash && hash !== CREDENTIALS_HASH ? hash : null;
    };
    let selectedId = hashBooking();
    let openAction = null;
    let busyAction = null;
    let actionError = null;
    let previewLang = localStorage.getItem(PREVIEW_LANG_KEY) === 'fetch' ? 'fetch' : 'curl';
    // Typed form values survive re-renders (e.g. when another tab updates the bookings).
    const drafts = new Map();

    document.addEventListener('DOMContentLoaded', async () => {
        serverConfig = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
        initCredentials();
        $('db-clear-bookings').addEventListener('click', () => {
            if (!Bookings.list().length || !confirm('Delete all demo bookings from this browser?')) return;
            Bookings.clear();
        });
        window.addEventListener('hashchange', () => {
            if (location.hash.slice(1) === CREDENTIALS_HASH) focusCredentials();
            else select(hashBooking());
        });
        Bookings.onChange(render);
        DemoCredentials.onChange(() => {
            if (!document.activeElement?.closest('#db-credentials-form')) fillCredentials();
        });
        render();
        DemoCredentials.renderBanners();
        if (location.hash.slice(1) === CREDENTIALS_HASH || !DemoCredentials.isComplete()) focusCredentials();
        testConnection();
    });

    // ── Credentials ──

    function initCredentials() {
        const fields = [
            ['db-client-id', 'client_id', 'id'],
            ['db-code', 'code', 'code'],
            ['db-api-key', 'api_key', 'key'],
        ];
        fillCredentials();

        fields.forEach(([id, , kind]) => {
            const input = $(id);
            input.addEventListener('paste', () => setTimeout(() => cleanInput(input, kind), 0));
            input.addEventListener('blur', () => cleanInput(input, kind));
        });

        $('db-credentials-form').addEventListener('submit', (e) => {
            e.preventDefault();
            fields.forEach(([id, , kind]) => cleanInput($(id), kind));
            DemoCredentials.set({
                client_id: $('db-client-id').value,
                code: $('db-code').value,
                api_key: $('db-api-key').value,
            });
            testConnection();
        });

        $('db-credentials-reset').addEventListener('click', () => {
            if (!confirm('Remove the Flywire demo credentials from this browser? Checkout stays disabled until new ones are added.')) return;
            DemoCredentials.clear();
            fillCredentials();
            fixNotes.clear();
            $('db-credentials-fixes').hidden = true;
            testConnection();
        });

        $('db-api-key-toggle').addEventListener('click', (e) => {
            const input = $('db-api-key');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            e.currentTarget.textContent = show ? 'Hide' : 'Show';
            e.currentTarget.setAttribute('aria-pressed', String(show));
        });
    }

    function fillCredentials() {
        const saved = DemoCredentials.get();
        $('db-client-id').value = saved.client_id;
        $('db-client-id').placeholder = 'UUID from your Flywire demo account';
        $('db-code').value = saved.code;
        $('db-code').placeholder = 'e.g. ABC';
        $('db-api-key').value = saved.api_key;
        $('db-api-key').placeholder = 'Paste your demo API key';
        if (serverConfig.api_base) $('db-api-base').textContent = serverConfig.api_base.replace(/^https?:\/\//, '');
    }

    function focusCredentials() {
        const card = $('credentials');
        card.scrollIntoView({ block: 'start' });
        const firstEmpty = ['db-client-id', 'db-code', 'db-api-key'].map($).find((input) => !input.value);
        (firstEmpty || $('db-client-id')).focus({ preventScroll: true });
    }

    /** Format hints only: whether the credentials work is decided by the demo API. */
    function formatWarnings() {
        const { client_id, code } = DemoCredentials.get();
        const warnings = [];
        if (client_id && !UUID.test(client_id)) warnings.push('The Client ID doesn’t look like a UUID (8-4-4-4-12 characters).');
        if (code && !PORTAL_CODE.test(code)) warnings.push('Recipient codes are 3 letters (ABC) or 5 characters starting with a letter (ABC1D).');
        return warnings;
    }

    const fixNotes = new Map();

    function cleanInput(input, kind) {
        const { value, fixes } = DemoCredentials.clean(input.value, { kind });
        if (value === input.value) return;
        input.value = value;
        const label = { id: 'Client ID', code: 'Recipient code', key: 'API key' }[kind];
        fixNotes.set(kind, `${label}: removed ${fixes.join(', ')}.`);
        const notice = $('db-credentials-fixes');
        notice.textContent = `Cleaned up what was pasted. ${[...fixNotes.values()].join(' ')}`;
        notice.hidden = false;
    }

    async function testConnection() {
        const pill = $('db-connection-status');
        const result = $('db-credentials-result');
        const missing = DemoCredentials.missing();
        const warnings = formatWarnings();

        if (!DemoCredentials.get().api_key) {
            setPill(pill, 'warn', 'Not set');
            if (warnings.length) showNotice(result, 'error', warnings.join(' '));
            else result.hidden = true;
            return;
        }

        setPill(pill, 'neutral', 'Checking…');
        try {
            const check = await fetch('/api/credentials/check').then((r) => r.json());
            if (!check.ok) {
                setPill(pill, 'error', 'Key rejected');
                showNotice(result, 'error', `${check.detail} Check for a missing character, or paste the key again.`);
                return;
            }
            if (missing.length) {
                setPill(pill, 'warn', 'Incomplete');
                showNotice(result, 'error', `API key works on the demo API. Still missing: ${missing.join(', ')}.`);
            } else if (warnings.length) {
                setPill(pill, 'warn', 'Connected · check fields');
                showNotice(result, 'error', warnings.join(' '));
            } else {
                setPill(pill, 'success', 'Connected · demo API');
                result.hidden = true;
            }
        } catch {
            setPill(pill, 'error', 'Server unreachable');
        }
    }

    // ── Bookings list ──

    function select(id) {
        selectedId = id;
        openAction = null;
        actionError = null;
        if (id && location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
        render();
    }

    function render() {
        const bookings = Bookings.list();
        if (selectedId && !bookings.some((b) => b.id === selectedId)) selectedId = null;
        if (!selectedId && bookings[0]) selectedId = bookings[0].id;

        $('db-bookings-count').textContent = bookings.length
            ? `${bookings.length} booking${bookings.length === 1 ? '' : 's'} made on the booking site`
            : '';
        $('db-clear-bookings').hidden = !bookings.length;
        renderList(bookings);
        renderDetail(bookings.find((b) => b.id === selectedId));
    }

    function renderList(bookings) {
        const container = $('db-bookings-list');
        if (!bookings.length) {
            container.replaceChildren(h('div', { class: 'db-empty' },
                h('p', { class: 'db-empty-title' }, 'No bookings yet'),
                h('p', { class: 'db-muted' }, 'Make a booking on the booking site. Every checkout you start shows up here.'),
                h('a', { href: '/', class: 'db-btn db-btn-primary' }, 'Go to the booking site')
            ));
            return;
        }

        const rows = bookings.map((b) => {
            const status = statusOf(b);
            return h('tr', {
                class: b.id === selectedId ? 'selected' : '',
                tabindex: '0',
                'aria-selected': String(b.id === selectedId),
                onclick: () => select(b.id),
                onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(b.id); } },
            },
                h('td', {}, h('span', { class: 'db-ref' }, b.id), h('span', { class: 'db-sub' }, timeAgo(b.createdAt))),
                h('td', {}, h('span', {}, b.guest?.name || '—'), h('span', { class: 'db-sub' }, b.room)),
                h('td', {}, stayRange(b), h('span', { class: 'db-sub' }, `${b.nights} night${b.nights === 1 ? '' : 's'}`)),
                h('td', { class: 'db-num' }, b.amount ? money(b.amount, b.currency) : '—'),
                h('td', {}, pill(status.tone, status.label))
            );
        });

        container.replaceChildren(h('div', { class: 'db-table-wrap' }, h('table', { class: 'db-table' },
            h('thead', {}, h('tr', {}, ...['Booking', 'Guest', 'Stay', 'Amount', 'Status'].map((t, i) => h('th', { class: i === 3 ? 'db-num' : '' }, t)))),
            h('tbody', {}, ...rows)
        )));
    }

    function statusOf(b) {
        const payment = b.report?.payment_report?.status;
        const tokenization = b.report?.tokenization_report?.status;
        const captured = sum(b.captures);
        switch (b.checkoutStatus) {
            case 'failed': return { tone: 'error', label: 'Failed to start' };
            case 'canceled': return { tone: 'neutral', label: 'Abandoned' };
            case 'timeout': return { tone: 'warn', label: 'Timed out' };
            case 'started': return { tone: 'info', label: 'In checkout' };
        }
        if (payment === 'ALL_UNSUCCESSFUL') return { tone: 'error', label: 'Declined' };
        if (b.flow?.preauth && captured) {
            return captured >= (b.authorizedAmount || b.amount)
                ? { tone: 'success', label: 'Captured' }
                : { tone: 'success', label: 'Partly captured' };
        }
        if (b.flow?.preauth && payment && payment !== 'NO_PAYMENTS') return { tone: 'info', label: 'Authorized' };
        if (payment === 'SOME_IN_PROGRESS') return { tone: 'warn', label: 'Processing' };
        if (payment === 'FULLY_PAID') return { tone: 'success', label: 'Paid' };
        if (tokenization === 'SUCCESS' || b.token) return { tone: 'success', label: 'Card saved' };
        return { tone: 'success', label: 'Checkout completed' };
    }

    // ── Booking detail ──

    function renderDetail(b) {
        const panel = $('db-detail');
        if (!b) {
            panel.replaceChildren(h('p', { class: 'db-muted db-detail-empty' }, 'Select a booking to see its payments and actions.'));
            return;
        }

        const status = statusOf(b);
        const report = b.report || {};
        const captured = sum(b.captures);
        const charged = sum(b.charges);

        const facts = h('dl', { class: 'db-facts' });
        addFact(facts, 'Guest', h('span', {}, b.guest?.name || '—', b.guest?.email ? h('span', { class: 'db-sub' }, b.guest.email) : null));
        addFact(facts, 'Stay', h('span', {}, `${b.room}`, h('span', { class: 'db-sub' }, `${stayRange(b)} · ${b.guests || ''}`)));
        addFact(facts, 'Checkout', h('span', {}, b.flow?.title || '—', h('span', { class: 'db-sub' }, flowTech(b))));
        addFact(facts, 'Booking total', b.amount ? money(b.amount, b.currency) : 'No amount (card saved only)');
        if (b.flow?.preauth) {
            addFact(facts, 'Authorized', money(b.authorizedAmount || b.amount, b.currency));
            addFact(facts, 'Captured', money(captured, b.currency));
        }
        if (charged) addFact(facts, 'Charged to saved card', money(charged, b.currency));
        addFact(facts, 'Session', b.sessionId ? h('code', {}, b.sessionId) : 'Anonymous (browser only)');
        if (report.session_report?.status) addFact(facts, 'Session status', h('code', {}, report.session_report.status));
        if (report.payment_report?.status) {
            addFact(facts, 'Payment status', h('span', {}, h('code', {}, report.payment_report.status),
                h('span', { class: 'db-sub' }, paymentStatusText(b, report.payment_report.status))));
        }
        if (report.tokenization_report?.status) addFact(facts, 'Tokenization', h('code', {}, report.tokenization_report.status));
        if (b.reportedAt) addFact(facts, 'Last checked', timeAgo(b.reportedAt));

        panel.replaceChildren(...[
            h('div', { class: 'db-detail-head' },
                h('div', {}, h('h2', {}, b.id), h('p', { class: 'db-muted' }, `Created ${new Date(b.createdAt).toLocaleString('en-GB')}`)),
                pill(status.tone, status.label)
            ),
            facts,
            renderPayments(b),
            renderToken(b),
            renderCharges(b),
            renderActions(b),
            renderHistory(b),
            h('div', { class: 'db-detail-foot' },
                h('button', {
                    type: 'button',
                    class: 'db-btn db-btn-ghost db-btn-sm db-danger',
                    onclick: () => { if (confirm(`Delete booking ${b.id}?`)) Bookings.remove(b.id); },
                }, 'Delete booking')
            ),
        ].filter(Boolean));
    }

    function paymentStatusText(b, status) {
        if (b.flow?.preauth && status === 'SOME_IN_PROGRESS') {
            return b.captures?.length
                ? 'Capture sent; Flywire processes it asynchronously. Refresh status to see it settle.'
                : 'Authorized: the amount is held on the card, waiting for capture.';
        }
        return PAYMENT_STATUS[status] || '';
    }

    function renderPayments(b) {
        if (!b.payments?.length) return null;
        return h('div', { class: 'db-block' },
            h('h3', {}, 'Payments'),
            h('div', { class: 'db-table-wrap' }, h('table', { class: 'db-table db-table-compact' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Payment ID'), h('th', {}, 'Method'), h('th', { class: 'db-num' }, 'Captured'))),
                h('tbody', {}, ...b.payments.map((p) => h('tr', {},
                    h('td', {}, h('code', {}, p.payment_id)),
                    h('td', {}, CardBrands.describe(CardBrands.withSavedCard(p, b.report))),
                    h('td', { class: 'db-num' }, b.flow?.preauth ? money(sum(b.captures.filter((c) => c.payment_id === p.payment_id)), b.currency) : '—')
                )))
            ))
        );
    }

    /** The charge API answers with `payment_reference`; other payment APIs use `id`. */
    function chargePaymentId(data) {
        return data?.payment_reference || data?.id || data?.payment_id;
    }

    function renderCharges(b) {
        if (!b.charges?.length) return null;
        const rows = b.charges.map((c) => {
            // Charges saved before responses were stored: recover the response from the activity log.
            const response = c.response || b.history?.find((entry) => entry.action === 'charge' && entry.ok
                && entry.request?.body?.external_reference === c.external_reference)?.response;
            const info = response?.charge_info;
            const status = response?.charge_result?.status;
            return h('tr', {},
                h('td', {}, h('span', {}, c.description || '—'), h('span', { class: 'db-sub' }, c.external_reference || '')),
                h('td', {}, h('code', {}, c.payment_id || chargePaymentId(response) || '—')),
                h('td', { class: 'db-num' }, money(c.amount, b.currency),
                    info ? h('span', { class: 'db-sub' }, `guest paid ${money(info.amount, info.currency)}`) : null),
                h('td', {}, status ? pill(status === 'success' ? 'success' : status === 'pending' ? 'warn' : 'error', status) : '—')
            );
        });
        return h('div', { class: 'db-block' },
            h('h3', {}, 'Charges to saved card'),
            h('div', { class: 'db-table-wrap' }, h('table', { class: 'db-table db-table-compact' },
                h('thead', {}, h('tr', {}, h('th', {}, 'What for'), h('th', {}, 'Flywire payment'), h('th', { class: 'db-num' }, 'Amount'), h('th', {}, 'Result'))),
                h('tbody', {}, ...rows)
            )),
            h('p', { class: 'db-sub db-table-note' }, 'Amount is what the hotel charged; “guest paid” is what Flywire charged the guest in their own currency (charge_info).')
        );
    }

    function renderToken(b) {
        if (!b.token) return null;
        const facts = h('dl', { class: 'db-facts db-facts-compact' });
        const card = b.report?.tokenization_report;
        if (card?.brand || card?.last_four) {
            addFact(facts, 'Card', CardBrands.describe({ payment_method: 'credit_card', ...card }));
        } else if (card?.type) {
            addFact(facts, 'Method', card.type);
        }
        addFact(facts, 'payment_method_token', h('code', {}, b.token.payment_method_token || '—'));
        addFact(facts, 'mandate_id', h('code', {}, b.token.mandate_id || '—'));
        addFact(facts, 'payor_id', h('code', {}, b.token.payor_id || '—'));
        return h('div', { class: 'db-block' }, h('h3', {}, 'Saved card'), facts);
    }

    // ── Actions ──

    function actionsFor(b) {
        const hasPayment = b.payments?.length > 0;
        const noSession = b.sessionId ? null : {
            reason: 'This booking used an anonymous session, so there is no session to look up or resume on the server.',
            fix: 'Use an authenticated session (settings drawer, Session) for new bookings.',
        };
        const notPreauth = b.flow?.preauth ? null : {
            reason: `Flywire can only capture or extend a pre-authorized payment (a hold). This booking used “${b.flow?.title || 'a flow'}”, ${b.flow?.type === 'tokenization' && !b.amount ? 'which saves the card without charging or holding anything' : 'which charged the guest straight away'}.`,
            fix: 'To demo it, make a booking with a hold flow: Reserve & hold, Hold & save card, Hold (guest may save card) or Hold & keep card on file.',
        };
        const noPayment = hasPayment ? null : {
            reason: 'There is no payment ID on this booking yet.',
            fix: b.sessionId ? 'Click Refresh status after the guest completes checkout.' : 'The guest hasn’t completed checkout.',
        };
        // A hold is captured once; whatever isn't captured is released to the guest.
        const captured = sum(b.captures);
        const holdEnded = captured ? {
            reason: `${money(captured, b.currency)} was captured on ${new Date(b.captures[0].at).toLocaleString('en-GB')}, which ends the hold: anything not captured was released to the guest.`,
            fix: b.token
                ? 'For extras, use Charge saved card: this booking has the card on file.'
                : 'To demo it again, make a new booking with a hold flow.',
        } : null;
        const savesCard = b.flow?.type !== 'payment' || b.token;

        return [
            {
                id: 'refresh', label: 'Refresh status', method: 'GET', endpoint: '/commercial_payex/v2/session/{session_id}', playground: 'get_session',
                help: 'Reads the session from Flywire: session, payment and tokenization reports.',
                disabled: noSession, spec: refreshSpec,
            },
            {
                id: 'resume', label: 'Resume session', method: 'POST', endpoint: '/commercial_payex/v2/session/{session_id}', playground: 'resume_session',
                help: 'Gets new run credentials for this session, then reopens checkout with them where the guest left off, e.g. to send a payment link.',
                disabled: noSession || (b.checkout ? null : { reason: 'This booking was made before resume support.', fix: 'Make a new booking.' }),
                spec: resumeSpec,
            },
            {
                id: 'capture', label: 'Capture payment', method: 'POST', endpoint: '/payments/v1/payments/{payment_id}/captures', playground: 'capture_payment',
                help: 'Collects the held funds, fully or partly (e.g. at check-in). Any uncaptured amount is released to the guest.',
                disabled: notPreauth || noPayment || holdEnded, spec: captureSpec,
            },
            {
                id: 'extend', label: 'Extend hold', method: 'POST', endpoint: '/payments/v1/payments/{payment_id}/authorization_adjustments', playground: 'extend_preauth',
                help: 'Resets the hold to 7 days from today and can raise the authorized amount (increase only).',
                disabled: notPreauth || noPayment || holdEnded, spec: extendSpec,
            },
            {
                id: 'charge', label: 'Charge saved card', method: 'POST', endpoint: '/payments/v1/payments/charge', playground: 'charge_token',
                help: 'Charges the card saved at checkout without the guest present, e.g. minibar or a no-show fee.',
                disabled: savesCard ? null : {
                    reason: 'No card was saved on this booking.',
                    fix: 'Make a booking with a card-on-file flow, e.g. Save card, charge later or Pay now & save card.',
                },
                spec: chargeSpec,
            },
        ];
    }

    function renderActions(b) {
        const actions = actionsFor(b);
        // Unavailable actions stay clickable and explain why, instead of looking broken.
        const buttons = h('div', { class: 'db-actions' }, ...actions.map((a) => h('button', {
            type: 'button',
            class: `db-btn ${openAction === a.id ? 'db-btn-primary' : 'db-btn-secondary'}${a.disabled ? ' db-btn-unavailable' : ''}`,
            disabled: Boolean(busyAction),
            'aria-disabled': a.disabled ? 'true' : null,
            title: a.disabled ? a.disabled.reason : `${a.method} ${a.endpoint}`,
            'aria-expanded': String(openAction === a.id),
            onclick: () => {
                openAction = openAction === a.id ? null : a.id;
                actionError = null;
                render();
            },
        }, h('span', { class: `db-method db-method-${a.method.toLowerCase()}` }, a.method), busyAction === a.id ? 'Working…' : a.label)));

        const active = actions.find((a) => a.id === openAction);

        return h('div', { class: 'db-block' },
            h('div', { class: 'db-block-head' },
                h('h3', {}, 'Actions'),
                h('span', { class: 'db-sub' }, 'Flywire API calls, made through this demo’s server')
            ),
            buttons,
            active ? h('div', { class: 'db-action-panel' },
                h('div', { class: 'db-action-meta' },
                    h('div', { class: 'db-endpoint' },
                        h('span', { class: `db-method db-method-${active.method.toLowerCase()}` }, active.method),
                        h('code', {}, active.endpoint),
                        h('a', { href: PLAYGROUND + active.playground, target: '_blank', rel: 'noopener', class: 'db-btn db-btn-ghost db-btn-sm db-playground' }, 'Open in playground ↗')
                    ),
                    h('p', {}, active.help)
                ),
                active.disabled
                    ? h('div', { class: 'db-notice db-notice-warn', role: 'status' },
                        h('strong', {}, `${active.label} isn’t available for this booking. `), active.disabled.reason,
                        h('span', { class: 'db-notice-fix' }, active.disabled.fix))
                    : actionForm(b, active, active.spec(b))
            ) : null
        );
    }

    // ── Action specs: form fields, the Flywire request, and what to do with the response ──

    function refreshSpec(b) {
        return {
            request: () => ({
                upstream: { method: 'GET', path: `${SESSION_API}/${b.sessionId}` },
                proxy: { method: 'GET', url: `/api/flywire-session/${b.sessionId}` },
            }),
            onResult: (result, req) => {
                if (result.ok) Bookings.applyReport(b.id, result.data);
                const status = result.data?.payment_report?.status || result.data?.session_report?.status;
                record(b, result, req, result.ok ? `Status refreshed${status ? ` · ${status}` : ''}` : 'Status refresh failed', 'refresh');
            },
        };
    }

    function resumeSpec(b) {
        return {
            note: 'After Flywire answers, checkout opens on this page with the new run_id and run_token.',
            request: () => ({
                upstream: { method: 'POST', path: `${SESSION_API}/${b.sessionId}` },
                proxy: { method: 'POST', url: `/api/flywire-session/${b.sessionId}/resume` },
            }),
            onResult: (result, req) => {
                record(b, result, req, result.ok ? 'Session resumed · checkout reopened' : 'Resume failed', 'resume');
                if (result.ok) reopenCheckout(b, result.data);
            },
        };
    }

    function captureSpec(b) {
        const remaining = Math.max(0, (b.authorizedAmount || b.amount) - sum(b.captures));
        const paymentSelect = paymentPicker(b, 'capture');
        const amount = amountInput(`${b.id}:capture:amount`, remaining);
        return {
            fields: [paymentSelect.field, amount.field],
            request: () => paymentRequest(paymentSelect.value(), 'captures', { amount: amount.cents() }),
            onResult: (result, req) => {
                const cents = req.upstream.body.amount;
                record(b, result, req, `Captured ${money(cents, b.currency)}${resultStatus(result)}`, 'capture', (x) => {
                    x.captures.push({ payment_id: req.paymentId, amount: cents, at: Date.now() });
                });
            },
        };
    }

    function extendSpec(b) {
        const current = b.authorizedAmount || b.amount;
        const paymentSelect = paymentPicker(b, 'extend');
        const amount = amountInput(`${b.id}:extend:amount`, current, current);
        return {
            fields: [paymentSelect.field, amount.field],
            note: `Minimum ${money(current, b.currency)}: holds can only increase.`,
            request: () => paymentRequest(paymentSelect.value(), 'authorization_adjustments', { amount: amount.cents() }),
            onResult: (result, req) => {
                const cents = req.upstream.body.amount;
                const label = (cents > current ? `Hold raised to ${money(cents, b.currency)} and extended 7 days` : 'Hold extended 7 days') + resultStatus(result);
                record(b, result, req, label, 'extend', (x) => {
                    x.adjustments.push({ payment_id: req.paymentId, amount: cents, at: Date.now() });
                    x.authorizedAmount = Math.max(x.authorizedAmount || 0, cents);
                });
            },
        };
    }

    function paymentRequest(paymentId, operation, body) {
        const id = encodeURIComponent(paymentId);
        return {
            paymentId,
            upstream: { method: 'POST', path: `/payments/v1/payments/${id}/${operation}`, body },
            proxy: { method: 'POST', url: `/api/payments/${id}/${operation}`, body },
        };
    }

    function chargeSpec(b) {
        const amount = amountInput(`${b.id}:charge:amount`, 12000);
        const description = remember(`${b.id}:charge:description`, h('select', {}, ...CHARGE_PRESETS.map((p) => h('option', {}, p))));
        const reference = textInput(`${b.id}:charge:reference`, `${b.id}-${(b.charges?.length || 0) + 1}`);
        const token = b.token || {};
        const tokenInput = textInput(`${b.id}:charge:token`, token.payment_method_token);
        const mandateInput = textInput(`${b.id}:charge:mandate`, token.mandate_id);
        const payorInput = textInput(`${b.id}:charge:payor`, token.payor_id);
        const tokenFields = h('div', { class: 'db-token-fields' },
            h('p', { class: 'db-sub' }, b.token
                ? 'From the session’s tokenization_report. Edit if needed.'
                : 'The card token was not in the session report. Refresh status first, or paste the token details from the Flywire portal.'),
            field('payment_method_token', tokenInput),
            field('mandate_id', mandateInput),
            field('payor_id', payorInput)
        );
        const clean = (input) => DemoCredentials.clean(input.value, { kind: 'id' }).value;

        return {
            fields: [amount.field, field('What for (kept in the back office)', description), field('external_reference', reference), tokenFields],
            request: () => {
                const tokenData = {
                    payment_method_token: clean(tokenInput),
                    mandate_id: clean(mandateInput),
                    payor_id: clean(payorInput),
                };
                const externalReference = reference.value.trim();
                if (!externalReference) throw new Error('Add an external_reference for this charge, e.g. the booking number.');
                const recipientCode = DemoCredentials.get().code || b.recipientCode;
                const cents = amount.cents();
                return {
                    tokenData,
                    upstream: {
                        method: 'POST',
                        path: '/payments/v1/payments/charge',
                        // Same body the demo server sends to Flywire.
                        body: {
                            ...tokenData,
                            charge_intent: { mode: 'unscheduled' },
                            recipient: { id: recipientCode },
                            items: [{ id: 'default', amount: cents }],
                            external_reference: externalReference,
                        },
                    },
                    proxy: {
                        method: 'POST',
                        url: '/api/payments/charge',
                        body: { ...tokenData, recipient_code: recipientCode, external_reference: externalReference, amount: cents },
                    },
                };
            },
            onResult: (result, req) => {
                const cents = req.proxy.body.amount;
                const externalReference = req.proxy.body.external_reference;
                const chargeStatus = result.data?.charge_result?.status;
                const label = `Charged ${money(cents, b.currency)} · ${description.value} · ${externalReference}${chargeStatus && chargeStatus !== 'success' ? ` · ${chargeStatus}` : ''}`;
                record(b, result, req, label, 'charge', (x) => {
                    x.token = { ...x.token, ...req.tokenData };
                    const paymentId = chargePaymentId(result.data);
                    x.charges.push({
                        amount: cents, description: description.value, external_reference: externalReference,
                        at: Date.now(), payment_id: paymentId, response: result.data,
                    });
                    if (paymentId && !x.payments.some((p) => p.payment_id === paymentId)) {
                        const card = x.report?.tokenization_report || {};
                        x.payments.push({ payment_id: paymentId, payment_method: 'credit_card', brand: card.brand, last_four: card.last_four });
                    }
                });
            },
        };
    }

    /** Fields, a live preview of the exact Flywire request, and a Send button. */
    function actionForm(b, action, spec) {
        const showError = actionError && actionError.bookingId === b.id && actionError.action === action.id;
        const busy = busyAction === action.id;
        const submitLabel = `Send ${action.method} request`;
        const submit = h('button', { type: 'submit', class: 'db-btn db-btn-primary', disabled: busy }, busy ? 'Sending…' : submitLabel);
        const preview = h('div', { class: 'db-request' });

        const updatePreview = () => {
            let req = null;
            let problem = null;
            try {
                req = spec.request();
            } catch (err) {
                problem = err.message;
            }
            preview.replaceChildren(...requestPreview(req?.upstream, problem, updatePreview));
        };
        updatePreview();

        return h('form', {
            class: 'db-action-form',
            novalidate: true,
            oninput: updatePreview,
            onchange: updatePreview,
            onsubmit: async (e) => {
                e.preventDefault();
                actionError = null;
                let req;
                try {
                    req = spec.request();
                } catch (err) {
                    actionError = { bookingId: b.id, action: action.id, message: err.message };
                    render();
                    return;
                }
                busyAction = action.id;
                submit.disabled = true;
                submit.textContent = 'Sending…';
                try {
                    const result = await callApi(req.proxy);
                    await spec.onResult(result, req);
                } catch (err) {
                    actionError = { bookingId: b.id, action: action.id, message: err.message };
                } finally {
                    busyAction = null;
                    render();
                }
            },
        }, ...(spec.fields || []), spec.note ? h('p', { class: 'db-sub' }, spec.note) : null,
            preview,
            showError ? h('p', { class: 'db-notice db-notice-error', role: 'alert' }, actionError.message) : null,
            submit);
    }

    // ── Request preview (curl / fetch) ──

    function requestPreview(upstream, problem, rerender) {
        const tabs = h('div', { class: 'db-tabs', role: 'tablist', 'aria-label': 'Request format' },
            ...[['curl', 'curl'], ['fetch', 'Node fetch']].map(([id, label]) => h('button', {
                type: 'button',
                role: 'tab',
                class: `db-tab${previewLang === id ? ' active' : ''}`,
                'aria-selected': String(previewLang === id),
                onclick: () => {
                    previewLang = id;
                    localStorage.setItem(PREVIEW_LANG_KEY, id);
                    rerender();
                },
            }, label)));
        const code = upstream ? (previewLang === 'fetch' ? toFetch(upstream) : toCurl(upstream)) : '';
        const copy = h('button', { type: 'button', class: 'db-btn db-btn-ghost db-btn-sm', disabled: !upstream }, 'Copy');
        copy.addEventListener('click', () => copyText(copy, code));

        return [
            h('div', { class: 'db-request-head' }, h('span', { class: 'db-request-title' }, 'Request to Flywire'), tabs, copy),
            upstream
                ? h('pre', { class: 'db-code' }, h('code', {}, code))
                : h('p', { class: 'db-notice db-notice-error' }, problem || 'Fill in the fields above.'),
            h('p', { class: 'db-sub' }, 'This demo’s server sends it with your demo API key as X-Authentication-Key. The key is never shown here.'),
        ];
    }

    function apiUrl(path) {
        return `${serverConfig.api_base || DEFAULT_API_BASE}${path}`;
    }

    function toCurl({ method, path, body }) {
        const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} '${apiUrl(path)}'`, `  -H 'X-Authentication-Key: $FLYWIRE_DEMO_API_KEY'`];
        if (body) {
            lines.push(`  -H 'Content-Type: application/json'`);
            lines.push(`  -d '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`);
        }
        return lines.join(' \\\n');
    }

    function toFetch({ method, path, body }) {
        const indent = (text, spaces) => text.split('\n').map((line, i) => (i ? ' '.repeat(spaces) + line : line)).join('\n');
        const headers = [`    'X-Authentication-Key': process.env.FLYWIRE_DEMO_API_KEY,`];
        if (body) headers.unshift(`    'Content-Type': 'application/json',`);
        return [
            `const response = await fetch('${apiUrl(path)}', {`,
            `  method: '${method}',`,
            '  headers: {',
            ...headers,
            '  },',
            ...(body ? [`  body: JSON.stringify(${indent(JSON.stringify(body, null, 2), 2)}),`] : []),
            '});',
            'const data = await response.json();',
        ].join('\n');
    }

    async function copyText(button, text) {
        try {
            await navigator.clipboard.writeText(text);
            button.textContent = 'Copied';
        } catch {
            button.textContent = 'Copy failed';
        }
        setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    }

    function remember(key, control) {
        if (drafts.has(key)) control.value = drafts.get(key);
        control.addEventListener('input', () => drafts.set(key, control.value));
        control.addEventListener('change', () => drafts.set(key, control.value));
        return control;
    }

    function forgetDrafts(prefix) {
        [...drafts.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => drafts.delete(k));
    }

    function paymentPicker(b, action) {
        const select = remember(`${b.id}:${action}:payment`, h('select', {}, ...b.payments.map((p) => h('option', { value: p.payment_id },
            `${p.payment_id}${p.last_four ? ` · •••• ${p.last_four}` : ''}`))));
        return {
            field: b.payments.length > 1 ? field('Payment', select) : null,
            value: () => select.value || b.payments[0].payment_id,
        };
    }

    function amountInput(key, defaultCents, minCents) {
        const input = remember(key, h('input', {
            type: 'number', step: '0.01', min: minCents ? (minCents / 100).toFixed(2) : '0.01',
            value: (defaultCents / 100).toFixed(2), inputmode: 'decimal',
        }));
        return {
            field: field('Amount (USD)', input),
            cents: () => {
                const cents = Math.round(Number(input.value) * 100);
                if (!Number.isFinite(cents) || cents <= 0) throw new Error('Enter an amount greater than zero.');
                if (minCents && cents < minCents) throw new Error(`The amount must be at least ${money(minCents)}.`);
                return cents;
            },
        };
    }

    function textInput(key, value) {
        return remember(key, h('input', { type: 'text', value: value || '', spellcheck: 'false', autocomplete: 'off' }));
    }

    function field(label, control) {
        return h('label', { class: 'db-field' }, h('span', {}, label), control);
    }

    // ── Calling the API ──

    async function reopenCheckout(b, session) {
        try {
            await FlywireCheckout.launch({
                ...b.checkout,
                session,
                onEvent: (name, detail) => Bookings.trackCheckout(b.id, name, detail),
                onComplete: ({ report }) => Bookings.addHistory(b.id, {
                    action: 'resume', ok: true, label: `Checkout completed after resume${report?.payment_report?.status ? ` · ${report.payment_report.status}` : ''}`,
                    response: report,
                }),
                onCancel: () => Bookings.addHistory(b.id, { action: 'resume', ok: true, label: 'Guest closed checkout again' }),
                onTimeout: () => Bookings.addHistory(b.id, { action: 'resume', ok: false, label: 'Checkout timed out' }),
                onError: ({ type, payload }) => Bookings.addHistory(b.id, {
                    action: 'resume', ok: false, label: `on_error('${type}')`, response: payload,
                }),
            });
        } catch (err) {
            Bookings.addHistory(b.id, { action: 'resume', ok: false, label: `Checkout could not start: ${err.message}` });
        }
    }

    async function callApi({ method, url, body }) {
        const started = performance.now();
        try {
            const res = await fetch(url, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, data, ms: Math.round(performance.now() - started) };
        } catch (err) {
            return { ok: false, status: 0, data: { error: err.message }, ms: Math.round(performance.now() - started) };
        }
    }

    function record(b, result, req, label, action, onSuccess) {
        if (result.ok && onSuccess) Bookings.update(b.id, (x) => { onSuccess(x); return x; });
        Bookings.addHistory(b.id, {
            action,
            ok: result.ok,
            label: result.ok ? label : `${label.split(' · ')[0]} failed · ${errorText(result)}`,
            status: result.status,
            ms: result.ms,
            upstream: req.upstream,
            request: req.proxy,
            response: result.data,
        });
        if (result.ok && action !== 'refresh') {
            openAction = null;
            forgetDrafts(`${b.id}:${action}:`);
        }
        render();
        if (!result.ok && action !== 'refresh' && action !== 'resume') throw new Error(errorText(result));
    }

    /** Capture and extend answer `charge_result.status: 'received'`: accepted, processed asynchronously. */
    function resultStatus(result) {
        const status = result.ok && result.data?.charge_result?.status;
        return status ? ` · ${status}` : '';
    }

    function errorText(result) {
        const d = result.data || {};
        const text = d.detail || d.error || d.message || d.title || `HTTP ${result.status}`;
        const fields = (d.errors || []).map((e) => [e.param, e.message].filter(Boolean).join(' ')).filter(Boolean);
        return fields.length ? `${text}: ${fields.join('; ')}` : text;
    }

    // ── History ──

    function renderHistory(b) {
        if (!b.history?.length) return null;
        return h('div', { class: 'db-block' },
            h('h3', {}, 'Activity'),
            h('ol', { class: 'db-history' }, ...b.history.map((entry) => {
                // Entries recorded before the Flywire endpoint was stored show this demo's proxy URL instead.
                const call = entry.upstream || entry.request;
                const path = entry.upstream ? entry.upstream.path : entry.request?.url;
                const summary = call
                    ? [`${call.method} ${path}`, entry.status ? `→ ${entry.status}` : '', entry.ms !== undefined ? `· ${entry.ms} ms` : ''].filter(Boolean).join(' ')
                    : 'Show data';
                return h('li', { class: entry.ok ? 'ok' : 'failed' },
                    h('div', { class: 'db-history-head' },
                        h('span', {}, entry.label),
                        h('span', { class: 'db-sub' }, new Date(entry.at).toLocaleTimeString('en-GB'))
                    ),
                    call || entry.response !== undefined ? h('details', {},
                        h('summary', {}, summary),
                        entry.upstream ? historyCode('Request', toCurl(entry.upstream)) : null,
                        !entry.upstream && entry.request?.body ? historyCode('Request body', JSON.stringify(entry.request.body, null, 2)) : null,
                        entry.response !== undefined ? historyCode('Response', maskJson(entry.response)) : null
                    ) : null
                );
            }))
        );
    }

    function historyCode(title, text) {
        const copy = h('button', { type: 'button', class: 'db-btn db-btn-ghost db-btn-sm' }, 'Copy');
        copy.addEventListener('click', () => copyText(copy, text));
        return h('div', { class: 'db-history-code' },
            h('div', { class: 'db-request-head' }, h('span', { class: 'db-request-title' }, title), copy),
            h('pre', {}, h('code', {}, text)));
    }

    function maskJson(value) {
        return JSON.stringify(value, (key, v) => (key === 'run_token' && typeof v === 'string' ? `${v.slice(0, 6)}…${v.slice(-4)}` : v), 2) ?? '';
    }

    // ── Helpers ──

    function flowTech(b) {
        return [b.flow?.type, b.flow?.preauth && 'preauth', b.flow?.channel, b.session].filter(Boolean).join(' · ');
    }

    function stayRange(b) {
        const opts = { month: 'short', day: 'numeric' };
        return `${new Date(b.checkIn).toLocaleDateString('en-US', opts)} – ${new Date(b.checkOut).toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
    }

    function sum(items) {
        return (items || []).reduce((total, item) => total + (item.amount || 0), 0);
    }

    function money(cents, currency = 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
    }

    function timeAgo(ms) {
        const minutes = Math.round((Date.now() - ms) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} h ago`;
        return new Date(ms).toLocaleDateString('en-GB');
    }

    function pill(tone, label) {
        return h('span', { class: `db-pill db-pill-${tone}` }, label);
    }

    function setPill(node, tone, label) {
        node.className = `db-pill db-pill-${tone}`;
        node.textContent = label;
    }

    function showNotice(node, tone, text) {
        node.className = `db-notice db-notice-${tone}`;
        node.textContent = text;
        node.hidden = false;
    }

    function addFact(dl, term, value) {
        dl.append(h('dt', {}, term), h('dd', {}, value));
    }

    function h(tag, attrs, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === null || value === undefined || value === false) continue;
            if (key === 'class') node.className = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else if (key === 'value' || key === 'disabled' || key === 'hidden' || key === 'novalidate') node[key === 'novalidate' ? 'noValidate' : key] = value;
            else node.setAttribute(key, value === true ? '' : value);
        }
        node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
        return node;
    }
})();
