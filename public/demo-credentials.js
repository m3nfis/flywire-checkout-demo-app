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

    // Shared with the checkout settings drawer (Recipient section).
    const RECIPIENT_KEY = 'flywire.checkoutDemo.recipient';
    const API_KEY_KEY = 'flywire.checkoutDemo.apiKey';
    const FIELDS = [
        ['client_id', 'Client ID'],
        ['code', 'recipient code'],
        ['api_key', 'API key'],
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
            code: String(recipient.code || ''),
            api_key: localStorage.getItem(API_KEY_KEY) || '',
        };
    }

    function set({ client_id, code, api_key }) {
        const current = get();
        const next = {
            client_id: client_id ?? current.client_id,
            code: code ?? current.code,
            api_key: api_key ?? current.api_key,
        };
        if (next.client_id || next.code) {
            localStorage.setItem(RECIPIENT_KEY, JSON.stringify({ client_id: next.client_id, code: next.code }));
        } else {
            localStorage.removeItem(RECIPIENT_KEY);
        }
        if (next.api_key) localStorage.setItem(API_KEY_KEY, next.api_key);
        else localStorage.removeItem(API_KEY_KEY);
        notify();
        return next;
    }

    function clear() {
        localStorage.removeItem(RECIPIENT_KEY);
        localStorage.removeItem(API_KEY_KEY);
        notify();
    }

    /** Labels of the credentials still missing, e.g. ['API key']. */
    function missing() {
        const saved = get();
        return FIELDS.filter(([key]) => !saved[key]).map(([, label]) => label);
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
        document.querySelectorAll('[data-credentials-banner]').forEach((banner) => {
            banner.hidden = gaps.length === 0;
            const list = banner.querySelector('[data-credentials-missing]');
            if (list) list.textContent = gaps.length === FIELDS.length ? 'Client ID, recipient code and API key' : joinList(gaps);
        });
    }

    function joinList(items) {
        return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || '';
    }

    global.addEventListener('storage', (e) => {
        if (e.key === RECIPIENT_KEY || e.key === API_KEY_KEY || e.key === null) notify();
    });
    global.addEventListener('DOMContentLoaded', renderBanners);

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
            step(/[\u200B-\u200D\u2060\uFEFF]/g, '', 'invisible characters');
            step(/\u00A0/g, ' ', 'non-breaking spaces');
            value = value.trim();
            step(/^(["'`])([\s\S]*)\1$/, '$2', 'surrounding quotes');
            step(/^[“‘]([\s\S]*)[”’]$/, '$1', 'surrounding quotes');
            value = value.trim();
            step(/^(?:x-authentication-key|x-demo-api-key|authorization|api[_ -]?key|cpx_api_key|client[_ ]?id|code)\s*[:=]\s*/i, '', 'the field name in front');
            step(/^bearer\s+/i, '', 'a "Bearer" prefix');
            step(/[;,]+$/, '', 'trailing punctuation');
        }
        step(/\s+/g, '', kind === 'key' ? 'line breaks or spaces inside the key' : 'spaces');
        if (kind === 'code') step(/[a-z]/g, (c) => c.toUpperCase(), 'lowercase letters');

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
        get, set, clear, clean, mask, missing, isComplete, renderBanners,
        onChange: (fn) => listeners.add(fn),
    };
})(window);
