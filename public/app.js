/**
 * Demo booking flow for The Caldera House (Santorini).
 *
 * The Flywire Checkout V2 SDK integration lives in `flywire-checkout.js`.
 * This file is just the demo host: it manages the room/guest/payment views
 * and forwards the chosen payment option to `FlywireCheckout.launch()`.
 *
 * If you're here to learn the SDK integration, read `flywire-checkout.js`
 * first and then `server.js` (`/api/flywire-session` proxy). This file is
 * illustrative "host app" code, not part of the integration surface.
 */

let flywireConfig = { client_id: null, code: null };

const bookingState = {
    room: null,
    guest: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const config = await fetch('/api/config').then(r => r.json());
    flywireConfig.client_id = config.client_id;
    flywireConfig.code = config.code;

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
            showView('guest');
            prefillGuestForm();
            updateGuestSummary();
        });
    });

    document.getElementById('guest-form').addEventListener('submit', handleGuestSubmit);
    document.getElementById('back-to-rooms').addEventListener('click', () => showView('rooms'));
    document.getElementById('back-to-guest').addEventListener('click', () => showView('guest'));

    document.querySelectorAll('.payment-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    document.getElementById('proceed-btn').addEventListener('click', handleProceed);
    document.getElementById('retry-btn').addEventListener('click', handleRetry);
});

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
    document.getElementById('summary-price-night').textContent = `$${price.toLocaleString()}`;

    const total = price * 3;
    document.getElementById('summary-total').textContent = `$${total.toLocaleString()}.00`;
    document.getElementById('summary-grand-total').textContent = `$${total.toLocaleString()}.00`;
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
        const { name, price } = bookingState.room;
        const total = price * 3;
        document.getElementById('booking-room-name').textContent = name;
        document.getElementById('booking-nightly-calc').innerHTML = `3 nights &times; $${price.toLocaleString()}`;
        document.getElementById('booking-subtotal').textContent = `$${total.toLocaleString()}.00`;
        document.getElementById('booking-total').textContent = `$${total.toLocaleString()}.00`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand-off to the Flywire Checkout V2 integration (see public/flywire-checkout.js).
// The radio button `value` attributes match `FlywireCheckout.launch({ flow })`
// directly: 'payment' | 'tokenization' | 'preauth'.
// ─────────────────────────────────────────────────────────────────────────────

async function handleProceed() {
    const flow = document.querySelector('input[name="payment-type"]:checked').value;
    const embedded = document.getElementById('display-mode-toggle').checked;
    const btn = document.getElementById('proceed-btn');
    const paymentSection = document.getElementById('payment-section');

    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = '';

    if (embedded) paymentSection.classList.add('embedded-mode');

    const restoreEmbedded = () => {
        if (!embedded) return;
        paymentSection.classList.remove('embedded-mode');
        document.getElementById('payment-embed-target').replaceChildren();
    };

    try {
        const total = bookingState.room.price * 3;

        await FlywireCheckout.launch({
            flow,
            recipient: { client_id: flywireConfig.client_id, code: flywireConfig.code },
            amount: Math.round(total * 100),
            payer: payerFromGuest(bookingState.guest),
            embedTo: embedded ? '#payment-embed-target' : undefined,
            onSuccess: () => { restoreEmbedded(); showView('success'); },
            onCancel: () => { restoreEmbedded(); },
            onError: () => { restoreEmbedded(); showView('error'); },
        });
    } catch (err) {
        console.error('Checkout launch failed:', err);
        restoreEmbedded();
        showView('error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'Continue to Payment';
    }
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
        country: guest.country
    };
}

function handleRetry() {
    showView('booking');
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
