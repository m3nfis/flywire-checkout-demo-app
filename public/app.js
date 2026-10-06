/**
 * Demo booking flow for The Caldera House (Santorini).
 *
 * The Flywire Checkout V2 SDK integration lives in `flywire-checkout.js`.
 * `demo-config.js` is the settings drawer that picks which capability to demo.
 * This file is just the demo host: it manages the room/guest/payment views
 * and forwards the chosen options to `FlywireCheckout.launch()`.
 *
 * If you're here to learn the SDK integration, read `flywire-checkout.js`
 * first and then `server.js` (`/api/flywire-session` proxy). This file is
 * illustrative "host app" code, not part of the integration surface.
 */

let currentBookingId = null;

const bookingState = {
    room: null,
    guest: null
};

document.addEventListener('DOMContentLoaded', async () => {
    await I18n.ready;
    const config = await fetch('/api/config').then(r => r.json());

    DemoConfig.init(config);
    DemoConfig.onChange(updatePaymentOption);
    DemoCredentials.onChange(updatePaymentOption);
    DemoMoney.onChange(applyCurrency);
    CheckoutActivity.init();

    Stay.init();
    Stay.onChange(() => {
        renderStay();
        DemoConfig.setBookingAmount(totalCents(), chargeMinorUnits());
        updatePaymentOption();
    });
    renderStay();

    document.querySelectorAll('.btn-select-room').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.room-card');
            const roomId = card.dataset.room;
            bookingState.room = {
                id: roomId,
                name: I18n.t(`rooms.cards.${roomId}.name`),
                price: parseInt(card.dataset.price),
                size: I18n.t(`rooms.cards.${roomId}.size`),
                viewType: I18n.t(`rooms.cards.${roomId}.view`),
                image: card.dataset.image
            };
            DemoConfig.setBookingAmount(totalCents(), chargeMinorUnits());
            showView('guest');
            prefillGuestForm();
            updateGuestSummary();
        });
    });

    document.getElementById('guest-form').addEventListener('submit', handleGuestSubmit);
    document.getElementById('back-to-rooms').addEventListener('click', () => showView('rooms'));
    document.getElementById('back-to-guest').addEventListener('click', () => showView('guest'));

    document.getElementById('proceed-btn').addEventListener('click', handleProceed);
    document.getElementById('retry-btn').addEventListener('click', handleRetry);

    updatePaymentOption();
    applyCurrency();
    DemoMoney.refresh();
});

/** Room cards, stay totals and the pay button follow the recipient currency. */
function applyCurrency() {
    renderRoomPrices();
    renderStay();
    DemoConfig.setBookingAmount(totalCents(), chargeMinorUnits());
    updatePaymentOption();
}

function renderRoomPrices() {
    document.querySelectorAll('.room-card').forEach((card) => {
        const usd = Number(card.dataset.price);
        const amount = card.querySelector('.price-amount');
        const unit = card.querySelector('.price-unit');
        if (amount && Number.isFinite(usd)) amount.textContent = DemoMoney.formatUsdMajor(usd);
        if (unit) {
            unit.textContent = DemoMoney.code() === 'USD'
                ? I18n.t('rooms.perNight')
                : I18n.t('rooms.perNightWithCurrency', { currency: DemoMoney.code() });
        }
    });
}

function priceBreakdown() {
    const stay = Stay.get();
    const price = bookingState.room ? bookingState.room.price : 0;
    const room = price * stay.nights;
    const extra = stay.extraGuests * stay.extraGuestFee * stay.nights;
    return { stay, price, room, extra, total: room + extra };
}

function totalDollars() {
    return priceBreakdown().total;
}

function totalCents() {
    return Math.round(totalDollars() * 100);
}

/**
 * Guest-facing total in recipient minor units.
 * Each USD rate is converted and rounded once, then multiplied, so
 * "3 nights × nightly" equals the amount checkout is asked to charge.
 */
function pricedLines() {
    const breakdown = priceBreakdown();
    const { stay, price } = breakdown;
    const nightly = DemoMoney.usdMajorToMinor(price);
    const extraEach = DemoMoney.usdMajorToMinor(stay.extraGuestFee);
    const roomMinor = nightly * stay.nights;
    const extraMinor = extraEach * stay.extraGuests * stay.nights;
    return { ...breakdown, nightly, extraEach, roomMinor, extraMinor, totalMinor: roomMinor + extraMinor };
}

function chargeMinorUnits() {
    return pricedLines().totalMinor;
}

function formatMoney(usdMajor) {
    return DemoMoney.formatUsdMajor(usdMajor);
}

// ── Guest Data ──

async function prefillGuestForm() {
    try {
        const data = await fetch('/api/guest-data').then(r => r.json());
        document.getElementById('guest-first-name').value = data.first_name || '';
        document.getElementById('guest-last-name').value = data.last_name || '';
        document.getElementById('guest-email').value = data.email || '';
        document.getElementById('guest-phone').value = data.phone || '';
        document.getElementById('guest-address').value = data.address || '';
        document.getElementById('guest-city').value = data.city || '';
        document.getElementById('guest-zip').value = data.zip || '';
        document.getElementById('guest-country').value = data.country || '';
    } catch (err) {
        console.error('Failed to load guest data:', err);
    }
}

function updateGuestSummary() {
    if (!bookingState.room) return;
    const { name, price, size, viewType, image } = bookingState.room;

    document.getElementById('summary-room-img').src = image;
    document.getElementById('summary-room-name').textContent = name;
    document.getElementById('summary-room-specs').textContent = `${size} · ${viewType}`;
    renderStay();
}

/** Fill every `[data-stay]` field (both summary panels and the success view). */
function renderStay() {
    const { stay, nightly, extraEach, roomMinor, extraMinor, totalMinor } = pricedLines();
    const values = {
        'check-in': Stay.format.short(stay.checkIn),
        'check-out': Stay.format.short(stay.checkOut),
        'check-in-long': Stay.format.long(stay.checkIn),
        'check-out-long': Stay.format.long(stay.checkOut),
        'guests': Stay.format.guests(),
        'nightly-calc': I18n.t('booking.nightlyCalc', {
            nights: Stay.format.nights(stay.nights),
            amount: DemoMoney.formatMinor(nightly),
        }),
        'room-subtotal': DemoMoney.formatMinor(roomMinor),
        'extra-calc': I18n.t('booking.extraCalc', {
            extras: I18n.t('stay.extraGuest', { count: stay.extraGuests }),
            amount: DemoMoney.formatMinor(extraEach),
            nights: Stay.format.nights(stay.nights),
        }),
        'extra-subtotal': DemoMoney.formatMinor(extraMinor),
        'grand-total': DemoMoney.formatMinor(totalMinor),
    };
    for (const [key, value] of Object.entries(values)) {
        document.querySelectorAll(`[data-stay="${key}"]`).forEach(node => { node.textContent = value; });
    }
    document.querySelectorAll('[data-stay="extra-row"]').forEach(row => { row.hidden = !stay.extraGuests; });
}

async function handleGuestSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    submitBtn.textContent = '';

    const guest = {
        first_name: form.first_name.value,
        last_name: form.last_name.value,
        email: form.email.value,
        phone: form.phone.value,
        address: form.address.value,
        city: form.city.value,
        zip: form.zip.value,
        country: form.country.value
    };

    try {
        await fetch('/api/save-guest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guest)
        });

        bookingState.guest = guest;
        showView('booking');
    } catch (err) {
        console.error('Failed to save guest data:', err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        submitBtn.textContent = I18n.t('guest.continueToPayment');
    }
}

function updateBookingView() {
    if (bookingState.guest) {
        const name = `${bookingState.guest.first_name} ${bookingState.guest.last_name}`;
        document.getElementById('booking-guest-line').textContent = I18n.t('booking.guestLine', { name });
    }
    if (bookingState.room) {
        document.getElementById('booking-room-name').textContent = bookingState.room.name;
    }
    renderStay();
    updatePaymentOption();
}

/** Guest-facing summary of the flow selected in the demo drawer. */
function updatePaymentOption() {
    const lines = pricedLines();
    const copy = DemoConfig.describeForGuest(lines.price ? DemoMoney.formatMinor(lines.totalMinor) : formatMoney(7350));
    document.getElementById('payment-option-title').textContent = copy.title;
    document.getElementById('payment-option-desc').textContent = copy.description;
    document.getElementById('payment-option-notes').textContent = copy.notes.join(' ');

    const btn = document.getElementById('proceed-btn');
    if (!btn.classList.contains('loading')) {
        btn.textContent = copy.cta;
        // No default credentials: checkout can't start until the user has entered their own.
        btn.disabled = !DemoCredentials.isComplete();
        btn.title = btn.disabled ? I18n.t('booking.credentialsFirst') : '';
    }
}

function showPaymentNotice(message) {
    const notice = document.getElementById('payment-notice');
    notice.textContent = message || '';
    notice.hidden = !message;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand-off to the Flywire Checkout V2 integration (see public/flywire-checkout.js).
// ─────────────────────────────────────────────────────────────────────────────

async function handleProceed() {
    if (!DemoCredentials.isComplete()) return;
    const btn = document.getElementById('proceed-btn');
    const paymentSection = document.getElementById('payment-section');
    const options = DemoConfig.buildCheckoutOptions({
        amountCents: totalCents(),
        amountMinor: chargeMinorUnits(),
        embedTo: '#payment-embed-target',
    });
    const embedded = Boolean(options.config.embed_to);
    let lastError = null;

    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = '';
    showPaymentNotice(null);

    if (embedded) paymentSection.classList.add('embedded-mode');

    const { details } = options.transaction;
    CheckoutActivity.startRun({
        flow: I18n.t(`flows.${DemoConfig.currentFlow().id}.title`),
        transaction: [options.transaction.type, details?.authorization, details?.channel].filter(Boolean).join(' · '),
        amount: details?.amount
            ? `${DemoMoney.formatMinor(details.amount)} (${details.amount} ${DemoMoney.code()} minor units)`
            : I18n.t('booking.noAmount'),
        display: embedded ? I18n.t('booking.displayEmbedded') : I18n.t('booking.displayOverlay'),
        session: options.authenticated ? 'authenticated' : 'anonymous',
    });

    const { stay } = priceBreakdown();
    const payer = payerFromGuest(bookingState.guest);
    const recipient = DemoConfig.recipient();
    const booking = Bookings.create({
        guest: {
            name: bookingState.guest ? `${bookingState.guest.first_name} ${bookingState.guest.last_name}` : I18n.t('common.guest'),
            email: bookingState.guest?.email || '',
        },
        room: bookingState.room?.name || '',
        checkIn: stay.checkIn.toISOString(),
        checkOut: stay.checkOut.toISOString(),
        nights: stay.nights,
        guests: Stay.format.guests(),
        amount: details?.amount || 0,
        currency: DemoMoney.code(),
        flow: {
            id: DemoConfig.currentFlow().id,
            title: I18n.t(`flows.${DemoConfig.currentFlow().id}.title`),
            type: options.transaction.type,
            preauth: details?.authorization === 'preauth',
            channel: details?.channel,
        },
        session: options.authenticated ? 'authenticated' : 'anonymous',
        recipientCode: recipient.code,
        // Kept so the dashboard can resume the session with the same checkout.
        checkout: {
            transaction: options.transaction,
            config: { ...options.config, embed_to: undefined },
            styles: options.styles,
            payer,
            recipient,
        },
    });
    currentBookingId = booking.id;

    const restoreEmbedded = () => {
        if (!embedded) return;
        paymentSection.classList.remove('embedded-mode');
        document.getElementById('payment-embed-target').replaceChildren();
    };

    try {
        await FlywireCheckout.launch({
            ...options,
            recipient,
            payer,
            onComplete: ({ report, sessionId }) => {
                restoreEmbedded();
                if (report?.payment_report?.status === 'ALL_UNSUCCESSFUL') return showOutcome('declined');
                showSuccess(report, sessionId);
            },
            onCancel: () => {
                restoreEmbedded();
                if (lastError?.type === 'init_fields') {
                    showPaymentNotice(I18n.t('booking.configRejected', { detail: describeInitFieldsError(lastError.payload) }));
                }
            },
            onTimeout: () => { restoreEmbedded(); showOutcome('timeout'); },
            // Checkout stays open on errors so the guest can retry; the outcome arrives via on_end.
            onError: (error) => { lastError = error; },
            onEvent: (name, detail) => {
                CheckoutActivity.record(name, detail);
                Bookings.trackCheckout(booking.id, name, detail);
            },
        });
    } catch (err) {
        console.error('Checkout launch failed:', err);
        CheckoutActivity.record('launch_failed', { error: err.message });
        Bookings.update(booking.id, { checkoutStatus: 'failed', error: err.message });
        restoreEmbedded();
        showPaymentNotice(I18n.t('booking.couldNotStart', { detail: err.message }));
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        updatePaymentOption();
    }
}

function describeInitFieldsError(payload) {
    if (!payload || typeof payload !== 'object') return String(payload);
    return Object.entries(payload).map(([field, messages]) => `${field}: ${[].concat(messages).join(', ')}`).join('; ');
}

function payerFromGuest(guest) {
    if (!guest) return undefined;
    return {
        first_name: guest.first_name,
        last_name: guest.last_name,
        email: guest.email,
        phone: guest.phone,
        address: guest.address,
        city: guest.city,
        zip: guest.zip,
        country: guest.country
    };
}

function handleRetry() {
    showView('booking');
}

// ── Outcomes ──

const SUCCESS_COPY = {
    payment: { eyebrow: 'success.eyebrowPaid', note: (amt) => I18n.t('success.notePaid', { amount: amt }) },
    preauth: { eyebrow: 'success.eyebrowHold', note: (amt) => I18n.t('success.noteHold', { amount: amt }) },
    saveCard: { eyebrow: 'success.eyebrowCard', note: () => I18n.t('success.noteCard') },
    moto: { eyebrow: 'success.eyebrowPaid', note: (amt) => I18n.t('success.noteMoto', { amount: amt }) },
};

const CARD_ON_FILE_NOTE = {
    tokenization: 'success.cardSaved',
    optional_tokenization: 'success.cardSavedIfChosen',
    implicit_tokenization: 'success.cardKeptWhereSupported',
};

function showSuccess(report, sessionId) {
    const flow = DemoConfig.currentFlow();
    const copy = flow.noAmount ? SUCCESS_COPY.saveCard
        : flow.preauth ? SUCCESS_COPY.preauth
        : flow.channel === 'moto' ? SUCCESS_COPY.moto
        : SUCCESS_COPY.payment;
    const cardNote = flow.noAmount ? '' : (CARD_ON_FILE_NOTE[flow.type] ? I18n.t(CARD_ON_FILE_NOTE[flow.type]) : '');

    document.getElementById('success-eyebrow').textContent = I18n.t(copy.eyebrow);
    document.getElementById('success-payment-note').textContent = copy.note(DemoMoney.formatMinor(chargeMinorUnits())) + cardNote;

    renderFlywireResult(report, sessionId, flow);
    showView('success');
}

function renderFlywireResult(report, sessionId, flow) {
    const rows = [[I18n.t('success.resultBooking'), currentBookingId || I18n.t('common.dash')], [I18n.t('success.resultFlow'), I18n.t(`flows.${flow.id}.title`)]];
    if (sessionId) rows.push([I18n.t('success.resultSession'), sessionId]);
    if (report?.session_report?.status) rows.push([I18n.t('success.resultSessionStatus'), report.session_report.status]);
    if (report?.payment_report?.status) rows.push([I18n.t('success.resultPaymentStatus'), report.payment_report.status]);
    const method = report?.payment_report?.payment_watchlist?.[0];
    if (method) rows.push([I18n.t('success.resultMethod'), CardBrands.describe(CardBrands.withSavedCard(method, report))]);

    const list = document.getElementById('flywire-result-list');
    list.replaceChildren(...rows.flatMap(([term, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        if (value instanceof Node) dd.append(value);
        else dd.textContent = value;
        return [dt, dd];
    }));
    document.getElementById('flywire-dashboard-link').href = `/dashboard/#${currentBookingId || ''}`;
    document.getElementById('flywire-result').hidden = false;
}

const OUTCOME_COPY = {
    declined: {
        icon: '\u2715',
        title: 'error.declinedTitle',
        subtitle: 'error.declinedSubtitle',
        message: 'error.declinedMessage',
    },
    timeout: {
        icon: '\u29D6',
        title: 'error.timeoutTitle',
        subtitle: 'error.timeoutSubtitle',
        message: 'error.timeoutMessage',
    },
};

function showOutcome(kind) {
    const copy = OUTCOME_COPY[kind];
    document.getElementById('error-icon').textContent = copy.icon;
    document.getElementById('error-title').textContent = I18n.t(copy.title);
    document.getElementById('error-subtitle').textContent = I18n.t(copy.subtitle);
    document.getElementById('error-message').innerHTML = I18n.t(copy.message);
    showView('error');
}

// ── View Management ──

function showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

    const nav = document.getElementById('nav-wrapper');

    switch (view) {
        case 'rooms':
            document.getElementById('rooms-view').classList.remove('hidden');
            nav.classList.remove('hidden');
            updateStepper(1);
            break;
        case 'guest':
            document.getElementById('guest-view').classList.remove('hidden');
            nav.classList.remove('hidden');
            updateStepper(2);
            break;
        case 'booking':
            document.getElementById('booking-view').classList.remove('hidden');
            nav.classList.remove('hidden');
            updateStepper(3);
            updateBookingView();
            break;
        case 'success':
            document.getElementById('success-view').classList.remove('hidden');
            nav.classList.add('hidden');
            if (bookingState.guest) {
                document.getElementById('success-guest-greeting').textContent = I18n.t('success.welcome', {
                    name: `${bookingState.guest.first_name} ${bookingState.guest.last_name}`,
                });
            }
            if (bookingState.room) {
                document.getElementById('success-suite-name').textContent = bookingState.room.name;
            }
            break;
        case 'error':
            document.getElementById('error-view').classList.remove('hidden');
            nav.classList.add('hidden');
            break;
    }

    window.scrollTo(0, 0);
}

function updateStepper(activeStep) {
    document.querySelectorAll('.stepper-step').forEach(step => {
        const num = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        if (num === activeStep) step.classList.add('active');
        else if (num < activeStep) step.classList.add('completed');
    });

    document.querySelectorAll('.stepper-line').forEach((line, i) => {
        line.classList.toggle('completed', i + 1 < activeStep);
    });
}
