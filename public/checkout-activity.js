/**
 * Checkout activity drawer — demo tooling that shows, live, what Flywire
 * Checkout V2 returns: the session your server created, the exact
 * `cpx_core.start()` payload, every `on_error` / `on_end` callback and the
 * session outcome read back from your server.
 *
 * Not part of the SDK integration; it only listens to `FlywireCheckout.launch({ onEvent })`.
 */
(function (global) {
    'use strict';

    const SESSION_STATUS = {
        ACTIVE: 'Session is open; the payer can still act on it.',
        PARTIALLY_COMPLETED: 'Some of the requested operations finished.',
        COMPLETED: 'Everything requested in the session is done.',
        ARCHIVED: 'Session is closed and read-only.',
    };

    const PAYMENT_STATUS = {
        NO_PAYMENTS: 'No payment was made (for example, a card was only saved).',
        SOME_IN_PROGRESS: 'A payment is still processing (for example, a pending bank transfer).',
        ALL_UNSUCCESSFUL: 'Every payment attempt failed.',
        FULLY_PAID: 'The full amount was paid.',
        PARTIALLY_PAID: 'Only part of the amount was paid.',
        OVERPAID: 'More than the requested amount was paid.',
    };

    const STATUS_LABEL = {
        starting: 'Starting',
        open: 'Checkout open',
        completed: 'Completed',
        declined: 'Declined',
        canceled: 'Canceled by payer',
        timeout: 'Timed out',
        failed: 'Failed to start',
        interrupted: 'Interrupted by reload',
    };

    const STORAGE_KEY = 'caldera.checkoutActivity.v1';
    const MAX_RUNS = 20;

    const runs = loadRuns();
    const expandedData = new Set();
    let unseen = false;
    let lastFocused = null;

    const $ = (id) => document.getElementById(id);

    // ── Recording ──

    function loadRuns() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            // A run that was still in progress lost its checkout when the page reloaded.
            saved.forEach((run) => {
                if (run.status === 'starting' || run.status === 'open') run.status = 'interrupted';
            });
            return saved;
        } catch {
            return [];
        }
    }

    function saveRuns() {
        runs.splice(MAX_RUNS);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
        } catch {
            // Storage full or unavailable: keep the log in memory only.
        }
    }

    function startRun(meta) {
        const number = runs.reduce((max, run) => Math.max(max, run.number), 0) + 1;
        runs.unshift({ number, startedAt: Date.now(), meta, events: [], status: 'starting', errors: 0 });
        record('run_started', meta);
    }

    function record(name, detail) {
        const run = runs[0];
        if (!run) return;
        // Stored as displayed: callbacks become labels and run_token stays masked.
        run.events.push({ at: Date.now(), name, detail: sanitize(detail) });

        switch (name) {
            case 'session_created':
            case 'session_resumed': run.sessionId = detail.session.id; break;
            case 'start': run.status = 'open'; break;
            case 'on_error': run.errors += 1; break;
            case 'on_end':
                run.reason = detail.reason;
                run.endedAt = Date.now();
                run.status = detail.reason === 'completed' ? 'completed' : detail.reason === 'timeout' ? 'timeout' : 'canceled';
                if (detail.reason === 'completed' && detail.payload) run.report = sanitize(detail.payload);
                break;
            case 'session_report':
                run.report = sanitize(detail.report);
                if (run.reason === 'completed') {
                    run.status = detail.report?.payment_report?.status === 'ALL_UNSUCCESSFUL' ? 'declined' : 'completed';
                }
                break;
            case 'launch_failed': run.status = 'failed'; break;
        }
        saveRuns();

        if ($('activity-drawer').hidden) setUnseen(true);
        else render();
    }

    function setUnseen(value) {
        unseen = value;
        document.querySelectorAll('[data-activity-badge]').forEach((badge) => { badge.hidden = !value; });
    }

    async function refreshStatus(run) {
        const btn = $('activity-refresh');
        btn.disabled = true;
        btn.textContent = 'Refreshing…';
        try {
            const report = await global.FlywireCheckout.getSession(run.sessionId);
            recordOn(run, 'session_report', { sessionId: run.sessionId, report, manual: true });
        } catch (error) {
            recordOn(run, 'session_report_failed', { sessionId: run.sessionId, error: error.message, manual: true });
        }
    }

    function recordOn(run, name, detail) {
        const index = runs.indexOf(run);
        if (index > 0) {
            runs.splice(index, 1);
            runs.unshift(run);
        }
        record(name, detail);
    }

    // ── Drawer ──

    function init() {
        document.querySelectorAll('[data-activity-open]').forEach((btn) => btn.addEventListener('click', open));
        document.querySelectorAll('[data-activity-close]').forEach((btn) => btn.addEventListener('click', close));
        $('activity-drawer').addEventListener('keydown', onKeydown);
        $('activity-clear').addEventListener('click', () => {
            runs.length = 0;
            expandedData.clear();
            localStorage.removeItem(STORAGE_KEY);
            render();
        });
        $('activity-copy').addEventListener('click', copyLog);
        render();
    }

    function open() {
        lastFocused = document.activeElement;
        render();
        setUnseen(false);
        const drawer = $('activity-drawer');
        drawer.hidden = false;
        requestAnimationFrame(() => drawer.classList.add('open'));
        document.body.classList.add('fw-drawer-locked');
        $('activity-drawer-title').focus();
    }

    function close() {
        const drawer = $('activity-drawer');
        drawer.classList.remove('open');
        document.body.classList.remove('fw-drawer-locked');
        setTimeout(() => { drawer.hidden = true; }, 250);
        lastFocused?.focus();
    }

    function onKeydown(e) {
        if (e.key === 'Escape') return close();
        if (e.key !== 'Tab') return;
        const focusable = [...$('activity-drawer').querySelectorAll('button:not(:disabled), summary, a[href], [tabindex="0"]')]
            .filter((el) => el.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function render() {
        const body = $('activity-body');
        if (!runs.length) {
            const empty = el('div', 'fw-activity-empty');
            empty.append(
                el('p', 'fw-activity-empty-title', 'No checkout activity yet'),
                el('p', 'fw-help', 'Open checkout from the payment step. Everything it returns will show up here as it happens.')
            );
            body.replaceChildren(empty);
            return;
        }

        const [latest, ...previous] = runs;
        const children = [renderStatus(latest), renderOutcome(latest), renderTimeline(latest, true)];
        if (previous.length) {
            children.push(el('h3', 'fw-section-title fw-activity-previous', 'Earlier runs'));
            previous.forEach((run) => children.push(renderTimeline(run, false)));
        }
        body.replaceChildren(...children.filter(Boolean));
    }

    function renderStatus(run) {
        const card = el('section', 'fw-activity-status');
        const top = el('div', 'fw-activity-status-top');
        top.append(pill(run.status), el('span', 'fw-muted', `Run #${run.number} · ${time(run.startedAt)}`));

        const facts = el('dl', 'fw-facts');
        addFact(facts, 'Flow', run.meta.flow);
        addFact(facts, 'Transaction', run.meta.transaction);
        addFact(facts, 'Amount', run.meta.amount);
        addFact(facts, 'Session', run.meta.session === 'authenticated'
            ? (run.sessionId ? code(run.sessionId) : 'Authenticated (creating…)')
            : 'Anonymous');
        addFact(facts, 'Display', run.meta.display);
        if (run.endedAt) addFact(facts, 'Time in checkout', duration(run.endedAt - run.startedAt));
        if (run.errors) addFact(facts, 'on_error calls', String(run.errors));

        card.append(top, facts);
        return card;
    }

    function renderOutcome(run) {
        if (!run.reason) return null;

        const card = el('section', 'fw-activity-outcome');
        card.append(el('h3', 'fw-section-title', 'Outcome'));

        const facts = el('dl', 'fw-facts');
        addFact(facts, 'on_end reason', code(`'${run.reason}'`));

        const session = run.report?.session_report;
        const payment = run.report?.payment_report;
        if (session?.status) addFact(facts, 'Session status', statusValue(session.status, SESSION_STATUS));
        if (payment?.status) {
            const held = run.meta.transaction?.includes('preauth') && payment.status === 'SOME_IN_PROGRESS';
            addFact(facts, 'Payment status', statusValue(payment.status, held
                ? { SOME_IN_PROGRESS: 'Authorized: the amount is held on the card, waiting for capture (hotel back office).' }
                : PAYMENT_STATUS));
        }
        if (payment?.amount !== undefined) addFact(facts, 'Reported amount', reportedAmount(payment));
        if (run.reason === 'completed' && !run.report) {
            addFact(facts, 'Report', 'Not available yet.');
        }
        card.append(facts);

        const payments = payment?.payment_watchlist || [];
        if (payments.length) {
            const showExpiry = payments.some((p) => global.CardBrands.expiry(p));
            const table = el('table', 'fw-activity-table');
            const head = el('tr');
            ['Payment ID', 'Method', 'Card', ...(showExpiry ? ['Expires'] : [])].forEach((h) => head.append(el('th', null, h)));
            table.append(head);
            payments.map((p) => global.CardBrands.withSavedCard(p, run.report)).forEach((p) => {
                const row = el('tr');
                const isCard = global.CardBrands.isCardPayment(p);
                row.append(
                    cell(code(p.payment_id || '—')),
                    cell(global.CardBrands.methodLabel(p.payment_method) || '—'),
                    cell(isCard ? global.CardBrands.describe(p, { withExpiry: false }) : '—')
                );
                if (showExpiry) row.append(cell(global.CardBrands.expiry(p) || '—'));
                table.append(row);
            });
            card.append(table);
        }

        if (run.reason === 'canceled') {
            card.append(el('p', 'fw-help', 'The payer closed checkout. Nothing is reported for canceled runs.'));
        } else if (run.reason === 'timeout') {
            card.append(el('p', 'fw-help', 'config.timeout expired and checkout closed itself.'));
        } else if (run.sessionId) {
            const actions = el('div', 'fw-activity-actions');
            const refresh = el('button', 'fw-btn fw-btn-secondary', 'Refresh status');
            refresh.type = 'button';
            refresh.id = 'activity-refresh';
            refresh.addEventListener('click', () => refreshStatus(run));
            actions.append(refresh, el('span', 'fw-help', 'Reads the session again from your server, e.g. while a bank transfer is pending.'));
            card.append(actions);
        } else {
            card.append(el('p', 'fw-help', 'Anonymous session: this report arrived in the browser as the on_end payload.'));
        }
        return card;
    }

    function renderTimeline(run, expanded) {
        const wrap = el('details', 'fw-activity-run');
        wrap.open = expanded;
        const summary = el('summary', 'fw-activity-run-summary');
        summary.append(
            el('span', null, expanded ? 'Timeline' : `Run #${run.number} · ${run.meta.flow}`),
            el('span', 'fw-muted', expanded ? `${run.events.length} events` : `${STATUS_LABEL[run.status]} · ${time(run.startedAt)}`)
        );
        wrap.append(summary);

        const list = el('ol', 'fw-timeline');
        run.events.forEach((event, index) => list.append(renderEvent(run, event, `${run.number}:${index}`)));
        wrap.append(list);
        return wrap;
    }

    function renderEvent(run, event, key) {
        const { title, text, tone, data } = describe(event);
        const item = el('li', `fw-timeline-item fw-tone-${tone}`);
        const head = el('div', 'fw-timeline-head');
        head.append(el('span', 'fw-timeline-title', title), el('span', 'fw-timeline-time', `+${duration(event.at - run.startedAt)}`));
        item.append(head);
        if (text) item.append(el('p', 'fw-timeline-text', text));
        if (data !== undefined) {
            const details = el('details', 'fw-timeline-data');
            details.open = expandedData.has(key);
            details.addEventListener('toggle', () => {
                if (details.open) expandedData.add(key);
                else expandedData.delete(key);
            });
            details.append(el('summary', null, 'Show data'));
            const pre = el('pre');
            pre.append(el('code', null, json(data)));
            details.append(pre);
            item.append(details);
        }
        return item;
    }

    function describe({ name, detail }) {
        switch (name) {
            case 'run_started':
                return { title: 'Checkout requested', text: `${detail.flow} · ${detail.amount} · ${detail.display}`, tone: 'neutral' };
            case 'session_created':
                return {
                    title: 'Session created by your server',
                    text: 'POST /commercial_payex/v2/session returned the credentials passed to initFields.session.',
                    tone: 'info',
                    data: detail.session,
                };
            case 'session_resumed':
                return {
                    title: 'Session resumed by your server',
                    text: 'POST /commercial_payex/v2/session/{id} returned new run credentials for the existing session.',
                    tone: 'info',
                    data: detail.session,
                };
            case 'start':
                return { title: 'cpx_core.start(initFields)', text: 'Checkout opened with this payload.', tone: 'info', data: detail.initFields };
            case 'on_error':
                return {
                    title: `on_error('${detail.type}')`,
                    text: typeof detail.payload === 'string' ? detail.payload : 'Checkout stays open so the payer can retry.',
                    tone: 'warn',
                    data: detail.payload,
                };
            case 'on_end':
                return {
                    title: `on_end('${detail.reason}')`,
                    text: detail.payload
                        ? 'Payload returned in the browser (anonymous session).'
                        : detail.reason === 'completed'
                            ? 'No payload for authenticated sessions; ask your server for the outcome.'
                            : null,
                    tone: detail.reason === 'completed' ? 'success' : detail.reason === 'timeout' ? 'warn' : 'neutral',
                    data: detail.payload,
                };
            case 'session_report': {
                const s = detail.report?.session_report?.status;
                const p = detail.report?.payment_report?.status;
                return {
                    title: detail.manual ? 'Status refreshed from your server' : 'Session outcome from your server',
                    text: [`GET /commercial_payex/v2/session/{id}`, s && `session ${s}`, p && `payment ${p}`].filter(Boolean).join(' · '),
                    tone: p === 'ALL_UNSUCCESSFUL' ? 'error' : 'success',
                    data: detail.report,
                };
            }
            case 'session_report_failed':
                return { title: 'Session lookup failed', text: detail.error, tone: 'error' };
            case 'launch_failed':
                return { title: 'Checkout could not start', text: detail.error, tone: 'error' };
            default:
                return { title: name, tone: 'neutral', data: detail };
        }
    }

    async function copyLog() {
        const btn = $('activity-copy');
        const log = runs.map((run) => ({
            run: run.number,
            meta: run.meta,
            status: run.status,
            events: run.events.map((e) => ({ at: new Date(e.at).toISOString(), name: e.name, detail: e.detail })),
        }));
        try {
            await navigator.clipboard.writeText(json(log));
            btn.textContent = 'Copied';
        } catch {
            btn.textContent = 'Copy failed';
        }
        setTimeout(() => { btn.textContent = 'Copy log'; }, 1500);
    }

    // ── Helpers ──

    function sanitize(value) {
        return value === undefined ? undefined : JSON.parse(json(value));
    }

    function json(value) {
        return JSON.stringify(value, (key, v) => {
            if (typeof v === 'function') return 'ƒ (callback)';
            if (key === 'run_token' && typeof v === 'string') return `${v.slice(0, 6)}…${v.slice(-4)}`;
            return v;
        }, 2) ?? 'undefined';
    }

    /** payment_report.amount is in subunits (cents). */
    function reportedAmount({ amount, currency }) {
        const wrap = el('span', 'fw-status-value');
        let formatted = String(amount);
        try {
            formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount / 100);
        } catch {
            // unknown currency code: fall back to the raw value
        }
        wrap.append(el('span', null, formatted), el('span', 'fw-muted', `${amount} ${currency || ''} in subunits`.trim()));
        return wrap;
    }

    function pill(status) {
        return el('span', `fw-status fw-status-${status}`, STATUS_LABEL[status]);
    }

    function statusValue(status, explanations) {
        const wrap = el('span', 'fw-status-value');
        wrap.append(code(status));
        if (explanations[status]) wrap.append(el('span', 'fw-muted', explanations[status]));
        return wrap;
    }

    function addFact(dl, term, value) {
        const dd = el('dd');
        if (value instanceof Node) dd.append(value);
        else dd.textContent = value;
        dl.append(el('dt', null, term), dd);
    }

    function cell(content) {
        const td = el('td');
        if (content instanceof Node) td.append(content);
        else td.textContent = content;
        return td;
    }

    function code(text) {
        return el('code', 'fw-code-inline', text);
    }

    function time(ms) {
        return new Date(ms).toLocaleTimeString('en-GB');
    }

    function duration(ms) {
        return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    global.CheckoutActivity = { init, open, startRun, record };
})(window);
