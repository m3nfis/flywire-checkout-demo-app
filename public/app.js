let frontendKey = null;
let currentElement = null;

const bookingState = {
    room: null,
    guest: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const config = await fetch('/api/config').then(r => r.json());
    frontendKey = config.frontendKey;

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
    document.getElementById('back-to-guest').addEventListener('click', () => {
        resetPaymentSection();
        showView('guest');
    });

    document.querySelectorAll('.payment-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    document.getElementById('proceed-btn').addEventListener('click', handleProceed);
    document.getElementById('retry-btn').addEventListener('click', handleRetry);
    document.getElementById('back-btn').addEventListener('click', handleBack);
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

// ── Flywire Payment ──

async function waitForSDK(timeout = 15000) {
    const start = Date.now();
    while (!window.FlywireSDK) {
        if (Date.now() - start > timeout) throw new Error('Flywire SDK did not load');
        await new Promise(r => setTimeout(r, 100));
    }
}

async function handleProceed() {
    const selected = document.querySelector('input[name="payment-type"]:checked').value;
    const btn = document.getElementById('proceed-btn');

    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = '';

    try {
        const res = await fetch('/api/create-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentType: selected })
        });

        const session = await res.json();

        if (!res.ok) {
            console.error('Session creation failed:', session);
            throw new Error(session.error || 'Failed to create session');
        }

        await renderPaymentElement(session.id);
    } catch (err) {
        console.error(err);
        showView('error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'Continue to Payment';
    }
}

async function renderPaymentElement(sessionId) {
    await waitForSDK();

    const sdk = await window.FlywireSDK(frontendKey);

    const elements = await sdk.elements({
        appearance: {
            fonts: [{
                url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap',
                fontFamily: 'Inter',
            }],
            variables: { primaryColor: '#B09B71' },
        },
        locale: 'en',
    });

    currentElement = await elements.create('payment', {
        sessionId,
        displayMode: 'container',
        fields: {
            first_name: { hidden: true, readOnly: true },
            last_name: { hidden: true, readOnly: true },
            address: { hidden: true, readOnly: true },
            city: { hidden: true, readOnly: true },
            country: { hidden: true, readOnly: true },
            state: { hidden: true, readOnly: true },
            phone: { hidden: true, readOnly: true },
            email: { hidden: true, readOnly: true },
            zip: { hidden: true, readOnly: true },
        },
    });

    currentElement.onEvent('success', handleSuccess);
    currentElement.onEvent('error', handleError);

    document.getElementById('payment-options').classList.add('hidden');
    document.getElementById('proceed-btn').classList.add('hidden');
    document.getElementById('payment-container').classList.add('active');
    document.getElementById('back-btn').classList.remove('hidden');
    document.getElementById('back-to-guest').classList.add('hidden');

    const summary = document.querySelector('.booking-summary');
    summary.style.maxHeight = summary.scrollHeight + 'px';
    requestAnimationFrame(() => summary.classList.add('collapsed'));

    currentElement.mount('payment-container');

    autoResizeIframe();
}

function autoResizeIframe() {
    const container = document.getElementById('payment-container');

    const observer = new MutationObserver(() => {
        const iframe = container.querySelector('iframe');
        if (iframe) {
            iframe.style.width = '100%';
            iframe.style.border = 'none';
            iframe.removeAttribute('height');
            iframe.removeAttribute('scrolling');

            const wrapper = iframe.parentElement;
            if (wrapper) {
                wrapper.style.overflow = 'visible';
                wrapper.style.maxHeight = 'none';
                wrapper.style.height = 'auto';
            }

            observer.disconnect();
        }
    });

    observer.observe(container, { childList: true, subtree: true });
}

async function handleSuccess(result) {
    if (result.confirm_url) {
        fetch('/api/confirm-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmUrl: result.confirm_url.url }),
        }).catch(console.error);
    }

    showView('success');
}

function handleError(error) {
    console.error('Payment error:', error);
    showView('error');
}

function handleRetry() {
    showView('booking');
    resetPaymentSection();
}

function handleBack() {
    resetPaymentSection();
}

function resetPaymentSection() {
    document.getElementById('payment-options').classList.remove('hidden');
    document.getElementById('proceed-btn').classList.remove('hidden');
    document.getElementById('back-btn').classList.add('hidden');
    document.getElementById('back-to-guest').classList.remove('hidden');
    document.getElementById('payment-container').classList.remove('active');
    document.getElementById('payment-container').innerHTML = '';

    const summary = document.querySelector('.booking-summary');
    summary.classList.remove('collapsed');
    summary.style.maxHeight = '';

    currentElement = null;
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
