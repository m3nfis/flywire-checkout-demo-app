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
    // Recipient fields belong to one recipient code. Keyed by client id + code.
    const FIELD_SETS_KEY = 'flywire.checkoutDemo.recipientFields';
    const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const PORTAL_CODE = /^(?:[A-Z]{3}|[A-Z][A-Z0-9]{4})$/;
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

    /** Storage key for one client id + recipient code. Empty until both are real. */
    function tupleKey(clientId, code) {
        const id = String(clientId || '').trim().toLowerCase();
        const portal = String(code || '').trim().toUpperCase();
        if (!CLIENT_ID.test(id) || !PORTAL_CODE.test(portal)) return '';
        return `${id}|${portal}`;
    }

    function readFieldSets() {
        try {
            const parsed = JSON.parse(localStorage.getItem(FIELD_SETS_KEY));
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    function fieldsFor(clientId, code) {
        const key = tupleKey(clientId, code);
        return key ? normalizeFields(readFieldSets()[key]) : [];
    }

    /**
     * Save the field rows for one client id + recipient code.
     * Does not change which connection is active, and does not copy rows onto another code.
     */
    function saveFields(clientId, code, fields) {
        const key = tupleKey(clientId, code);
        if (!key) return get();
        const sets = readFieldSets();
        const normalized = normalizeFields(fields);
        if (normalized.length) sets[key] = normalized;
        else delete sets[key];
        localStorage.setItem(FIELD_SETS_KEY, JSON.stringify(sets));
        return get();
    }

    function get() {
        const recipient = readJson(RECIPIENT_KEY);
        const client_id = String(recipient.client_id || '');
        const code = String(recipient.code || '');
        return {
            client_id,
            client_name: String(recipient.client_name || ''),
            code,
            api_key: localStorage.getItem(API_KEY_KEY) || '',
            fields: fieldsFor(client_id, code),
        };
    }

    function set({ client_id, client_name, code, api_key, fields } = {}) {
        const current = get();
        const next = {
            client_id: client_id ?? current.client_id,
            client_name: client_name ?? current.client_name,
            code: code ?? current.code,
            api_key: api_key ?? current.api_key,
        };
        // Only write a set when the caller passes one. Omitting fields keeps each code's own set.
        if (fields !== undefined) {
            const key = tupleKey(next.client_id, next.code);
            if (key) {
                const sets = readFieldSets();
                const normalized = normalizeFields(fields);
                if (normalized.length) sets[key] = normalized;
                else delete sets[key];
                localStorage.setItem(FIELD_SETS_KEY, JSON.stringify(sets));
            }
        }
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
        return { ...next, fields: fieldsFor(next.client_id, next.code) };
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
            delete item.fields;
        }
        if (code && !item.codes.includes(code)) item.codes.push(code);
        writeClients(clients);
        notify();
        return clients;
    }

    function normalizeFields(fields) {
        if (!Array.isArray(fields)) return [];
        return fields
            .map((item) => ({
                key: String(item?.key || '').trim(),
                value: String(item?.value ?? ''),
            }))
            .filter((item) => item.key);
    }

    /** `recipient.fields` for checkout. Empty values are left out. true/false become booleans. */
    function fieldMap() {
        const out = {};
        for (const item of get().fields) {
            const value = item.value.trim();
            if (!value) continue;
            out[item.key] = value === 'true' ? true : value === 'false' ? false : value;
        }
        return Object.keys(out).length ? out : undefined;
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

    /**
     * Older builds stored one field list on the active connection and on the
     * client. Move that list onto the single code it belonged to, then drop it.
     */
    function migrateFieldSets() {
        const recipient = readJson(RECIPIENT_KEY);
        const sets = readFieldSets();
        let setsChanged = false;
        const assign = (clientId, code, fields) => {
            const key = tupleKey(clientId, code);
            const normalized = normalizeFields(fields);
            if (!key || !normalized.length || sets[key]) return;
            sets[key] = normalized;
            setsChanged = true;
        };

        if (Object.prototype.hasOwnProperty.call(recipient, 'fields')) {
            assign(recipient.client_id, recipient.code, recipient.fields);
            delete recipient.fields;
            if (recipient.client_id || recipient.code || recipient.client_name) {
                localStorage.setItem(RECIPIENT_KEY, JSON.stringify({
                    client_id: recipient.client_id || '',
                    client_name: recipient.client_name || '',
                    code: recipient.code || '',
                }));
            } else {
                localStorage.removeItem(RECIPIENT_KEY);
            }
        }

        let clients = [];
        try {
            const parsed = JSON.parse(localStorage.getItem(CLIENTS_KEY));
            clients = Array.isArray(parsed) ? parsed : [];
        } catch {
            clients = [];
        }
        let clientsChanged = false;
        const activeCode = String(recipient.code || '').trim().toUpperCase();
        clients.forEach((item) => {
            if (!item || !Object.prototype.hasOwnProperty.call(item, 'fields')) return;
            const codes = Array.isArray(item.codes) ? item.codes : [];
            const onlyCode = codes.length === 1 ? codes[0] : '';
            const matchingActive = activeCode && codes.includes(activeCode) ? activeCode : '';
            assign(item.client_id, onlyCode || matchingActive, item.fields);
            delete item.fields;
            clientsChanged = true;
        });

        if (setsChanged) localStorage.setItem(FIELD_SETS_KEY, JSON.stringify(sets));
        if (clientsChanged) writeClients(clients);
    }

    migrateFieldSets();

    global.addEventListener('storage', (e) => {
        if (e.key === RECIPIENT_KEY || e.key === API_KEY_KEY || e.key === CLIENTS_KEY || e.key === FIELD_SETS_KEY || e.key === null) notify();
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
        get, set, clear, list, find, codesFor, remember, saveFields, clean, mask, missing, isComplete, fieldMap, renderBanners,
        onChange: (fn) => listeners.add(fn),
    };
})(window);
