/**
 * Card brand icons and labels for payment results (demo tooling).
 *
 * `payment_watchlist` items carry `brand` and `last_four`; the brand string's
 * casing and spelling vary by processor, so it is normalized here. The current
 * report has no expiry date, so `expiry()` only returns one if a field for it
 * is present.
 */
(function (global) {
    'use strict';

    const FRAME = '<rect x="0.5" y="0.5" width="37" height="23" rx="3.5" fill="#fff" stroke="#E0E0E3"/>';
    const text = (label, fill, size, extra = '') =>
        `<text x="19" y="12.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="${fill}" ${extra}>${label}</text>`;

    const BRANDS = {
        visa: {
            label: 'Visa',
            svg: FRAME + text('VISA', '#1A1F71', 10, 'font-style="italic" letter-spacing="0.5"'),
        },
        mastercard: {
            label: 'Mastercard',
            svg: FRAME
                + '<circle cx="15" cy="12" r="7" fill="#EB001B"/><circle cx="23" cy="12" r="7" fill="#F79E1B"/>'
                + '<path d="M19 6.26A7 7 0 0 1 19 17.74A7 7 0 0 1 19 6.26Z" fill="#FF5F00"/>',
        },
        amex: {
            label: 'American Express',
            svg: '<rect width="38" height="24" rx="4" fill="#1F72CD"/>' + text('AMEX', '#fff', 9, 'letter-spacing="0.5"'),
        },
        discover: {
            label: 'Discover',
            svg: FRAME + text('DISC', '#231F20', 8) + '<circle cx="30" cy="12.3" r="3" fill="#F48024"/>',
        },
        jcb: { label: 'JCB', svg: FRAME + text('JCB', '#0B4EA2', 9) },
        diners: { label: 'Diners Club', svg: FRAME + text('DINERS', '#0079BE', 6.5) },
        unionpay: { label: 'UnionPay', svg: FRAME + text('UnionPay', '#E21836', 6) },
        maestro: {
            label: 'Maestro',
            svg: FRAME
                + '<circle cx="15" cy="12" r="7" fill="#EB001B"/><circle cx="23" cy="12" r="7" fill="#00A2E5"/>'
                + '<path d="M19 6.26A7 7 0 0 1 19 17.74A7 7 0 0 1 19 6.26Z" fill="#7375CF"/>',
        },
        card: {
            label: 'Card',
            svg: FRAME + '<rect x="0.5" y="6" width="37" height="3.5" fill="#CBD5E1"/><rect x="5" y="14" width="10" height="3" rx="1" fill="#CBD5E1"/>',
        },
    };

    const ALIASES = {
        visa: 'visa', visaelectron: 'visa',
        mastercard: 'mastercard', master: 'mastercard', mc: 'mastercard',
        amex: 'amex', americanexpress: 'amex',
        discover: 'discover',
        jcb: 'jcb',
        diners: 'diners', dinersclub: 'diners',
        unionpay: 'unionpay', cup: 'unionpay', chinaunionpay: 'unionpay',
        maestro: 'maestro',
    };

    const METHOD_LABELS = {
        credit_card: 'Card',
        card: 'Card',
        direct_debit: 'Direct debit',
        bank_transfer: 'Bank transfer',
        online: 'Online payment',
    };

    function normalize(brand) {
        const key = String(brand || '').toLowerCase().replace(/[^a-z]/g, '');
        return ALIASES[key] || 'card';
    }

    function label(brand) {
        const key = normalize(brand);
        return key === 'card' && brand ? String(brand) : BRANDS[key].label;
    }

    function icon(brand) {
        const key = normalize(brand);
        const span = document.createElement('span');
        span.className = 'card-brand-icon';
        span.innerHTML = `<svg viewBox="0 0 38 24" width="32" height="20" aria-hidden="true">${BRANDS[key].svg}</svg>`;
        return span;
    }

    /** `MM/YY` if the payment carries an expiry in any of the usual shapes, otherwise null. */
    function expiry(payment) {
        const single = payment.expiration_date || payment.expiry_date || payment.expiry || payment.exp_date || payment.card_expiry;
        if (single) return String(single);

        const month = payment.expiration_month ?? payment.expiry_month ?? payment.exp_month;
        const year = payment.expiration_year ?? payment.expiry_year ?? payment.exp_year;
        if (month && year) return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
        return null;
    }

    /** Icon + "Visa •••• 4242" (+ "· exp 12/28") for cards; a plain label for other methods. */
    function describe(payment, { withExpiry = true } = {}) {
        const wrap = document.createElement('span');
        wrap.className = 'card-brand';
        const isCard = isCardPayment(payment);

        if (!isCard) {
            wrap.textContent = METHOD_LABELS[payment.payment_method] || payment.payment_method || '—';
            return wrap;
        }

        const parts = [label(payment.brand)];
        if (payment.last_four) parts.push(`•••• ${payment.last_four}`);
        const exp = withExpiry && expiry(payment);
        if (exp) parts.push(`· exp ${exp}`);

        const textNode = document.createElement('span');
        textNode.textContent = parts.join(' ');
        wrap.append(icon(payment.brand), textNode);
        return wrap;
    }

    function isCardPayment(payment) {
        return ['credit_card', 'card'].includes(payment.payment_method) || Boolean(payment.brand || payment.last_four);
    }

    /**
     * Held (pre-authorized) payments come back without brand or last four. When the
     * same session saved the card, take them from `tokenization_report`.
     */
    function withSavedCard(payment, report) {
        const card = report?.tokenization_report;
        if (!payment || payment.brand || payment.last_four || !isCardPayment(payment) || !card?.brand) return payment;
        return { ...payment, brand: card.brand, last_four: card.last_four };
    }

    global.CardBrands = {
        normalize, label, icon, expiry, describe, isCardPayment, withSavedCard,
        methodLabel: (m) => METHOD_LABELS[m] || m,
    };
})(window);
