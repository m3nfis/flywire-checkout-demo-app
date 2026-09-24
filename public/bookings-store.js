/**
 * Demo bookings store — stands in for the hotel's own database.
 *
 * The booking site writes a booking when checkout starts and updates it from
 * the checkout events; the back-office dashboard reads it and records the
 * payment actions taken afterwards. Everything lives in localStorage, and
 * other open tabs are notified through the `storage` event.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'caldera.bookings.v1';
    const MAX_BOOKINGS = 50;
    const listeners = new Set();

    function list() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function save(bookings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings.slice(0, MAX_BOOKINGS)));
        listeners.forEach((fn) => fn());
    }

    function get(id) {
        return list().find((b) => b.id === id) || null;
    }

    function newReference() {
        const taken = new Set(list().map((b) => b.id));
        let id;
        do {
            id = `CH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        } while (taken.has(id));
        return id;
    }

    function create(data) {
        const booking = {
            id: newReference(),
            createdAt: Date.now(),
            checkoutStatus: 'started',
            payments: [],
            captures: [],
            adjustments: [],
            charges: [],
            history: [],
            ...data,
        };
        booking.authorizedAmount = booking.flow?.preauth ? booking.amount : null;
        save([booking, ...list()]);
        return booking;
    }

    function update(id, change) {
        const bookings = list();
        const index = bookings.findIndex((b) => b.id === id);
        if (index === -1) return null;
        const current = bookings[index];
        bookings[index] = typeof change === 'function' ? change(structuredClone(current)) : { ...current, ...change };
        save(bookings);
        return bookings[index];
    }

    function addHistory(id, entry) {
        return update(id, (b) => {
            b.history = [{ at: Date.now(), ...entry }, ...(b.history || [])].slice(0, 100);
            return b;
        });
    }

    function remove(id) {
        save(list().filter((b) => b.id !== id));
    }

    function clear() {
        localStorage.removeItem(STORAGE_KEY);
        listeners.forEach((fn) => fn());
    }

    /** Merge a session report (from `on_end` or GET session) into the booking. */
    function applyReport(id, report) {
        if (!report) return get(id);
        return update(id, (b) => {
            b.report = report;
            b.reportedAt = Date.now();
            const watchlist = report.payment_report?.payment_watchlist || [];
            watchlist.forEach((p) => {
                const existing = b.payments.find((x) => x.payment_id === p.payment_id);
                if (existing) Object.assign(existing, p);
                else b.payments.push({ ...p });
            });
            const token = extractToken(report.tokenization_report);
            if (token) b.token = { ...b.token, ...token };
            return b;
        });
    }

    /** Follow a checkout run via `FlywireCheckout.launch({ onEvent })`. */
    function trackCheckout(id, name, detail) {
        switch (name) {
            case 'session_created':
            case 'session_resumed':
                update(id, { sessionId: detail.session.id });
                break;
            case 'on_end':
                update(id, { checkoutStatus: detail.reason });
                if (detail.payload) applyReport(id, detail.payload);
                break;
            case 'session_report':
                applyReport(id, detail.report);
                break;
        }
    }

    function extractToken(tokenizationReport) {
        if (!tokenizationReport) return null;
        const token = {
            payment_method_token: findValue(tokenizationReport, ['payment_method_token', 'token', 'payment_token']),
            mandate_id: findValue(tokenizationReport, ['mandate_id', 'mandate']),
            payor_id: findValue(tokenizationReport, ['payor_id', 'payer_id', 'payor']),
        };
        return Object.values(token).some(Boolean) ? token : null;
    }

    function findValue(obj, names, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 5) return undefined;
        for (const name of names) {
            if (typeof obj[name] === 'string' && obj[name]) return obj[name];
        }
        for (const value of Object.values(obj)) {
            const found = findValue(value, names, depth + 1);
            if (found) return found;
        }
        return undefined;
    }

    global.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY || e.key === null) listeners.forEach((fn) => fn());
    });

    global.Bookings = {
        list,
        get,
        create,
        update,
        addHistory,
        remove,
        clear,
        applyReport,
        trackCheckout,
        onChange: (fn) => listeners.add(fn),
    };
})(window);
