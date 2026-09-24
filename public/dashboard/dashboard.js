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
    let selectedId = decodeURIComponent(location.hash.slice(1)) || null;
    let openAction = null;
    let busyAction = null;
    let actionError = null;
    // Typed form values survive re-renders (e.g. when another tab updates the bookings).
    const drafts = new Map();

    document.addEventListener('DOMContentLoaded', async () => {
        serverConfig = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
        initCredentials();
        $('db-clear-bookings').addEventListener('click', () => {
            if (!Bookings.list().length || !confirm('Delete all demo bookings from this browser?')) return;
            Bookings.clear();
        });
        window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1)) || null));
        Bookings.onChange(render);
        render();
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
        $('db-client-id').placeholder = serverConfig.client_id ? `Server: ${serverConfig.client_id}` : 'UUID';
        $('db-code').value = saved.code;
        $('db-code').placeholder = serverConfig.code ? `Server: ${serverConfig.code}` : 'e.g. DTT';
        $('db-api-key').value = saved.api_key;
        $('db-api-key').placeholder = serverConfig.authenticated_sessions && !saved.api_key ? 'Using the server key' : 'Paste your API key';
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
        setPill(pill, 'neutral', 'Checking…');
        try {
            const check = await fetch('/api/credentials/check').then((r) => r.json());
            const source = check.source === 'browser' ? 'your key' : check.source === 'server' ? 'server key' : 'no key';
            if (check.ok) {
                setPill(pill, 'success', `Connected · ${source}`);
                result.hidden = true;
            } else {
                setPill(pill, 'error', check.source === 'none' ? 'No API key' : 'Key rejected');
                showNotice(result, 'error', `${check.detail} Check for a missing character, or paste the key again.`);
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
                id: 'refresh', label: 'Refresh status', api: 'GET /commercial_payex/v2/session/{id}', playground: 'get_session',
                help: 'Reads the session from Flywire: session, payment and tokenization reports.',
                disabled: noSession, run: () => refreshStatus(b),
            },
            {
                id: 'resume', label: 'Resume session', api: 'POST /commercial_payex/v2/session/{id}', playground: 'resume_session',
                help: 'Gets new run credentials for this session and reopens checkout where the guest left off, e.g. to send a payment link.',
                disabled: noSession || (b.checkout ? null : { reason: 'This booking was made before resume support.', fix: 'Make a new booking.' }),
                run: () => resumeSession(b),
            },
            {
                id: 'capture', label: 'Capture payment', api: 'POST /payments/v1/payments/{id}/captures', playground: 'capture_payment',
                help: 'Collects the held funds, fully or partly (e.g. at check-in). Any uncaptured amount is released to the guest.',
                disabled: notPreauth || noPayment || holdEnded, form: captureForm,
            },
            {
                id: 'extend', label: 'Extend hold', api: 'POST /payments/v1/payments/{id}/authorization_adjustments', playground: 'extend_preauth',
                help: 'Resets the hold to 7 days from today and can raise the authorized amount (increase only).',
                disabled: notPreauth || noPayment || holdEnded, form: extendForm,
            },
            {
                id: 'charge', label: 'Charge saved card', api: 'POST /payments/v1/payments/charge', playground: 'charge_token',
                help: 'Charges the card saved at checkout without the guest present, e.g. minibar or a no-show fee.',
                disabled: savesCard ? null : {
                    reason: 'No card was saved on this booking.',
                    fix: 'Make a booking with a card-on-file flow, e.g. Save card, charge later or Pay now & save card.',
                },
                form: chargeForm,
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
            title: a.disabled ? a.disabled.reason : a.help,
            'aria-expanded': a.form || a.disabled ? String(openAction === a.id) : null,
            onclick: () => {
                if (a.form || a.disabled) {
                    openAction = openAction === a.id ? null : a.id;
                    actionError = null;
                    render();
                } else {
                    a.run();
                }
            },
        }, busyAction === a.id ? 'Working…' : a.label)));

        const active = actions.find((a) => a.id === openAction);
        const meta = active && h('div', { class: 'db-action-meta' },
            h('p', {}, active.help),
            h('p', { class: 'db-sub' }, h('code', {}, active.api), ' · ',
                h('a', { href: PLAYGROUND + active.playground, target: '_blank', rel: 'noopener', class: 'db-link' }, 'Playground ↗'))
        );

        return h('div', { class: 'db-block' },
            h('h3', {}, 'Actions'),
            buttons,
            active ? h('div', { class: 'db-action-panel' },
                meta,
                active.disabled
                    ? h('div', { class: 'db-notice db-notice-warn', role: 'status' },
                        h('strong', {}, `${active.label} isn’t available for this booking. `), active.disabled.reason,
                        h('span', { class: 'db-notice-fix' }, active.disabled.fix))
                    : active.form(b)
            ) : null
        );
    }

    function captureForm(b) {
        const remaining = Math.max(0, (b.authorizedAmount || b.amount) - sum(b.captures));
        const paymentSelect = paymentPicker(b, 'capture');
        const amount = amountInput(`${b.id}:capture:amount`, remaining);
        return form(b, 'capture', [paymentSelect.field, amount.field], `Capture`, async () => {
            const cents = amount.cents();
            const paymentId = paymentSelect.value();
            const result = await callApi('POST', `/api/payments/${encodeURIComponent(paymentId)}/captures`, { amount: cents });
            record(b, result, `Captured ${money(cents, b.currency)}${resultStatus(result)}`, 'capture', (x) => {
                x.captures.push({ payment_id: paymentId, amount: cents, at: Date.now() });
            });
        });
    }

    function extendForm(b) {
        const current = b.authorizedAmount || b.amount;
        const paymentSelect = paymentPicker(b, 'extend');
        const amount = amountInput(`${b.id}:extend:amount`, current, current);
        return form(b, 'extend', [paymentSelect.field, amount.field], 'Extend hold', async () => {
            const cents = amount.cents();
            const paymentId = paymentSelect.value();
            const result = await callApi('POST', `/api/payments/${encodeURIComponent(paymentId)}/authorization_adjustments`, { amount: cents });
            const label = (cents > current ? `Hold raised to ${money(cents, b.currency)} and extended 7 days` : 'Hold extended 7 days') + resultStatus(result);
            record(b, result, label, 'extend', (x) => {
                x.adjustments.push({ payment_id: paymentId, amount: cents, at: Date.now() });
                x.authorizedAmount = Math.max(x.authorizedAmount || 0, cents);
            });
        }, `Minimum ${money(current, b.currency)}: holds can only increase.`);
    }

    function chargeForm(b) {
        const amount = amountInput(`${b.id}:charge:amount`, 12000);
        const description = remember(`${b.id}:charge:description`, h('select', {}, ...CHARGE_PRESETS.map((p) => h('option', {}, p))));
        const reference = textInput(`${b.id}:charge:reference`, `${b.id}-${(b.charges?.length || 0) + 1}`);
        const token = b.token || {};
        const tokenInput = textInput(`${b.id}:charge:token`, token.payment_method_token);
        const mandateInput = textInput(`${b.id}:charge:mandate`, token.mandate_id);
        const payorInput = textInput(`${b.id}:charge:payor`, token.payor_id);
        const tokenFields = h('div', { class: 'db-token-fields' },
            h('p', { class: 'db-sub' }, b.token
                ? 'From the session’s tokenization report. Edit if needed.'
                : 'The card token was not in the session report. Refresh status first, or paste the token details from the Flywire portal.'),
            field('payment_method_token', tokenInput),
            field('mandate_id', mandateInput),
            field('payor_id', payorInput)
        );

        return form(b, 'charge', [amount.field, field('What for', description), field('Your reference (external_reference)', reference), tokenFields], 'Charge card', async () => {
            const cents = amount.cents();
            const clean = (input) => DemoCredentials.clean(input.value, { kind: 'id' }).value;
            const tokenData = {
                payment_method_token: clean(tokenInput),
                mandate_id: clean(mandateInput),
                payor_id: clean(payorInput),
            };
            const recipientCode = DemoCredentials.get().code || b.recipientCode || serverConfig.code;
            const externalReference = reference.value.trim();
            if (!externalReference) throw new Error('Add a reference for this charge, e.g. the booking number.');
            const result = await callApi('POST', '/api/payments/charge', {
                ...tokenData, recipient_code: recipientCode, external_reference: externalReference, amount: cents,
            });
            const chargeStatus = result.data?.charge_result?.status;
            const label = `Charged ${money(cents, b.currency)} · ${description.value} · ${externalReference}${chargeStatus && chargeStatus !== 'success' ? ` · ${chargeStatus}` : ''}`;
            record(b, result, label, 'charge', (x) => {
                x.token = { ...x.token, ...tokenData };
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
        });
    }

    function form(b, id, fields, submitLabel, onSubmit, note) {
        const showError = actionError && actionError.bookingId === b.id && actionError.action === id;
        const submit = h('button', { type: 'submit', class: 'db-btn db-btn-primary', disabled: busyAction === id }, busyAction === id ? 'Working…' : submitLabel);
        return h('form', {
            class: 'db-action-form',
            novalidate: true,
            onsubmit: async (e) => {
                e.preventDefault();
                actionError = null;
                busyAction = id;
                submit.disabled = true;
                submit.textContent = 'Working…';
                try {
                    await onSubmit();
                } catch (err) {
                    actionError = { bookingId: b.id, action: id, message: err.message };
                } finally {
                    busyAction = null;
                    render();
                }
            },
        }, ...fields, note ? h('p', { class: 'db-sub' }, note) : null,
            showError ? h('p', { class: 'db-notice db-notice-error', role: 'alert' }, actionError.message) : null,
            submit);
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

    // ── Session actions ──

    async function refreshStatus(b) {
        busyAction = 'refresh';
        render();
        const result = await callApi('GET', `/api/flywire-session/${b.sessionId}`);
        busyAction = null;
        if (result.ok) Bookings.applyReport(b.id, result.data);
        const status = result.data?.payment_report?.status || result.data?.session_report?.status;
        record(b, result, result.ok ? `Status refreshed${status ? ` · ${status}` : ''}` : 'Status refresh failed', 'refresh');
    }

    async function resumeSession(b) {
        busyAction = 'resume';
        render();
        const result = await callApi('POST', `/api/flywire-session/${b.sessionId}/resume`);
        busyAction = null;
        record(b, result, result.ok ? 'Session resumed · checkout reopened' : 'Resume failed', 'resume');
        if (!result.ok) return;

        try {
            await FlywireCheckout.launch({
                ...b.checkout,
                session: result.data,
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

    async function callApi(method, url, body) {
        try {
            const res = await fetch(url, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, data, request: { method, url, body } };
        } catch (err) {
            return { ok: false, status: 0, data: { error: err.message }, request: { method, url, body } };
        }
    }

    function record(b, result, label, action, onSuccess) {
        if (result.ok && onSuccess) Bookings.update(b.id, (x) => { onSuccess(x); return x; });
        Bookings.addHistory(b.id, {
            action,
            ok: result.ok,
            label: result.ok ? label : `${label.split(' · ')[0]} failed · ${errorText(result)}`,
            status: result.status,
            request: result.request,
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
            h('ol', { class: 'db-history' }, ...b.history.map((entry) => h('li', { class: entry.ok ? 'ok' : 'failed' },
                h('div', { class: 'db-history-head' },
                    h('span', {}, entry.label),
                    h('span', { class: 'db-sub' }, new Date(entry.at).toLocaleTimeString('en-GB'))
                ),
                entry.request || entry.response !== undefined ? h('details', {},
                    h('summary', {}, entry.request ? `${entry.request.method} ${entry.request.url}${entry.status ? ` → ${entry.status}` : ''}` : 'Show data'),
                    entry.request?.body ? h('pre', {}, h('code', {}, JSON.stringify(entry.request.body, null, 2))) : null,
                    entry.response !== undefined ? h('pre', {}, h('code', {}, maskJson(entry.response))) : null
                ) : null
            )))
        );
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
