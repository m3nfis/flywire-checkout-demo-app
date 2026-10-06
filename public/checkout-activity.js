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

    const t = (key, vars) => global.I18n.t(key, vars);

    const SESSION_STATUS = ['ACTIVE', 'PARTIALLY_COMPLETED', 'COMPLETED', 'ARCHIVED'];
    const PAYMENT_STATUS = ['NO_PAYMENTS', 'SOME_IN_PROGRESS', 'ALL_UNSUCCESSFUL', 'FULLY_PAID', 'PARTIALLY_PAID', 'OVERPAID'];

    function sessionStatusText(status) {
        const key = `activity.sessionStatusText.${status}`;
        return global.I18n.has(key) ? t(key) : '';
    }

    function paymentStatusText(status, held) {
        if (held && status === 'SOME_IN_PROGRESS') return t('activity.paymentStatusText.SOME_IN_PROGRESS_HOLD');
        const key = `activity.paymentStatusText.${status}`;
        return global.I18n.has(key) ? t(key) : '';
    }

    function statusLabel(status) {
        const key = `activity.status.${status}`;
        return global.I18n.has(key) ? t(key) : status;
    }

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
        btn.textContent = t('activity.refreshing');
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
                el('p', 'fw-activity-empty-title', t('activity.emptyTitle')),
                el('p', 'fw-help', t('activity.emptyBody'))
            );
            body.replaceChildren(empty);
            return;
        }

        const [latest, ...previous] = runs;
        const children = [renderStatus(latest), renderOutcome(latest), renderTimeline(latest, true)];
        if (previous.length) {
            children.push(el('h3', 'fw-section-title fw-activity-previous', t('activity.earlierRuns')));
            previous.forEach((run) => children.push(renderTimeline(run, false)));
        }
        body.replaceChildren(...children.filter(Boolean));
    }

    function renderStatus(run) {
        const card = el('section', 'fw-activity-status');
        const top = el('div', 'fw-activity-status-top');
        top.append(pill(run.status), el('span', 'fw-muted', t('activity.runMeta', { n: run.number, time: time(run.startedAt) })));

        const facts = el('dl', 'fw-facts');
        addFact(facts, t('activity.flow'), run.meta.flow);
        addFact(facts, t('activity.transaction'), run.meta.transaction);
        addFact(facts, t('activity.amount'), run.meta.amount);
        addFact(facts, t('activity.session'), run.meta.session === 'authenticated'
            ? (run.sessionId ? code(run.sessionId) : t('activity.authenticatedCreating'))
            : t('activity.anonymous'));
        addFact(facts, t('activity.display'), run.meta.display);
        if (run.endedAt) addFact(facts, t('activity.timeInCheckout'), duration(run.endedAt - run.startedAt));
        if (run.errors) addFact(facts, t('activity.onErrorCalls'), String(run.errors));

        card.append(top, facts);
        return card;
    }

    function renderOutcome(run) {
        if (!run.reason) return null;

        const card = el('section', 'fw-activity-outcome');
        card.append(el('h3', 'fw-section-title', t('activity.outcome')));

        const facts = el('dl', 'fw-facts');
        addFact(facts, t('activity.onEndReason'), code(`'${run.reason}'`));

        const session = run.report?.session_report;
        const payment = run.report?.payment_report;
        if (session?.status) addFact(facts, t('activity.sessionStatus'), statusValue(session.status, sessionStatusText(session.status)));
        if (payment?.status) {
            const held = run.meta.transaction?.includes('preauth') && payment.status === 'SOME_IN_PROGRESS';
            addFact(facts, t('activity.paymentStatus'), statusValue(payment.status, paymentStatusText(payment.status, held)));
        }
        if (payment?.amount !== undefined) addFact(facts, t('activity.reportedAmount'), reportedAmount(payment));
        if (run.reason === 'completed' && !run.report) {
            addFact(facts, t('activity.report'), t('activity.reportPending'));
        }
        card.append(facts);

        const payments = payment?.payment_watchlist || [];
        if (payments.length) {
            const showExpiry = payments.some((p) => global.CardBrands.expiry(p));
            const table = el('table', 'fw-activity-table');
            const head = el('tr');
            [t('activity.paymentId'), t('activity.method'), t('activity.card'), ...(showExpiry ? [t('activity.expires')] : [])].forEach((h) => head.append(el('th', null, h)));
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
            card.append(el('p', 'fw-help', t('activity.canceledHelp')));
        } else if (run.reason === 'timeout') {
            card.append(el('p', 'fw-help', t('activity.timeoutHelp')));
        } else if (run.sessionId) {
            const actions = el('div', 'fw-activity-actions');
            const refresh = el('button', 'fw-btn fw-btn-secondary', t('activity.refresh'));
            refresh.type = 'button';
            refresh.id = 'activity-refresh';
            refresh.addEventListener('click', () => refreshStatus(run));
            actions.append(refresh, el('span', 'fw-help', t('activity.refreshHelp')));
            card.append(actions);
        } else {
            card.append(el('p', 'fw-help', t('activity.anonymousReport')));
        }
        return card;
    }

    function renderTimeline(run, expanded) {
        const wrap = el('details', 'fw-activity-run');
        wrap.open = expanded;
        const summary = el('summary', 'fw-activity-run-summary');
        summary.append(
            el('span', null, expanded ? t('activity.timeline') : t('activity.runSummary', { n: run.number, flow: run.meta.flow })),
            el('span', 'fw-muted', expanded
                ? t('activity.events', { count: run.events.length })
                : t('activity.runSummaryStatus', { status: statusLabel(run.status), time: time(run.startedAt) }))
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
        head.append(el('span', 'fw-timeline-title', title), el('span', 'fw-timeline-time', t('activity.elapsed', { elapsed: duration(event.at - run.startedAt) })));
        item.append(head);
        if (text) item.append(el('p', 'fw-timeline-text', text));
        if (data !== undefined) {
            const details = el('details', 'fw-timeline-data');
            details.open = expandedData.has(key);
            details.addEventListener('toggle', () => {
                if (details.open) expandedData.add(key);
                else expandedData.delete(key);
            });
            details.append(el('summary', null, t('activity.showData')));
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
                return { title: t('activity.events.requested'), text: `${detail.flow} · ${detail.amount} · ${detail.display}`, tone: 'neutral' };
            case 'session_created':
                return {
                    title: t('activity.events.sessionCreated'),
                    text: t('activity.events.sessionCreatedText'),
                    tone: 'info',
                    data: detail.session,
                };
            case 'session_resumed':
                return {
                    title: t('activity.events.sessionResumed'),
                    text: t('activity.events.sessionResumedText'),
                    tone: 'info',
                    data: detail.session,
                };
            case 'start':
                return { title: t('activity.events.startTitle'), text: t('activity.events.startText'), tone: 'info', data: detail.initFields };
            case 'on_error':
                return {
                    title: t('activity.events.onErrorTitle', { type: detail.type }),
                    text: typeof detail.payload === 'string' ? detail.payload : t('activity.events.onErrorRetry'),
                    tone: 'warn',
                    data: detail.payload,
                };
            case 'on_end':
                return {
                    title: t('activity.events.onEndTitle', { reason: detail.reason }),
                    text: detail.payload
                        ? t('activity.events.onEndPayload')
                        : detail.reason === 'completed'
                            ? t('activity.events.onEndNoPayload')
                            : null,
                    tone: detail.reason === 'completed' ? 'success' : detail.reason === 'timeout' ? 'warn' : 'neutral',
                    data: detail.payload,
                };
            case 'session_report': {
                const s = detail.report?.session_report?.status;
                const p = detail.report?.payment_report?.status;
                return {
                    title: detail.manual ? t('activity.events.refreshed') : t('activity.events.outcomeFromServer'),
                    text: [`GET /commercial_payex/v2/session/{id}`, s && `session ${s}`, p && `payment ${p}`].filter(Boolean).join(' · '),
                    tone: p === 'ALL_UNSUCCESSFUL' ? 'error' : 'success',
                    data: detail.report,
                };
            }
            case 'session_report_failed':
                return { title: t('activity.events.lookupFailed'), text: detail.error, tone: 'error' };
            case 'launch_failed':
                return { title: t('activity.events.launchFailed'), text: detail.error, tone: 'error' };
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
            btn.textContent = t('common.copied');
        } catch {
            btn.textContent = t('common.copyFailed');
        }
        setTimeout(() => { btn.textContent = t('activity.copyLog'); }, 1500);
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
        wrap.append(el('span', null, formatted), el('span', 'fw-muted', t('activity.subunits', { amount, currency: currency || '' }).trim()));
        return wrap;
    }

    function pill(status) {
        return el('span', `fw-status fw-status-${status}`, statusLabel(status));
    }

    function statusValue(status, explanation) {
        const wrap = el('span', 'fw-status-value');
        wrap.append(code(status));
        if (explanation) wrap.append(el('span', 'fw-muted', explanation));
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
