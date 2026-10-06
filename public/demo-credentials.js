/**
 * Demo credentials — every user enters their own Flywire DEMO credentials in
 * the back office (/dashboard). There are no defaults. They are saved in this
 * browser's localStorage.
 *
 * DEMO ONLY: the API key is sent to this demo's server in `X-Demo-Api-Key`,
 * and the server only ever calls the Flywire demo API. In a real integration
 * the API key lives only in your server's environment and never reaches the browser.
 */
(function (global) {
    'use strict';

    // Active credentials, shared with the checkout settings drawer.
    const RECIPIENT_KEY = 'flywire.checkoutDemo.recipient';
    const API_KEY_KEY = 'flywire.checkoutDemo.apiKey';
    // Saved clients. One entry per Client ID: one API key, many recipient codes.
    const CLIENTS_KEY = 'flywire.checkoutDemo.clients';
    const FIELDS = [
        ['client_id', 'credentials.fields.client_id'],
        ['code', 'credentials.fields.code'],
        ['api_key', 'credentials.fields.api_key'],
    ];
    const listeners = new Set();

    function readJson(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch {
            return {};
        }
    }

    function get() {
        const recipient = readJson(RECIPIENT_KEY);
        return {
            client_id: String(recipient.client_id || ''),
            client_name: String(recipient.client_name || ''),
            code: String(recipient.code || ''),
            api_key: localStorage.getItem(API_KEY_KEY) || '',
        };
    }

    function set({ client_id, client_name, code, api_key }) {
        const current = get();
        const next = {
            client_id: client_id ?? current.client_id,
            client_name: client_name ?? current.client_name,
            code: code ?? current.code,
            api_key: api_key ?? current.api_key,
        };
        if (next.client_id || next.code || next.client_name) {
            localStorage.setItem(RECIPIENT_KEY, JSON.stringify({
                client_id: next.client_id,
                client_name: next.client_name,
                code: next.code,
            }));
        } else {
            localStorage.removeItem(RECIPIENT_KEY);
        }
        if (next.api_key) localStorage.setItem(API_KEY_KEY, next.api_key);
        else localStorage.removeItem(API_KEY_KEY);
        notify();
        return next;
    }

    /** Drops the credentials in use. Saved clients stay available to load. */
    function clear() {
        localStorage.removeItem(RECIPIENT_KEY);
        localStorage.removeItem(API_KEY_KEY);
        notify();
    }

    function readClients() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CLIENTS_KEY));
            return Array.isArray(parsed) ? parsed.filter((item) => item && item.client_id && item.api_key) : [];
        } catch {
            return [];
        }
    }

    function writeClients(clients) {
        localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
    }

    /**
     * Saved clients, indexed by Client ID. The first time this runs, the
     * credentials already in use are copied in so they can be loaded again.
     */
    function list() {
        const clients = readClients();
        if (clients.length || localStorage.getItem(CLIENTS_KEY) != null) return clients;
        const current = get();
        if (!current.client_id || !current.api_key) return [];
        const seeded = [entryFrom(current)];
        writeClients(seeded);
        return seeded;
    }

    function entryFrom(creds) {
        const code = String(creds.code || '').trim().toUpperCase();
        return {
            client_id: String(creds.client_id).trim(),
            client_name: String(creds.client_name || '').trim(),
            api_key: creds.api_key,
            codes: code ? [code] : [],
        };
    }

    function find(clientId) {
        const id = String(clientId || '').trim().toLowerCase();
        if (!id) return null;
        return list().find((item) => item.client_id.toLowerCase() === id) || null;
    }

    function codesFor(clientId) {
        return find(clientId)?.codes.slice() || [];
    }

    /**
     * Remember a connection that the demo API accepted.
     * Client ID is the index: one API key per Client ID, recipient codes accumulate.
     */
    function remember(creds) {
        const clientId = String(creds.client_id || '').trim();
        const apiKey = String(creds.api_key || '');
        if (!clientId || !apiKey) return list();

        const clients = list();
        const code = String(creds.code || '').trim().toUpperCase();
        const name = String(creds.client_name || '').trim();
        let item = clients.find((entry) => entry.client_id.toLowerCase() === clientId.toLowerCase());
        if (!item) {
            item = { client_id: clientId, client_name: name, api_key: apiKey, codes: [] };
            clients.push(item);
        } else {
            item.client_id = clientId;
            item.api_key = apiKey;
            if (name) item.client_name = name;
        }
        if (code && !item.codes.includes(code)) item.codes.push(code);
        writeClients(clients);
        notify();
        return clients;
    }

    /** Translated labels of the credentials still missing, e.g. ['API key']. */
    function missing() {
        const saved = get();
        return FIELDS.filter(([key]) => !saved[key]).map(([, label]) => global.I18n.t(label));
    }

    function isComplete() {
        return missing().length === 0;
    }

    function notify() {
        listeners.forEach((fn) => fn(get()));
        renderBanners();
    }

    /** Show every `[data-credentials-banner]` while credentials are missing. */
    function renderBanners() {
        const gaps = missing();
        const missingText = gaps.length === FIELDS.length
            ? global.I18n.t('credentials.allMissing')
            : joinList(gaps);
        document.querySelectorAll('[data-credentials-banner]').forEach((banner) => {
            banner.hidden = gaps.length === 0;
            if (!gaps.length) return;
            banner.querySelectorAll('[data-credentials-body]').forEach((body) => {
                body.innerHTML = global.I18n.t(body.getAttribute('data-credentials-body'), { missing: missingText });
            });
        });
    }

    function joinList(items) {
        if (items.length < 2) return items[0] || '';
        return `${items.slice(0, -1).join(', ')} ${global.I18n.t('common.and')} ${items[items.length - 1]}`;
    }

    global.addEventListener('storage', (e) => {
        if (e.key === RECIPIENT_KEY || e.key === API_KEY_KEY || e.key === CLIENTS_KEY || e.key === null) notify();
    });
    global.addEventListener('DOMContentLoaded', () => {
        const run = () => renderBanners();
        if (global.I18n?.ready) global.I18n.ready.then(run);
        else run();
    });

    /**
     * Undo the usual copy-paste accidents. Returns the cleaned value and a
     * human-readable list of what was fixed.
     */
    function clean(raw, { kind = 'key' } = {}) {
        let value = String(raw ?? '');
        const fixes = [];
        const step = (pattern, replacement, label) => {
            const next = value.replace(pattern, replacement);
            if (next !== value) {
                fixes.push(label);
                value = next;
            }
        };

        // Repeat until stable: quotes can wrap a "Header: value" paste and vice versa.
        for (let pass = 0, before = null; pass < 4 && before !== value; pass++) {
            before = value;
            step(/[\u200B-\u200D\u2060\uFEFF]/g, '', 'dashboard.fix.invisible');
            step(/\u00A0/g, ' ', 'dashboard.fix.nbsp');
            value = value.trim();
            step(/^(["'`])([\s\S]*)\1$/, '$2', 'dashboard.fix.quotes');
            step(/^[“‘]([\s\S]*)[”’]$/, '$1', 'dashboard.fix.quotes');
            value = value.trim();
            step(/^(?:x-authentication-key|x-demo-api-key|authorization|api[_ -]?key|cpx_api_key|client[_ ]?id|code)\s*[:=]\s*/i, '', 'dashboard.fix.fieldName');
            step(/^bearer\s+/i, '', 'dashboard.fix.bearer');
            step(/[;,]+$/, '', 'dashboard.fix.punctuation');
        }
        step(/\s+/g, '', kind === 'key' ? 'dashboard.fix.spacesInKey' : 'dashboard.fix.spaces');
        if (kind === 'code') step(/[a-z]/g, (c) => c.toUpperCase(), 'dashboard.fix.lowercase');

        return { value, fixes: [...new Set(fixes)] };
    }

    function mask(key) {
        if (!key) return '';
        return key.length <= 10 ? '•'.repeat(key.length) : `${key.slice(0, 4)}…${key.slice(-4)}`;
    }

    // Attach the saved key to this demo's own /api/* calls only.
    const nativeFetch = global.fetch.bind(global);
    global.fetch = (input, init = {}) => {
        const apiKey = get().api_key;
        const url = new URL(typeof input === 'string' ? input : input.url, global.location.href);
        if (apiKey && url.origin === global.location.origin && url.pathname.startsWith('/api/')) {
            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            headers.set('X-Demo-Api-Key', apiKey);
            init = { ...init, headers };
        }
        return nativeFetch(input, init);
    };

    global.DemoCredentials = {
        get, set, clear, list, find, codesFor, remember, clean, mask, missing, isComplete, renderBanners,
        onChange: (fn) => listeners.add(fn),
    };
})(window);
