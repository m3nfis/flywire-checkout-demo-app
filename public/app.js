/**
 * Demo booking flow for The Caldera House (Santorini).
 *
 * The Flywire Checkout V2 SDK integration lives in `flywire-checkout.js`.
 * `demo-config.js` is the sales drawer that picks which capability to demo.
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
    const config = await fetch('/api/config').then(r => r.json());

    DemoConfig.init(config);
    DemoConfig.onChange(updatePaymentOption);
    CheckoutActivity.init();

    Stay.init();
    Stay.onChange(() => {
        renderStay();
        DemoConfig.setBookingAmount(totalCents());
        updatePaymentOption();
    });
    renderStay();

    document.querySelectorAll('.btn-select-room').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.room-card');
            bookingState.room = {
                id: card.dataset.room,
                name: card.dataset.name,
                price: parseInt(card.dataset.price),
                size: card.dataset.size,
                viewType: card.dataset.viewType,
                image: card.dataset.image
            };
            DemoConfig.setBookingAmount(totalCents());
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
});

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

function formatDollars(amount) {
    return `$${amount.toLocaleString()}`;
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
    const { stay, price, room, extra, total } = priceBreakdown();
    const values = {
        'check-in': Stay.format.short(stay.checkIn),
        'check-out': Stay.format.short(stay.checkOut),
        'check-in-long': Stay.format.long(stay.checkIn),
        'check-out-long': Stay.format.long(stay.checkOut),
        'guests': Stay.format.guests(),
        'nightly-calc': `${Stay.format.nights(stay.nights)} × ${formatDollars(price)}`,
        'room-subtotal': `${formatDollars(room)}.00`,
        'extra-calc': `${stay.extraGuests} extra guest${stay.extraGuests === 1 ? '' : 's'} × ${formatDollars(stay.extraGuestFee)} × ${Stay.format.nights(stay.nights)}`,
        'extra-subtotal': `${formatDollars(extra)}.00`,
        'grand-total': `${formatDollars(total)}.00`,
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
        submitBtn.textContent = 'Continue to Payment';
    }
}

function updateBookingView() {
    if (bookingState.guest) {
        const name = `${bookingState.guest.first_name} ${bookingState.guest.last_name}`;
        document.getElementById('booking-guest-name').textContent = name;
    }
    if (bookingState.room) {
        document.getElementById('booking-room-name').textContent = bookingState.room.name;
    }
    renderStay();
    updatePaymentOption();
}

/** Guest-facing summary of the flow selected in the demo drawer. */
function updatePaymentOption() {
    const copy = DemoConfig.describeForGuest(formatDollars(totalDollars() || 7350));
    document.getElementById('payment-option-title').textContent = copy.title;
    document.getElementById('payment-option-desc').textContent = copy.description;
    document.getElementById('payment-option-notes').textContent = copy.notes.join(' ');

    const btn = document.getElementById('proceed-btn');
    if (!btn.classList.contains('loading')) btn.textContent = copy.cta;
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
    const btn = document.getElementById('proceed-btn');
    const paymentSection = document.getElementById('payment-section');
    const options = DemoConfig.buildCheckoutOptions({ amountCents: totalCents(), embedTo: '#payment-embed-target' });
    const embedded = Boolean(options.config.embed_to);
    let lastError = null;

    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = '';
    showPaymentNotice(null);

    if (embedded) paymentSection.classList.add('embedded-mode');

    const { details } = options.transaction;
    CheckoutActivity.startRun({
        flow: DemoConfig.currentFlow().title,
        transaction: [options.transaction.type, details?.authorization, details?.channel].filter(Boolean).join(' · '),
        amount: details?.amount ? `${formatDollars(details.amount / 100)} (${details.amount} in minor units)` : 'No amount (card saved only)',
        display: embedded ? 'Embedded in page' : 'Full-screen overlay',
        session: options.authenticated ? 'authenticated' : 'anonymous',
    });

    const { stay } = priceBreakdown();
    const payer = payerFromGuest(bookingState.guest);
    const recipient = DemoConfig.recipient();
    const booking = Bookings.create({
        guest: {
            name: bookingState.guest ? `${bookingState.guest.first_name} ${bookingState.guest.last_name}` : 'Guest',
            email: bookingState.guest?.email || '',
        },
        room: bookingState.room?.name || '',
        checkIn: stay.checkIn.toISOString(),
        checkOut: stay.checkOut.toISOString(),
        nights: stay.nights,
        guests: Stay.format.guests(),
        amount: details?.amount || 0,
        currency: 'USD',
        flow: {
            id: DemoConfig.currentFlow().id,
            title: DemoConfig.currentFlow().title,
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
                    showPaymentNotice(`Checkout rejected this configuration: ${describeInitFieldsError(lastError.payload)}`);
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
        showPaymentNotice(`Checkout could not start: ${err.message}`);
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
    payment: { eyebrow: 'Booking Confirmed', note: (amt) => `${amt} paid in full.` },
    preauth: { eyebrow: 'Reservation Held', note: (amt) => `A hold of ${amt} is on your card. You'll be charged at check-in.` },
    saveCard: { eyebrow: 'Reservation Guaranteed', note: () => 'Your card is securely saved. Nothing has been charged today.' },
    moto: { eyebrow: 'Booking Confirmed', note: (amt) => `${amt} taken by our reservations team.` },
};

const CARD_ON_FILE_NOTE = {
    tokenization: ' Your card is saved for extras during your stay.',
    optional_tokenization: ' Your card is saved if you chose to keep it.',
    implicit_tokenization: ' Your card is kept on file where supported.',
};

function showSuccess(report, sessionId) {
    const flow = DemoConfig.currentFlow();
    const copy = flow.noAmount ? SUCCESS_COPY.saveCard
        : flow.preauth ? SUCCESS_COPY.preauth
        : flow.channel === 'moto' ? SUCCESS_COPY.moto
        : SUCCESS_COPY.payment;
    const cardNote = flow.noAmount ? '' : (CARD_ON_FILE_NOTE[flow.type] || '');

    document.getElementById('success-eyebrow').textContent = copy.eyebrow;
    document.getElementById('success-payment-note').textContent = copy.note(formatDollars(totalDollars())) + cardNote;

    renderFlywireResult(report, sessionId, flow);
    showView('success');
}

function renderFlywireResult(report, sessionId, flow) {
    const rows = [['Booking', currentBookingId || '—'], ['Flow', flow.title]];
    if (sessionId) rows.push(['Session', sessionId]);
    if (report?.session_report?.status) rows.push(['Session status', report.session_report.status]);
    if (report?.payment_report?.status) rows.push(['Payment status', report.payment_report.status]);
    const method = report?.payment_report?.payment_watchlist?.[0];
    if (method) rows.push(['Payment method', CardBrands.describe(CardBrands.withSavedCard(method, report))]);

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
        title: 'Woopsie!',
        subtitle: 'Denied!',
        message: 'Your payment could not be processed.<br>Perhaps the universe is telling you to try a different card.',
    },
    timeout: {
        icon: '\u29D6',
        title: "Time's up",
        subtitle: 'Your checkout expired',
        message: 'We held your suite for as long as we could.<br>Start again to complete your booking.',
    },
};

function showOutcome(kind) {
    const copy = OUTCOME_COPY[kind];
    document.getElementById('error-icon').textContent = copy.icon;
    document.getElementById('error-title').textContent = copy.title;
    document.getElementById('error-subtitle').textContent = copy.subtitle;
    document.getElementById('error-message').innerHTML = copy.message;
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
                document.getElementById('success-guest-name').textContent =
                    `${bookingState.guest.first_name} ${bookingState.guest.last_name}`;
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
