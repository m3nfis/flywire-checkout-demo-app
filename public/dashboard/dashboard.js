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
    const t = (key, vars) => I18n.t(key, vars);
    const PLAYGROUND = 'https://checkout.demo.flywire.com/playground/authenticated_sessions/';
    const DEFAULT_API_BASE = 'https://api-platform.demo.flywire.com';
    const SESSION_API = '/commercial_payex/v2/session';
    const PREVIEW_LANG_KEY = 'caldera.dashboard.previewLang';

    const CHARGE_PRESETS = [
        'dashboard.charges.minibar',
        'dashboard.charges.spa',
        'dashboard.charges.lateCheckout',
        'dashboard.charges.transfer',
        'dashboard.charges.dive',
        'dashboard.charges.noShow',
    ];

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
        await I18n.ready;
        serverConfig = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
        const host = (serverConfig.api_base || DEFAULT_API_BASE).replace(/^https?:\/\//, '');
        const intro = $('db-connection-intro');
        if (intro) intro.innerHTML = t('dashboard.connectionIntro', { host });
        initCredentials();
        $('db-clear-bookings').addEventListener('click', () => {
            if (!Bookings.list().length || !confirm(t('dashboard.confirmClearBookings'))) return;
            Bookings.clear();
        });
        window.addEventListener('hashchange', () => {
            if (location.hash.slice(1) === CREDENTIALS_HASH) focusCredentials();
            else select(hashBooking());
        });
        Bookings.onChange(render);
        DemoCredentials.onChange(() => {
            renderSavedClients();
            if (!document.activeElement?.closest('#credentials')) fillCredentials();
        });
        render();
        DemoCredentials.renderBanners();
        DemoMoney.onChange(() => {
            renderRecipientCurrency();
            render();
        });
        if (location.hash.slice(1) === CREDENTIALS_HASH || !DemoCredentials.isComplete()) focusCredentials();
        testConnection();
        DemoMoney.refresh();
    });

    // ── Credentials ──

    function initCredentials() {
        const fields = [
            ['db-client-id', 'client_id', 'id'],
            ['db-code', 'code', 'code'],
            ['db-api-key', 'api_key', 'key'],
        ];
        fillCredentials();
        renderSavedClients();

        fields.forEach(([id, , kind]) => {
            const input = $(id);
            const commitIfIdentity = () => {
                cleanInput(input, kind);
                if (kind === 'id' || kind === 'code') commitRecipientIdentity();
            };
            input.addEventListener('paste', () => setTimeout(commitIfIdentity, 0));
            input.addEventListener('blur', commitIfIdentity);
        });

        $('db-credentials-form').addEventListener('submit', (e) => {
            e.preventDefault();
            fields.forEach(([id, , kind]) => cleanInput($(id), kind));
            commitRecipientIdentity({ includeConnection: true });
            testConnection({ persist: true });
        });

        $('db-client-id').addEventListener('input', () => {
            renderCodeOptions();
            commitRecipientIdentity();
        });
        $('db-code').addEventListener('input', () => commitRecipientIdentity());
        $('db-code-toggle').addEventListener('click', () => {
            const menu = $('db-code-menu');
            if (!menu || $('db-code-toggle').hidden) return;
            const open = menu.hidden;
            menu.hidden = !open;
            $('db-code-toggle').setAttribute('aria-expanded', String(open));
            if (open) menu.querySelector('[role="option"]')?.focus();
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.db-codebox')) closeCodeMenu();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeCodeMenu();
        });

        $('db-saved-open').addEventListener('click', openSavedDrawer);
        document.querySelectorAll('[data-saved-close]').forEach((el) => el.addEventListener('click', closeSavedDrawer));
        $('db-saved-drawer').addEventListener('keydown', onSavedDrawerKeydown);

        $('db-credentials-reset').addEventListener('click', () => {
            if (!confirm(t('dashboard.confirmClearCredentials'))) return;
            DemoCredentials.clear();
            fillCredentials();
            renderSavedClients();
            fixNotes.clear();
            $('db-credentials-fixes').hidden = true;
            testConnection();
        });

        $('db-api-key-toggle').addEventListener('click', (e) => {
            const input = $('db-api-key');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            e.currentTarget.textContent = show ? t('common.hide') : t('common.show');
            e.currentTarget.setAttribute('aria-pressed', String(show));
        });

        $('db-recipient-fields-add').addEventListener('click', () => {
            $('db-recipient-fields-rows').append(recipientFieldRow({ key: '', value: '' }));
            $('db-recipient-fields-rows').lastElementChild?.querySelector('input')?.focus();
        });
    }

    function fillCredentials() {
        const saved = DemoCredentials.get();
        $('db-client-name').value = saved.client_name;
        $('db-client-id').value = saved.client_id;
        $('db-client-id').placeholder = t('dashboard.clientIdPlaceholder');
        $('db-code').value = saved.code;
        $('db-code').placeholder = t('dashboard.recipientCodePlaceholder');
        $('db-api-key').value = saved.api_key;
        $('db-api-key').placeholder = t('dashboard.apiKeyPlaceholder');
        renderRecipientFields();
        renderSavedClients();
    }

    let loadedIdentity = { client_id: '', code: '' };

    function identityKey(clientId, code) {
        return `${String(clientId || '').trim().toLowerCase()}|${String(code || '').trim().toUpperCase()}`;
    }

    function recipientFieldRows() {
        return [...document.querySelectorAll('#db-recipient-fields-rows .db-field-row')].map((row) => ({
            key: row.querySelector('.db-field-key').value,
            value: row.querySelector('.db-field-value').value,
        }));
    }

    function persistRecipientFields() {
        DemoCredentials.saveFields(loadedIdentity.client_id, loadedIdentity.code, recipientFieldRows());
        updateRecipientFieldsCount();
    }

    /**
     * Point the active connection at the Client ID and recipient code in the form,
     * then show the field set stored for that pair. Rows already on screen stay
     * with the pair they were loaded for.
     */
    function commitRecipientIdentity({ includeConnection = false } = {}) {
        const clientId = $('db-client-id').value.trim();
        const code = $('db-code').value.trim();
        const same = identityKey(clientId, code) === identityKey(loadedIdentity.client_id, loadedIdentity.code);
        if (same && !includeConnection) return;
        // A half-typed code stays on screen. Don't retarget the field set until the pair is real.
        if (!includeConnection && (!UUID.test(clientId) || !PORTAL_CODE.test(code))) return;
        const rows = recipientFieldRows();
        const hasRows = rows.some((row) => row.key.trim());
        const previousHadTuple = Boolean(String(loadedIdentity.client_id).trim() && String(loadedIdentity.code).trim());
        const payload = { client_id: clientId, code };
        if (includeConnection) {
            payload.client_name = $('db-client-name').value.trim();
            payload.api_key = $('db-api-key').value;
        }
        if (!same && !previousHadTuple && hasRows) payload.fields = rows;
        DemoCredentials.set(payload);
        if (!same) renderRecipientFields();
    }

    function updateRecipientFieldsCount() {
        const count = $('db-recipient-fields-count');
        if (!count) return;
        const filled = Object.keys(DemoCredentials.fieldMap() || {}).length;
        count.hidden = filled === 0;
        count.textContent = String(filled);
    }

    function renderRecipientFields() {
        const rows = $('db-recipient-fields-rows');
        if (!rows) return;
        const saved = DemoCredentials.get();
        loadedIdentity = { client_id: saved.client_id, code: saved.code };
        const items = saved.fields.length ? saved.fields : [{ key: '', value: '' }];
        rows.replaceChildren(...items.map((item) => recipientFieldRow(item)));
        updateRecipientFieldsCount();
    }

    function recipientFieldRow(item) {
        const key = h('input', {
            type: 'text',
            class: 'db-field-key',
            value: item.key || '',
            spellcheck: 'false',
            autocomplete: 'off',
            placeholder: t('dashboard.fieldKeyPlaceholder'),
            'aria-label': t('dashboard.fieldKey'),
        });
        const value = h('input', {
            type: 'text',
            class: 'db-field-value',
            value: item.value || '',
            spellcheck: 'false',
            autocomplete: 'off',
            placeholder: t('dashboard.fieldValuePlaceholder'),
            'aria-label': t('dashboard.fieldValue'),
        });
        key.addEventListener('input', persistRecipientFields);
        value.addEventListener('input', persistRecipientFields);
        const remove = h('button', {
            type: 'button',
            class: 'db-icon-btn db-field-remove',
            'aria-label': t('dashboard.removeField'),
        });
        remove.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"/></svg>';
        remove.addEventListener('click', () => {
            const list = $('db-recipient-fields-rows');
            remove.closest('.db-field-row').remove();
            if (!list.children.length) list.append(recipientFieldRow({ key: '', value: '' }));
            persistRecipientFields();
        });
        return h('div', { class: 'db-field-row' }, key, value, remove);
    }

    let savedDrawerFocus = null;

    function renderSavedClients() {
        const clients = DemoCredentials.list();
        const count = $('db-saved-count');
        const openBtn = $('db-saved-open');
        if (count) {
            count.hidden = clients.length === 0;
            count.textContent = String(clients.length);
        }
        if (openBtn) {
            openBtn.setAttribute('aria-label', clients.length ? t('dashboard.savedClientsCount', { count: clients.length }) : t('dashboard.savedClients'));
        }
        const list = $('db-saved-list');
        if (list) {
            const activeId = (DemoCredentials.get().client_id || '').toLowerCase();
            const cards = clients.map((item) => savedClientCard(item, item.client_id.toLowerCase() === activeId));
            list.replaceChildren(...(cards.length
                ? cards
                : [h('p', { class: 'db-muted' }, t('dashboard.saved.empty'))]));
        }
        renderCodeOptions();
    }

    function savedClientCard(item, active) {
        const load = h('button', { type: 'button', class: 'db-btn db-btn-secondary db-btn-sm' }, t('dashboard.saved.load'));
        load.addEventListener('click', () => loadClient(item.client_id));
        const codes = item.codes.length
            ? h('div', { class: 'db-saved-codes' }, ...item.codes.map((code) => {
                const chip = h('button', { type: 'button', class: 'db-code-chip' }, code);
                chip.addEventListener('click', () => loadClient(item.client_id, code));
                return chip;
            }))
            : h('span', { class: 'db-muted' }, t('dashboard.saved.noneYet'));
        return h('article', { class: active ? 'db-saved-card db-saved-card-active' : 'db-saved-card' },
            h('div', { class: 'db-saved-card-head' },
                h('div', {},
                    h('h3', {}, item.client_name || t('dashboard.saved.unnamed')),
                    active ? h('span', { class: 'db-pill db-pill-success' }, t('dashboard.saved.inUse')) : null,
                ),
                load,
            ),
            h('dl', {},
                h('dt', {}, t('dashboard.saved.clientId')),
                h('dd', {}, item.client_id),
                h('dt', {}, t('dashboard.saved.apiKey')),
                h('dd', {}, DemoCredentials.mask(item.api_key)),
                h('dt', {}, t('dashboard.saved.recipientCodes')),
                h('dd', {}, codes),
            ),
        );
    }

    function openSavedDrawer() {
        const drawer = $('db-saved-drawer');
        savedDrawerFocus = document.activeElement;
        renderSavedClients();
        drawer.hidden = false;
        requestAnimationFrame(() => drawer.classList.add('open'));
        $('db-saved-open').setAttribute('aria-expanded', 'true');
        document.body.classList.add('db-drawer-locked');
        $('db-saved-title').focus();
    }

    function closeSavedDrawer() {
        const drawer = $('db-saved-drawer');
        if (!drawer || drawer.hidden) return;
        drawer.classList.remove('open');
        $('db-saved-open').setAttribute('aria-expanded', 'false');
        document.body.classList.remove('db-drawer-locked');
        setTimeout(() => { drawer.hidden = true; }, 250);
        savedDrawerFocus?.focus();
    }

    function onSavedDrawerKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSavedDrawer();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusable = [...$('db-saved-drawer').querySelectorAll('button:not(:disabled), [tabindex="0"]')]
            .filter((el) => el.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function closeCodeMenu() {
        const menu = $('db-code-menu');
        const toggle = $('db-code-toggle');
        if (!menu) return;
        menu.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
    }

    function renderCodeOptions() {
        const menu = $('db-code-menu');
        const toggle = $('db-code-toggle');
        if (!menu || !toggle) return;
        const current = ($('db-code').value || '').trim().toUpperCase();
        const codes = DemoCredentials.codesFor($('db-client-id').value);
        menu.replaceChildren(...codes.map((code) => {
            const item = h('li', {
                role: 'option',
                tabindex: '0',
                'aria-selected': String(code === current),
            }, code);
            const choose = () => {
                $('db-code').value = code;
                closeCodeMenu();
                commitRecipientIdentity();
                $('db-code').focus();
            };
            item.addEventListener('mousedown', (e) => { e.preventDefault(); choose(); });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
            });
            return item;
        }));
        toggle.hidden = codes.length === 0;
        if (!codes.length) closeCodeMenu();
    }

    function loadClient(clientId, code) {
        const item = DemoCredentials.find(clientId);
        if (!item) return;
        code = code || item.codes[item.codes.length - 1] || '';
        closeSavedDrawer();
        $('db-client-name').value = item.client_name || '';
        $('db-client-id').value = item.client_id;
        $('db-code').value = code;
        $('db-api-key').value = item.api_key;
        DemoCredentials.set({
            client_id: item.client_id,
            client_name: item.client_name || '',
            code,
            api_key: item.api_key,
        });
        renderRecipientFields();
        renderSavedClients();
        testConnection({ persist: true });
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
        if (client_id && !UUID.test(client_id)) warnings.push(t('dashboard.clientIdFormat'));
        if (code && !PORTAL_CODE.test(code)) warnings.push(t('dashboard.recipientFormat'));
        return warnings;
    }

    const fixNotes = new Map();

    function cleanInput(input, kind) {
        const { value, fixes } = DemoCredentials.clean(input.value, { kind });
        if (value === input.value) return;
        input.value = value;
        const label = { id: t('dashboard.clientId'), code: t('dashboard.recipientCode'), key: t('dashboard.apiKey') }[kind];
        const fixText = fixes.map((key) => t(key)).join(', ');
        fixNotes.set(kind, t('dashboard.cleanedField', { label, fixes: fixText }));
        const notice = $('db-credentials-fixes');
        notice.textContent = t('dashboard.cleanedPaste', { fixes: [...fixNotes.values()].join(' ') });
        notice.hidden = false;
    }

    async function testConnection({ persist = false } = {}) {
        const pill = $('db-connection-status');
        const result = $('db-credentials-result');
        const missing = DemoCredentials.missing();
        const warnings = formatWarnings();

        if (!DemoCredentials.get().api_key) {
            setPill(pill, 'warn', t('dashboard.status.notSet'));
            renderRecipientCurrency();
            if (warnings.length) showNotice(result, 'error', warnings.join(' '));
            else result.hidden = true;
            return;
        }

        setPill(pill, 'neutral', t('dashboard.status.checking'));
        try {
            const check = await fetch('/api/credentials/check').then((r) => r.json());
            if (!check.ok) {
                setPill(pill, 'error', t('dashboard.status.keyRejected'));
                showNotice(result, 'error', t('dashboard.keyRejectedDetail', { detail: check.detail }));
                return;
            }
            if (missing.length) {
                setPill(pill, 'warn', t('dashboard.status.incomplete'));
                showNotice(result, 'error', t('dashboard.keyWorksMissing', { missing: missing.join(', ') }));
            } else if (warnings.length) {
                setPill(pill, 'warn', t('dashboard.status.checkFields'));
                showNotice(result, 'error', warnings.join(' '));
            } else {
                setPill(pill, 'success', t('dashboard.status.connected'));
                const saved = DemoCredentials.get();
                if (persist && saved.client_id && saved.api_key) {
                    DemoCredentials.remember(saved);
                    renderSavedClients();
                }
                const named = saved.client_name ? `${saved.client_name} · ` : '';
                const stored = persist
                    ? t('dashboard.savedInBrowser', {
                        name: named,
                        id: saved.client_id,
                        code: saved.code ? ` / ${saved.code}` : '',
                    })
                    : '';
                showNotice(result, 'info', `${check.detail || t('dashboard.demoKeyAccepted')}${stored}`);
            }
        } catch {
            setPill(pill, 'error', t('dashboard.status.unreachable'));
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
            ? t('stay.booking', { count: bookings.length })
            : '';
        $('db-clear-bookings').hidden = !bookings.length;
        renderList(bookings);
        renderDetail(bookings.find((b) => b.id === selectedId));
    }

    function renderList(bookings) {
        const container = $('db-bookings-list');
        if (!bookings.length) {
            container.replaceChildren(h('div', { class: 'db-empty' },
                h('p', { class: 'db-empty-title' }, t('dashboard.emptyTitle')),
                h('p', { class: 'db-muted' }, t('dashboard.emptyBody')),
                h('a', { href: '/', class: 'db-btn db-btn-primary' }, t('dashboard.emptyAction'))
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
                h('td', {}, stayRange(b), h('span', { class: 'db-sub' }, t('stay.nightShort', { count: b.nights }))),
                h('td', { class: 'db-num' }, b.amount ? money(b.amount, b.currency) : '—'),
                h('td', {}, pill(status.tone, status.label))
            );
        });

        container.replaceChildren(h('div', { class: 'db-table-wrap' }, h('table', { class: 'db-table' },
            h('thead', {}, h('tr', {}, ...[
                t('dashboard.colBooking'),
                t('dashboard.colGuest'),
                t('dashboard.colStay'),
                t('dashboard.colAmount'),
                t('dashboard.colStatus'),
            ].map((label, i) => h('th', { class: i === 3 ? 'db-num' : '' }, label)))),
            h('tbody', {}, ...rows)
        )));
    }

    function statusOf(b) {
        const payment = b.report?.payment_report?.status;
        const tokenization = b.report?.tokenization_report?.status;
        const captured = sum(b.captures);
        switch (b.checkoutStatus) {
            case 'failed': return { tone: 'error', label: t('dashboard.bookingStatus.failed') };
            case 'canceled': return { tone: 'neutral', label: t('dashboard.bookingStatus.abandoned') };
            case 'timeout': return { tone: 'warn', label: t('dashboard.bookingStatus.timedOut') };
            case 'started': return { tone: 'info', label: t('dashboard.bookingStatus.inCheckout') };
        }
        if (payment === 'ALL_UNSUCCESSFUL') return { tone: 'error', label: t('dashboard.bookingStatus.declined') };
        if (b.flow?.preauth && captured) {
            return captured >= (b.authorizedAmount || b.amount)
                ? { tone: 'success', label: t('dashboard.bookingStatus.captured') }
                : { tone: 'success', label: t('dashboard.bookingStatus.partlyCaptured') };
        }
        if (b.flow?.preauth && payment && payment !== 'NO_PAYMENTS') return { tone: 'info', label: t('dashboard.bookingStatus.authorized') };
        if (payment === 'SOME_IN_PROGRESS') return { tone: 'warn', label: t('dashboard.bookingStatus.processing') };
        if (payment === 'FULLY_PAID') return { tone: 'success', label: t('dashboard.bookingStatus.paid') };
        if (tokenization === 'SUCCESS' || b.token) return { tone: 'success', label: t('dashboard.bookingStatus.cardSaved') };
        return { tone: 'success', label: t('dashboard.bookingStatus.completed') };
    }

    // ── Booking detail ──

    function renderDetail(b) {
        const panel = $('db-detail');
        if (!b) {
            panel.replaceChildren(h('p', { class: 'db-muted db-detail-empty' }, t('dashboard.selectBooking')));
            return;
        }

        const status = statusOf(b);
        const report = b.report || {};
        const captured = sum(b.captures);
        const charged = sum(b.charges);

        const facts = h('dl', { class: 'db-facts' });
        addFact(facts, t('dashboard.factGuest'), h('span', {}, b.guest?.name || t('common.dash'), b.guest?.email ? h('span', { class: 'db-sub' }, b.guest.email) : null));
        addFact(facts, t('dashboard.factStay'), h('span', {}, b.room || t('common.dash'), h('span', { class: 'db-sub' }, `${stayRange(b)} · ${b.guests || ''}`)));
        addFact(facts, t('dashboard.factCheckout'), h('span', {}, flowTitle(b), h('span', { class: 'db-sub' }, flowTech(b))));
        addFact(facts, t('dashboard.factTotal'), b.amount ? money(b.amount, b.currency) : t('booking.noAmount'));
        if (b.flow?.preauth) {
            addFact(facts, t('dashboard.factAuthorized'), money(b.authorizedAmount || b.amount, b.currency));
            addFact(facts, t('dashboard.factCaptured'), money(captured, b.currency));
        }
        if (charged) addFact(facts, t('dashboard.factCharged'), money(charged, b.currency));
        addFact(facts, t('dashboard.factSession'), b.sessionId ? h('code', {}, b.sessionId) : t('dashboard.anonymousSession'));
        if (report.session_report?.status) addFact(facts, t('dashboard.factSessionStatus'), h('code', {}, report.session_report.status));
        if (report.payment_report?.status) {
            addFact(facts, t('dashboard.factPaymentStatus'), h('span', {}, h('code', {}, report.payment_report.status),
                h('span', { class: 'db-sub' }, paymentStatusText(b, report.payment_report.status))));
        }
        if (report.tokenization_report?.status) addFact(facts, t('dashboard.factTokenization'), h('code', {}, report.tokenization_report.status));
        if (b.reportedAt) addFact(facts, t('dashboard.factLastChecked'), timeAgo(b.reportedAt));

        panel.replaceChildren(...[
            h('div', { class: 'db-detail-head' },
                h('div', {}, h('h2', {}, b.id), h('p', { class: 'db-muted' }, t('dashboard.created', { when: new Date(b.createdAt).toLocaleString(I18n.locale) }))),
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
                    onclick: () => { if (confirm(t('dashboard.confirmDeleteBooking', { id: b.id }))) Bookings.remove(b.id); },
                }, t('dashboard.deleteBooking'))
            ),
        ].filter(Boolean));
    }

    function paymentStatusText(b, status) {
        if (b.flow?.preauth && status === 'SOME_IN_PROGRESS') {
            return b.captures?.length
                ? t('dashboard.holdCaptureSent')
                : t('dashboard.holdPending');
        }
        const key = `dashboard.paymentStatusText.${status}`;
        return I18n.has(key) ? t(key) : '';
    }

    function flowTitle(b) {
        if (b.flow?.id && I18n.has(`flows.${b.flow.id}.title`)) return t(`flows.${b.flow.id}.title`);
        return b.flow?.title || t('common.dash');
    }

    function renderPayments(b) {
        if (!b.payments?.length) return null;
        return h('div', { class: 'db-block' },
            h('h3', {}, t('dashboard.payments')),
            h('div', { class: 'db-table-wrap' }, h('table', { class: 'db-table db-table-compact' },
                h('thead', {}, h('tr', {}, h('th', {}, t('dashboard.colPaymentId')), h('th', {}, t('dashboard.colMethod')), h('th', { class: 'db-num' }, t('dashboard.colCaptured')))),
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
                    info ? h('span', { class: 'db-sub' }, t('dashboard.guestPaid', { amount: money(info.amount, info.currency) })) : null),
                h('td', {}, status ? pill(status === 'success' ? 'success' : status === 'pending' ? 'warn' : 'error', status) : '—')
            );
        });
        return h('div', { class: 'db-block' },
            h('h3', {}, t('dashboard.chargesTitle')),
            h('div', { class: 'db-table-wrap' }, h('table', { class: 'db-table db-table-compact' },
                h('thead', {}, h('tr', {}, h('th', {}, t('dashboard.colWhatFor')), h('th', {}, t('dashboard.colFlywirePayment')), h('th', { class: 'db-num' }, t('dashboard.colAmount')), h('th', {}, t('dashboard.colResult')))),
                h('tbody', {}, ...rows)
            )),
            h('p', { class: 'db-sub db-table-note' }, t('dashboard.chargesNote'))
        );
    }

    function renderToken(b) {
        if (!b.token) return null;
        const facts = h('dl', { class: 'db-facts db-facts-compact' });
        const card = b.report?.tokenization_report;
        if (card?.brand || card?.last_four) {
            addFact(facts, t('dashboard.factCard'), CardBrands.describe({ payment_method: 'credit_card', ...card }));
        } else if (card?.type) {
            addFact(facts, t('dashboard.factMethod'), card.type);
        }
        addFact(facts, t('dashboard.paymentMethodToken'), h('code', {}, b.token.payment_method_token || t('common.dash')));
        addFact(facts, t('dashboard.mandateId'), h('code', {}, b.token.mandate_id || t('common.dash')));
        addFact(facts, t('dashboard.payorId'), h('code', {}, b.token.payor_id || t('common.dash')));
        return h('div', { class: 'db-block' }, h('h3', {}, t('dashboard.savedCard')), facts);
    }

    // ── Actions ──

    function actionsFor(b) {
        const hasPayment = b.payments?.length > 0;
        const noSession = b.sessionId ? null : {
            reason: t('dashboard.action.noSessionReason'),
            fix: t('dashboard.action.noSessionFix'),
        };
        const notPreauth = b.flow?.preauth ? null : {
            reason: t('dashboard.action.notHoldReason', {
                flow: flowTitle(b),
                how: b.flow?.type === 'tokenization' && !b.amount
                    ? t('dashboard.action.savedOnly')
                    : t('dashboard.action.chargedImmediately'),
            }),
            fix: t('dashboard.action.notHoldFix'),
        };
        const noPayment = hasPayment ? null : {
            reason: t('dashboard.action.noPaymentReason'),
            fix: b.sessionId ? t('dashboard.action.noPaymentFixRefresh') : t('dashboard.action.noPaymentFixGuest'),
        };
        // A hold is captured once; whatever isn't captured is released to the guest.
        const captured = sum(b.captures);
        const holdEnded = captured ? {
            reason: t('dashboard.action.holdEndedReason', {
                amount: money(captured, b.currency),
                when: new Date(b.captures[0].at).toLocaleString(I18n.locale),
            }),
            fix: b.token ? t('dashboard.action.holdEndedFixCard') : t('dashboard.action.holdEndedFixNew'),
        } : null;
        const savesCard = b.flow?.type !== 'payment' || b.token;

        return [
            {
                id: 'refresh', label: t('dashboard.action.refresh'), method: 'GET', endpoint: '/commercial_payex/v2/session/{session_id}', playground: 'get_session',
                help: t('dashboard.action.refreshHelp'),
                disabled: noSession, spec: refreshSpec,
            },
            {
                id: 'resume', label: t('dashboard.action.resume'), method: 'POST', endpoint: '/commercial_payex/v2/session/{session_id}', playground: 'resume_session',
                help: t('dashboard.action.resumeHelp'),
                disabled: noSession || (b.checkout ? null : { reason: t('dashboard.action.resumeOldReason'), fix: t('dashboard.action.resumeOldFix') }),
                spec: resumeSpec,
            },
            {
                id: 'capture', label: t('dashboard.action.capture'), method: 'POST', endpoint: '/payments/v1/payments/{payment_id}/captures', playground: 'capture_payment',
                help: t('dashboard.action.captureHelp'),
                disabled: notPreauth || noPayment || holdEnded, spec: captureSpec,
            },
            {
                id: 'extend', label: t('dashboard.action.extend'), method: 'POST', endpoint: '/payments/v1/payments/{payment_id}/authorization_adjustments', playground: 'extend_preauth',
                help: t('dashboard.action.extendHelp'),
                disabled: notPreauth || noPayment || holdEnded, spec: extendSpec,
            },
            {
                id: 'charge', label: t('dashboard.action.charge'), method: 'POST', endpoint: '/payments/v1/payments/charge', playground: 'charge_token',
                help: t('dashboard.action.chargeHelp'),
                disabled: savesCard ? null : {
                    reason: t('dashboard.action.noCardReason'),
                    fix: t('dashboard.action.noCardFix'),
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
        }, h('span', { class: `db-method db-method-${a.method.toLowerCase()}` }, a.method), busyAction === a.id ? t('dashboard.working') : a.label)));

        const active = actions.find((a) => a.id === openAction);

        return h('div', { class: 'db-block' },
            h('div', { class: 'db-block-head' },
                h('h3', {}, t('dashboard.actionsTitle')),
                h('span', { class: 'db-sub' }, t('dashboard.actionsSubtitle'))
            ),
            buttons,
            active ? h('div', { class: 'db-action-panel' },
                h('div', { class: 'db-action-meta' },
                    h('div', { class: 'db-endpoint' },
                        h('span', { class: `db-method db-method-${active.method.toLowerCase()}` }, active.method),
                        h('code', {}, active.endpoint),
                        h('a', { href: PLAYGROUND + active.playground, target: '_blank', rel: 'noopener', class: 'db-btn db-btn-ghost db-btn-sm db-playground' }, t('dashboard.openPlayground'))
                    ),
                    h('p', {}, active.help)
                ),
                active.disabled
                    ? h('div', { class: 'db-notice db-notice-warn', role: 'status' },
                        h('strong', {}, t('dashboard.unavailableTitle', { label: active.label })), active.disabled.reason,
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
                record(b, result, req, result.ok ? (status ? t('dashboard.history.statusRefreshedWith', { status }) : t('dashboard.history.statusRefreshed')) : t('dashboard.history.statusFailed'), 'refresh');
            },
        };
    }

    function resumeSpec(b) {
        return {
            note: t('dashboard.resumeNote'),
            request: () => ({
                upstream: { method: 'POST', path: `${SESSION_API}/${b.sessionId}` },
                proxy: { method: 'POST', url: `/api/flywire-session/${b.sessionId}/resume` },
            }),
            onResult: (result, req) => {
                record(b, result, req, result.ok ? t('dashboard.history.resumed') : t('dashboard.history.resumeFailed'), 'resume');
                if (result.ok) reopenCheckout(b, result.data);
            },
        };
    }

    function captureSpec(b) {
        const remaining = Math.max(0, (b.authorizedAmount || b.amount) - sum(b.captures));
        const paymentSelect = paymentPicker(b, 'capture');
        const amount = amountInput(`${b.id}:capture:amount`, remaining, undefined, b.currency);
        return {
            fields: [paymentSelect.field, amount.field],
            request: () => paymentRequest(paymentSelect.value(), 'captures', { amount: amount.cents() }),
            onResult: (result, req) => {
                const cents = req.upstream.body.amount;
                record(b, result, req, t('dashboard.history.captured', { amount: money(cents, b.currency), status: resultStatus(result) }), 'capture', (x) => {
                    x.captures.push({ payment_id: req.paymentId, amount: cents, at: Date.now() });
                });
            },
        };
    }

    function extendSpec(b) {
        const current = b.authorizedAmount || b.amount;
        const paymentSelect = paymentPicker(b, 'extend');
        const amount = amountInput(`${b.id}:extend:amount`, current, current, b.currency);
        return {
            fields: [paymentSelect.field, amount.field],
            note: t('dashboard.extendMinimum', { amount: money(current, b.currency) }),
            request: () => paymentRequest(paymentSelect.value(), 'authorization_adjustments', { amount: amount.cents() }),
            onResult: (result, req) => {
                const cents = req.upstream.body.amount;
                const label = (cents > current
                    ? t('dashboard.history.holdRaised', { amount: money(cents, b.currency) })
                    : t('dashboard.history.holdExtended')) + resultStatus(result);
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
        const suggested = window.DemoMoney && b.currency === DemoMoney.code()
            ? DemoMoney.usdCentsToMinor(12000)
            : 12000;
        const amount = amountInput(`${b.id}:charge:amount`, suggested, undefined, b.currency);
        const description = remember(`${b.id}:charge:description`, h('select', {}, ...CHARGE_PRESETS.map((p) => h('option', { value: t(p) }, t(p)))));
        const reference = textInput(`${b.id}:charge:reference`, `${b.id}-${(b.charges?.length || 0) + 1}`);
        const token = b.token || {};
        const tokenInput = textInput(`${b.id}:charge:token`, token.payment_method_token);
        const mandateInput = textInput(`${b.id}:charge:mandate`, token.mandate_id);
        const payorInput = textInput(`${b.id}:charge:payor`, token.payor_id);
        const tokenFields = h('div', { class: 'db-token-fields' },
            h('p', { class: 'db-sub' }, b.token
                ? t('dashboard.tokenFromReport')
                : t('dashboard.tokenMissing')),
            field(t('dashboard.paymentMethodToken'), tokenInput),
            field(t('dashboard.mandateId'), mandateInput),
            field(t('dashboard.payorId'), payorInput)
        );
        const clean = (input) => DemoCredentials.clean(input.value, { kind: 'id' }).value;

        return {
            fields: [amount.field, field(t('dashboard.whatForOffice'), description), field(t('dashboard.externalReference'), reference), tokenFields],
            request: () => {
                const tokenData = {
                    payment_method_token: clean(tokenInput),
                    mandate_id: clean(mandateInput),
                    payor_id: clean(payorInput),
                };
                const externalReference = reference.value.trim();
                if (!externalReference) throw new Error(t('dashboard.needReference'));
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
                const label = t('dashboard.history.charged', {
                    amount: money(cents, b.currency),
                    what: description.value,
                    reference: externalReference,
                    status: chargeStatus && chargeStatus !== 'success' ? ` · ${chargeStatus}` : '',
                });
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
        const submitLabel = t('dashboard.sendRequest', { method: action.method });
        const submit = h('button', { type: 'submit', class: 'db-btn db-btn-primary', disabled: busy }, busy ? t('dashboard.sending') : submitLabel);
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
                submit.textContent = t('dashboard.sending');
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
        const tabs = h('div', { class: 'db-tabs', role: 'tablist', 'aria-label': t('dashboard.requestFormat') },
            ...[['curl', t('dashboard.curl')], ['fetch', t('dashboard.nodeFetch')]].map(([id, label]) => h('button', {
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
        const copy = h('button', { type: 'button', class: 'db-btn db-btn-ghost db-btn-sm', disabled: !upstream }, t('common.copy'));
        copy.addEventListener('click', () => copyText(copy, code));

        return [
            h('div', { class: 'db-request-head' }, h('span', { class: 'db-request-title' }, t('dashboard.requestTitle')), tabs, copy),
            upstream
                ? h('pre', { class: 'db-code' }, h('code', {}, code))
                : h('p', { class: 'db-notice db-notice-error' }, problem || t('dashboard.fillFields')),
            h('p', { class: 'db-sub' }, t('dashboard.requestFootnote')),
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
            button.textContent = t('common.copied');
        } catch {
            button.textContent = t('common.copyFailed');
        }
        setTimeout(() => { button.textContent = t('common.copy'); }, 1500);
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
            field: b.payments.length > 1 ? field(t('dashboard.payment'), select) : null,
            value: () => select.value || b.payments[0].payment_id,
        };
    }

    function amountInput(key, defaultCents, minCents, currency = 'USD') {
        const subunit = window.DemoMoney && currency === DemoMoney.code()
            ? (DemoMoney.currency().subunit_to_unit || 100)
            : 100;
        const digits = subunit === 1 ? 0 : 2;
        const major = (cents) => (cents / subunit).toFixed(digits);
        const input = remember(key, h('input', {
            type: 'number',
            step: digits === 0 ? '1' : '0.01',
            min: minCents ? major(minCents) : (digits === 0 ? '1' : '0.01'),
            value: major(defaultCents),
            inputmode: 'decimal',
        }));
        return {
            field: field(t('dashboard.amountLabel', { currency }), input),
            cents: () => {
                const cents = Math.round(Number(input.value) * subunit);
                if (!Number.isFinite(cents) || cents <= 0) throw new Error(t('dashboard.amountPositive'));
                if (minCents && cents < minCents) throw new Error(t('dashboard.amountMinimum', { amount: money(minCents, currency) }));
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
                    action: 'resume', ok: true, label: report?.payment_report?.status
                        ? t('dashboard.history.checkoutAfterResumeStatus', { status: report.payment_report.status })
                        : t('dashboard.history.checkoutAfterResume'),
                    response: report,
                }),
                onCancel: () => Bookings.addHistory(b.id, { action: 'resume', ok: true, label: t('dashboard.history.guestClosedAgain') }),
                onTimeout: () => Bookings.addHistory(b.id, { action: 'resume', ok: false, label: t('dashboard.history.checkoutTimedOut') }),
                onError: ({ type, payload }) => Bookings.addHistory(b.id, {
                    action: 'resume', ok: false, label: t('dashboard.history.onError', { type }), response: payload,
                }),
            });
        } catch (err) {
            Bookings.addHistory(b.id, { action: 'resume', ok: false, label: t('dashboard.history.couldNotStart', { detail: err.message }) });
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
            label: result.ok ? label : t('dashboard.history.failedLine', { what: label.split(' · ')[0], error: errorText(result) }),
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
            h('h3', {}, t('dashboard.activity')),
            h('ol', { class: 'db-history' }, ...b.history.map((entry) => {
                // Entries recorded before the Flywire endpoint was stored show this demo's proxy URL instead.
                const call = entry.upstream || entry.request;
                const path = entry.upstream ? entry.upstream.path : entry.request?.url;
                const summary = call
                    ? [`${call.method} ${path}`, entry.status ? `→ ${entry.status}` : '', entry.ms !== undefined ? `· ${entry.ms} ms` : ''].filter(Boolean).join(' ')
                    : t('dashboard.showData');
                return h('li', { class: entry.ok ? 'ok' : 'failed' },
                    h('div', { class: 'db-history-head' },
                        h('span', {}, entry.label),
                        h('span', { class: 'db-sub' }, new Date(entry.at).toLocaleTimeString(I18n.locale))
                    ),
                    call || entry.response !== undefined ? h('details', {},
                        h('summary', {}, summary),
                        entry.upstream ? historyCode(t('dashboard.request'), toCurl(entry.upstream)) : null,
                        !entry.upstream && entry.request?.body ? historyCode(t('dashboard.requestBody'), JSON.stringify(entry.request.body, null, 2)) : null,
                        entry.response !== undefined ? historyCode(t('dashboard.response'), maskJson(entry.response)) : null
                    ) : null
                );
            }))
        );
    }

    function historyCode(title, text) {
        const copy = h('button', { type: 'button', class: 'db-btn db-btn-ghost db-btn-sm' }, t('common.copy'));
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
        return `${new Date(b.checkIn).toLocaleDateString(I18n.locale, opts)} – ${new Date(b.checkOut).toLocaleDateString(I18n.locale, { ...opts, year: 'numeric' })}`;
    }

    function sum(items) {
        return (items || []).reduce((total, item) => total + (item.amount || 0), 0);
    }

    function money(cents, currency = 'USD') {
        if (window.DemoMoney && currency === DemoMoney.code()) return DemoMoney.formatMinor(cents);
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
        } catch {
            return `${((cents || 0) / 100).toFixed(2)} ${currency}`;
        }
    }

    function renderRecipientCurrency() {
        const box = $('db-recipient-currency');
        const value = $('db-recipient-currency-value');
        const fxLine = $('db-recipient-fx');
        if (!box) return;

        const saved = DemoMoney.recipient();
        const currency = DemoMoney.currency();
        const rate = DemoMoney.fx();
        const err = DemoMoney.lastError();
        if (!saved && !err) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        if (!saved) {
            value.textContent = t('dashboard.currencyUnavailable');
            fxLine.textContent = err || '';
            return;
        }
        const symbol = currency.symbol ? ` (${currency.symbol})` : '';
        value.textContent = t('dashboard.currencyValue', { code: currency.code, name: currency.name || currency.code, symbol });
        const who = `${saved.name || saved.id} (${saved.id})`;
        const rateText = currency.code === 'USD'
            ? t('dashboard.currencyUsd')
            : t('dashboard.currencyRate', { rate: rate.rate, code: currency.code, date: rate.date ? ` · ${rate.date}` : '' });
        fxLine.textContent = t('dashboard.currencyLine', { who, detail: err || rateText });
    }

    function timeAgo(ms) {
        const minutes = Math.round((Date.now() - ms) / 60000);
        if (minutes < 1) return t('stay.justNow');
        if (minutes < 60) return t('stay.minutesAgo', { count: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 24) return t('stay.hoursAgo', { count: hours });
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
