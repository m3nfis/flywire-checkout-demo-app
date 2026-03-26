require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const API_BASE = 'https://api-platform-sandbox.flywire.com/payments/v1';
const API_KEY = process.env.FLYWIRE_API_KEY;
const RECIPIENT_ID = process.env.FLYWIRE_RECIPIENT_ID;

const DUMMY_PAYOR = {
    first_name: 'Alejandro',
    last_name: 'Serrano',
    address: 'Calle de Serrano 47',
    city: 'Madrid',
    country: 'ES',
    phone: '0034914350672',
    email: 'alejandro.serrano@example.com',
    zip: '28001'
};

let guestData = { ...DUMMY_PAYOR };

const HIDDEN_FIELDS = {
    first_name: { hidden: true, read_only: true },
    last_name: { hidden: true, read_only: true },
    address: { hidden: true, read_only: true },
    city: { hidden: true, read_only: true },
    country: { hidden: true, read_only: true },
    phone: { hidden: true, read_only: true },
    email: { hidden: true, read_only: true },
    zip: { hidden: true, read_only: true }
};

app.get('/api/config', (_req, res) => {
    res.json({ frontendKey: process.env.FLYWIRE_FRONTEND_KEY });
});

app.get('/api/guest-data', (_req, res) => {
    res.json(guestData);
});

app.post('/api/save-guest', (req, res) => {
    const fields = ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'country', 'zip'];
    const update = {};
    for (const f of fields) {
        if (req.body[f] !== undefined) update[f] = req.body[f];
    }
    guestData = { ...guestData, ...update };
    res.json({ success: true });
});

app.post('/api/create-session', async (req, res) => {
    const { paymentType } = req.body;

    const body = {
        schema: 'cards',
        payor: guestData,
        options: {
            form: {
                locale: 'en',
                show_flywire_logo: false,
                payor_fields_read_only: true,
                payor_fields: HIDDEN_FIELDS
            }
        },
        recipient: {
            fields: [
                { id: 'booking_reference', value: 'CALDERA-0415' }
            ]
        },
        recipient_id: RECIPIENT_ID,
        payor_id: 'GUEST-2026-0415',
        external_reference: 'CALDERA-HOUSE-0415'
    };

    switch (paymentType) {
        case 'one_off':
            body.type = 'one_off';
            body.charge_intent = { mode: 'one_off' };
            body.items = [{ id: 'default', amount: 735000 }];
            body.options.form.action_button = 'pay';
            break;

        case 'tokenization':
            body.type = 'tokenization';
            body.charge_intent = { mode: 'subscription' };
            body.options.form.action_button = 'save';
            break;

        case 'pre_auth':
            body.type = 'one_off';
            body.charge_intent = { mode: 'one_off', authorization: 'preauth', capture: 'manual' };
            body.items = [{ id: 'default', amount: 735000 }];
            body.options.form.action_button = 'pay';
            break;

        default:
            return res.status(400).json({ error: 'Invalid payment type' });
    }

    try {
        const response = await fetch(`${API_BASE}/checkout/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Authentication-Key': API_KEY
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Flywire API error:', JSON.stringify(data, null, 2));
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

app.post('/api/confirm-session', async (req, res) => {
    const { confirmUrl } = req.body;

    if (!confirmUrl) {
        return res.status(400).json({ error: 'Missing confirmUrl' });
    }

    try {
        const response = await fetch(confirmUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Authentication-Key': API_KEY
            }
        });

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Confirm error:', err);
        res.status(500).json({ error: 'Failed to confirm session' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
