/**
 * Recipient currency for the demo.
 *
 * Suite rates are catalogued in USD. The recipient (for example THI) bills in
 * its own currency, so every amount the guest sees — and the amount sent to
 * checkout — is converted. 7000 USD is not shown as 7000 THB.
 *
 * The currency comes from GET /api/recipient. The USD rate for that currency
 * is kept in this browser for 3 days, one entry per pair (USD-THB, …).
 * GET /api/fx runs only when the pair is missing or older than that.
 * Until a rate is available, amounts stay in USD.
 */
(function (global) {
    'use strict';

    const CACHE_KEY = 'caldera.recipientCurrency.v1';
    const FX_KEY = 'caldera.fxRates.v1';
    const FX_TTL_MS = 3 * 24 * 60 * 60 * 1000;

    const USD = {
        recipient: null,
        currency: {
            code: 'USD',
            name: 'US Dollar',
            symbol: '$',
            symbol_first: true,
            subunit_to_unit: 100,
            units_to_round: 0.01,
        },
        fx: { base: 'USD', rate: 1, date: null },
    };

    seedFxFromProfile();
    let profile = readCache() || USD;
    let error = null;
    const listeners = new Set();

    function readCache() {
        try {
            const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            const creds = global.DemoCredentials?.get();
            if (!saved || !creds) return null;
            if (saved.client_id !== creds.client_id || saved.code !== creds.code) return null;
            if (!saved.currency?.code || !(Number(saved.fx?.rate) > 0)) return null;
            return { recipient: saved.recipient || null, currency: saved.currency, fx: saved.fx };
        } catch {
            return null;
        }
    }

    function writeCache(next, creds) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            client_id: creds.client_id,
            code: creds.code,
            recipient: next.recipient,
            currency: next.currency,
            fx: next.fx,
        }));
    }

    /** `{ "USD-THB": { rate, date, savedAt } }`, dropping pairs older than 3 days. */
    function readRates() {
        try {
            const parsed = JSON.parse(localStorage.getItem(FX_KEY) || '{}');
            const now = Date.now();
            const fresh = {};
            Object.entries(parsed).forEach(([pair, entry]) => {
                if (!entry || !(Number(entry.rate) > 0)) return;
                if (now - Number(entry.savedAt) >= FX_TTL_MS) return;
                fresh[pair] = entry;
            });
            return fresh;
        } catch {
            return {};
        }
    }

    function writeRates(rates) {
        localStorage.setItem(FX_KEY, JSON.stringify(rates));
    }

    /** Keep a rate already saved with the active recipient, so the first load after this change does not fetch it again. */
    function seedFxFromProfile() {
        try {
            const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            const code = saved?.currency?.code;
            const rate = Number(saved?.fx?.rate);
            if (!code || code === 'USD' || !(rate > 0)) return;
            const pair = `USD-${code}`;
            const rates = readRates();
            if (rates[pair]) return;
            rates[pair] = { rate, date: saved.fx.date || null, savedAt: Date.now() };
            writeRates(rates);
        } catch {
            /* ignore a broken cache */
        }
    }

    /**
     * USD → `code`. Uses the pair saved in this browser when it is younger
     * than 3 days. Otherwise asks the demo server once and stores the pair.
     */
    async function fxFor(code) {
        const target = String(code || 'USD').toUpperCase();
        if (target === 'USD') {
            return { base: 'USD', pair: 'USD-USD', rate: 1, date: new Date().toISOString().slice(0, 10) };
        }
        const pair = `USD-${target}`;
        const hit = readRates()[pair];
        if (hit) return { base: 'USD', pair, rate: Number(hit.rate), date: hit.date || null };

        const res = await fetch(`/api/fx?to=${encodeURIComponent(target)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !(Number(data.rate) > 0)) {
            throw new Error(data.detail || `No exchange rate from USD to ${target}.`);
        }
        const rates = readRates();
        rates[pair] = { rate: Number(data.rate), date: data.date || null, savedAt: Date.now() };
        writeRates(rates);
        return { base: 'USD', pair, rate: Number(data.rate), date: data.date || null };
    }

    function notify() {
        listeners.forEach((fn) => fn(profile));
    }

    function roundToStep(value, step) {
        const s = Number(step);
        if (!s || s <= 0) return value;
        const factor = Math.round(1 / s);
        if (!Number.isFinite(factor) || factor <= 0) return Math.round(value / s) * s;
        return Math.round((value + Number.EPSILON) * factor) / factor;
    }

    function currency() { return profile.currency; }
    function code() { return profile.currency.code; }
    function symbol() { return profile.currency.symbol || profile.currency.code; }
    function fx() { return profile.fx; }
    function recipient() { return profile.recipient; }
    function lastError() { return error; }

    function fractionDigits() {
        const step = Number(profile.currency.units_to_round);
        const subunit = profile.currency.subunit_to_unit || 100;
        if (subunit === 1 || step >= 1) return 0;
        return 2;
    }

    /** USD major units (2450) → recipient minor units, rounded the way the recipient bills. */
    function usdMajorToMinor(usdMajor) {
        const rate = Number(profile.fx?.rate) || 1;
        const subunit = profile.currency.subunit_to_unit || 100;
        const major = roundToStep(Number(usdMajor) * rate, profile.currency.units_to_round || 0.01);
        return Math.round(major * subunit);
    }

    function usdCentsToMinor(usdCents) {
        return usdMajorToMinor((Number(usdCents) || 0) / 100);
    }

    function minorToUsdCents(minor) {
        const rate = Number(profile.fx?.rate) || 1;
        const subunit = profile.currency.subunit_to_unit || 100;
        const major = (Number(minor) || 0) / subunit;
        return Math.round((major / rate) * 100);
    }

    function usdCentsToMajor(usdCents) {
        const subunit = profile.currency.subunit_to_unit || 100;
        return usdCentsToMinor(usdCents) / subunit;
    }

    function majorToUsdCents(major) {
        const subunit = profile.currency.subunit_to_unit || 100;
        return minorToUsdCents(Math.round(Number(major) * subunit));
    }

    function formatMinor(minor) {
        const current = profile.currency;
        const subunit = current.subunit_to_unit || 100;
        const major = (Number(minor) || 0) / subunit;
        const digits = Number.isInteger(major) ? 0 : fractionDigits();
        const formatted = major.toLocaleString('en-US', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
        const sym = current.symbol || current.code;
        return current.symbol_first === false ? `${formatted} ${sym}` : `${sym}${formatted}`;
    }

    function formatUsdMajor(usd) { return formatMinor(usdMajorToMinor(usd)); }
    function formatUsdCents(cents) { return formatMinor(usdCentsToMinor(cents)); }

    function onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function applyUsd() {
        error = null;
        profile = USD;
        localStorage.removeItem(CACHE_KEY);
        notify();
    }

    async function refresh() {
        const creds = global.DemoCredentials?.get() || {};
        if (!creds.api_key || !creds.client_id || !creds.code) {
            applyUsd();
            return profile;
        }

        const cached = readCache();
        if (cached) {
            error = null;
            profile = cached;
            notify();
        }

        const params = new URLSearchParams({ client_id: creds.client_id, code: creds.code });
        try {
            const res = await fetch(`/api/recipient?${params}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok || !data.currency?.code) {
                error = data.detail || global.I18n.t('sdk.currencyUnreadable');
                if (!cached) profile = USD;
                notify();
                return profile;
            }
            let fx;
            try {
                fx = await fxFor(data.currency.code);
            } catch (err) {
                error = err.message || global.I18n.t('sdk.currencyUnreadable');
                if (!(cached && cached.currency?.code === data.currency.code)) profile = USD;
                notify();
                return profile;
            }
            error = null;
            profile = { recipient: data.recipient, currency: data.currency, fx };
            writeCache(profile, creds);
            notify();
            return profile;
        } catch {
            error = global.I18n.t('sdk.currencyUnreachable');
            if (!cached) profile = USD;
            notify();
            return profile;
        }
    }

    global.DemoCredentials?.onChange(() => { refresh(); });

    global.DemoMoney = {
        refresh,
        onChange,
        code,
        symbol,
        currency,
        fx,
        recipient,
        lastError,
        profile: () => profile,
        fractionDigits,
        usdMajorToMinor,
        usdCentsToMinor,
        minorToUsdCents,
        usdCentsToMajor,
        majorToUsdCents,
        formatMinor,
        formatUsdMajor,
        formatUsdCents,
    };
}(window));
