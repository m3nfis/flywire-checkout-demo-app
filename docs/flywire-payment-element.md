# Flywire Payment Element - Developer Reference

> Source: https://developers.flywire.com/travel-b2b/Content/element-payment.htm
> Checkout Sessions API: https://developers.flywire.com/travel-b2b/Content/resource_checkout-sessions.htm
> Last updated: March 13, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [SDK Setup](#sdk-setup)
3. [Checkout Session Types](#checkout-session-types)
4. [Creating a Checkout Session (API)](#creating-a-checkout-session-api)
5. [Confirming a Checkout Session (API)](#confirming-a-checkout-session-api)
6. [Smart Rendering (JavaScript)](#smart-rendering-javascript)
7. [iframe Rendering](#iframe-rendering)
8. [Element Appearance & Customization](#element-appearance--customization)
9. [Element Configuration](#element-configuration)
10. [Field Visibility & Read-Only Controls](#field-visibility--read-only-controls)
11. [Payer Fields Reference](#payer-fields-reference)
12. [Event Handlers](#event-handlers)
13. [Mounting the Element](#mounting-the-element)
14. [PostMessage Reference](#postmessage-reference)
15. [Direct Debit Specifics](#direct-debit-specifics)
16. [Bank Transfer Specifics](#bank-transfer-specifics)
17. [iframe Dimensions Reference](#iframe-dimensions-reference)

---

## Overview

The Flywire Payment Element renders payment forms that collect payer and payment information. The element type is determined by the **Checkout Session** you create. The flow is:

1. **Create a Checkout Session** (backend API call) → returns `session ID` and `hosted_form.url`
2. **Render the element** on your page (Smart Rendering via SDK, or iframe)
3. **Payer fills the form** and submits
4. **Receive postMessage** with `confirm_url`
5. **Confirm the Checkout Session** (backend API call to `confirm_url`)
6. **Receive payment status** via callback notifications (webhook)

### API Base URLs

| Environment | Base URL |
|-------------|----------|
| Production  | `https://api-platform.flywire.com/payments/v1/` |
| Sandbox     | `https://api-platform-sandbox.flywire.com/payments/v1/` |

### Authentication

All API requests use the `X-Authentication-Key` header:

```
X-Authentication-Key: {api_key}
```

---

## SDK Setup

### SDK Script URLs

| Environment | URL |
|-------------|-----|
| Production  | `https://artifacts.flywire.com/sdk/js/v0/main.js` |
| Sandbox     | `https://artifacts.flywire.com/sdk/js/v0/sandbox.main.js` |

Add to the `<head>` of your page:

```html
<script src="https://artifacts.flywire.com/sdk/js/v0/sandbox.main.js"></script>
```

### Initialize the SDK

```javascript
var sdk = await window.FlywireSDK("your-frontend-key-here");
```

---

## Checkout Session Types

### For Cards

| Use Case | Session `type` | Session `schema` | Extra params |
|----------|---------------|------------------|--------------|
| Tokenization (save card) | `tokenization` | `cards` | `charge_intent.mode` required |
| Tokenization & pay (save + first payment) | `tokenization_and_pay` | `cards` | `charge_intent.mode` required |
| New mandate (reuse saved card for new plan) | `new_mandate` | `cards` | Requires existing `payment_method_token` |
| Pre-Authorization | `one_off` | `cards` | `charge_intent.authorization`: `preauth` |
| One Off Payment | `one_off` | `cards` | `charge_intent.mode`: `one_off` |

### For Direct Debit

| Use Case | Session `type` | Session `schema` |
|----------|---------------|------------------|
| SEPA tokenization | `tokenization` | `dd_sepa` |
| BACS tokenization | `tokenization` | `dd_bacs` |
| ACH tokenization | `tokenization` | `dd_ach` |
| EFT Canada tokenization | `tokenization` | `dd_eft` |
| SEPA tokenization & pay | `tokenization_and_pay` | `dd_sepa` |
| BACS tokenization & pay | `tokenization_and_pay` | `dd_bacs` |
| ACH tokenization & pay | `tokenization_and_pay` | `dd_ach` |
| EFT Canada tokenization & pay | `tokenization_and_pay` | `dd_eft` |
| SEPA one off | `one_off` | `dd_sepa` |
| BACS one off | `one_off` | `dd_bacs` |
| ACH one off | `one_off` | `dd_ach` |

### For Bank Transfer

| Use Case | Session `type` | Session `schema` |
|----------|---------------|------------------|
| Standard bank transfer | `one_off` | `bank_transfer` |
| SPEI bank transfer (Mexico only) | `one_off` | `bank_transfer_spei` |

---

## Creating a Checkout Session (API)

**Endpoint:** `POST /payments/v1/checkout/sessions`

### Card Tokenization Example

```bash
curl https://api-platform-sandbox.flywire.com/payments/v1/checkout/sessions \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Authentication-Key: {api_key}" \
  -d '{
    "type": "tokenization",
    "schema": "cards",
    "charge_intent": {
       "mode": "subscription"
    },
    "payor": {
        "first_name": "Peter",
        "last_name": "Payer",
        "address": "123 High Street",
        "city": "London",
        "country": "GB",
        "state": "",
        "phone": "0044123456789",
        "email": "peter@example.com",
        "zip": "SW1A 1AA"
    },
    "options": {
        "form": {
            "action_button": "save",
            "locale": "en",
            "show_flywire_logo": true,
            "payor_fields_read_only": true,
            "payor_fields": {
                "first_name": {
                    "hidden": false,
                    "read_only": false
                },
                "last_name": {
                    "hidden": true,
                    "read_only": false
                }
            }
        }
    },
    "payor_id": "MyPayerID",
    "recipient_id": "FLW"
}'
```

### Tokenization & Pay Example

```bash
curl https://api-platform-sandbox.flywire.com/payments/v1/checkout/sessions \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Authentication-Key: {api_key}" \
  -d '{
    "type": "tokenization_and_pay",
    "schema": "cards",
    "charge_intent": {
        "mode": "subscription"
    },
    "payor": {
        "first_name": "Peter",
        "last_name": "Payer",
        "address": "123 High Street",
        "city": "London",
        "country": "GB",
        "state": "",
        "phone": "0044123456789",
        "email": "peter@example.com",
        "zip": "SW1A 1AA"
    },
    "options": {
        "form": {
            "action_button": "save",
            "locale": "en",
            "show_flywire_logo": true,
            "show_amount_to": false,
            "payor_fields_read_only": true,
            "payor_fields": {
                "first_name": {
                    "hidden": false,
                    "read_only": false
                },
                "last_name": {
                    "hidden": true,
                    "read_only": false
                }
            }
        }
    },
    "recipient": {
        "fields": [
            {
                "id": "custom_field_1",
                "value": "ID12345"
            },
            {
                "id": "custom_field_2",
                "value": "2020"
            }
        ]
    },
    "items": [
        {
            "id": "default",
            "amount": 33000
        }
    ],
    "notifications_url": "https://your-webhook-url.com/callback",
    "external_reference": "Payment ID12456",
    "recipient_id": "FLW",
    "payor_id": "MyPayerID"
}'
```

### Request Body Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | `tokenization`, `tokenization_and_pay`, `new_mandate`, `one_off` |
| `schema` | string | `cards`, `dd_sepa`, `dd_bacs`, `dd_eft`, `dd_ach`, `bank_transfer`, `bank_transfer_spei` |
| `charge_intent.mode` | string | `installment`, `subscription`, `unscheduled`, `one_off` |
| `charge_intent.capture` | string | `manual` (for pre-auth only) |
| `charge_intent.authorization` | string | `preauth` (default) or `final` (for pre-auth only) |
| `payor` | object | Payer details for pre-filling (see Payer Fields Reference) |
| `options.form` | object | Form display settings |
| `recipient_id` | string | Portal code (3 letters or 5 alphanumeric starting with letter) |
| `payor_id` | string | Unique payer identifier (no spaces) |
| `recipient.fields` | array | Custom recipient fields `[{id, value}]` |
| `items` | array | Items array, use `[{id: "default", amount: <subunits>}]` |
| `notifications_url` | string | Webhook URL for payment status callbacks |
| `external_reference` | string | Your reference ID (max 50 chars) |

### `charge_intent.mode` Values

| Mode | Frequency | Purchase | Delivery |
|------|-----------|----------|----------|
| `installment` | Regular or irregular intervals | Single purchase | Single delivery |
| `subscription` | Regular intervals | Multiple purchases | Multiple and regular deliveries |
| `unscheduled` | No pre-agreed intervals | Multiple purchases | Multiple deliveries at no pre-agreed intervals |
| `one_off` | One time | Single purchase | Single delivery |

### Response

```json
{
  "id": "494d2e9d-c0c9-407c-9094-5b3b2a02c00f",
  "expires_in_seconds": 1800,
  "hosted_form": {
    "url": "https://elements.flywire.com/v1/form?session_id=494d2e9d-c0c9-407c-9094-5b3b2a02c00f",
    "method": "GET"
  },
  "warnings": []
}
```

| Field | Description |
|-------|-------------|
| `id` | Session ID (used for Smart Rendering) |
| `expires_in_seconds` | Time before session expires |
| `hosted_form.url` | URL for iframe rendering |
| `warnings` | Array of validation warnings |

---

## Confirming a Checkout Session (API)

**Endpoint:** `POST /payments/v1/checkout/sessions/{ID}/confirm`

After the payer submits the form, you receive a `confirm_url` in the postMessage. Call this URL to confirm the session:

```bash
curl https://api-platform.flywire.com/payments/v1/checkout/sessions/{session_id}/confirm \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Authentication-Key: {api_key}"
```

> A successful postMessage confirms that the form was submitted. It does **not** indicate payment success. Payment status updates are sent via callback notifications.

---

## Smart Rendering (JavaScript)

### Full Example Page

```html
<!DOCTYPE html>
<head>
    <script src="https://artifacts.flywire.com/sdk/js/v0/sandbox.main.js"></script>
</head>
<body>
    <div id="my-container-id"></div>

    <script type="module" crossorigin="anonymous" async type="text/javascript">
        (async () => {
            // 1. Initialize SDK with frontend key
            var sdk = await window.FlywireSDK("your-frontend-key-here");

            // 2. Configure appearance
            var elements = await sdk.elements({
                appearance: {
                    fonts: [
                        {
                            url: "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700&display=swap",
                            fontFamily: "Roboto",
                        },
                    ],
                    variables: { primaryColor: "#5a81f0" },
                },
                locale: "en",
            });

            // 3. Create payment element
            var element = await elements.create("payment", {
                sessionId: "your-session-id-here",
                displayMode: "container",
                fields: {
                    first_name: { hidden: true, readOnly: true },
                    last_name: { hidden: true, readOnly: true },
                    country: { hidden: false, readOnly: true },
                    address: { hidden: false, readOnly: true },
                    city: { hidden: false, readOnly: true },
                    phone: { hidden: false, readOnly: false },
                    email: { hidden: false, readOnly: false },
                    state: { hidden: false, readOnly: false },
                    zip: { hidden: false, readOnly: false }
                },
            });

            // 4. Event handlers
            element.onEvent("success", (sessionResult) => {
                fetch('/your-backend-endpoint', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sessionResult),
                });
                alert("Your payment was created.");
            });

            element.onEvent("error", (error) => {
                fetch('/your-backend-endpoint', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(error),
                });
                alert("Something went wrong. Please try again.");
            });

            // 5. Mount
            element.mount("my-container-id");
        })();
    </script>
</body>
</html>
```

### Available Element Types

| Element | Description |
|---------|-------------|
| `payment` | Payment form (card, direct debit, bank transfer) |
| `paymentInstructions` | Bank transfer instructions display |

---

## iframe Rendering

### Full Example Page

```html
<!DOCTYPE html>
<head>
    <style>
        .my-iframe {
            padding: 18px;
            margin: 32px 0px;
            background: #FFFFFF;
        }
    </style>
</head>
<body>
    <iframe
        src="{hostedFormUrl}"
        id="flywireform"
        title="Flywire Payment Form"
        class="my-iframe"
        height="928"
        width="660">
    </iframe>

    <script>
        window.addEventListener("message", (event) => {
            if (event.origin.indexOf(".flywire.com")) {
                const result = event.data;
                if (result.source !== 'checkout_session') {
                    return;
                }

                if (result.success && result.confirm_url) {
                    const confirm_url = result.confirm_url;
                    console.log("Confirm URL:", confirm_url.url);
                } else {
                    console.error("Session unsuccessful or confirm_url missing.");
                }
            }
        });
    </script>
</body>
</html>
```

---

## Element Appearance & Customization

### Customization Options

All element types support: **Fonts**, **Colors**, **Action button label**, **Locale**, **Hide Flywire logo**.

Card and Direct Debit (except `new_mandate`) also support: **Hide fields**.

### Appearance Configuration

```javascript
var elements = await sdk.elements({
    appearance: {
        fonts: [
            {
                url: "https://fonts.googleapis.com/css2?family=Roboto:wght@0,100;0,300;0,400;0,500;0,700&display=swap",
                fontFamily: "Roboto",
            },
        ],
        variables: { primaryColor: "#5a81f0" },
    },
    locale: "en",
});
```

| Property | Description |
|----------|-------------|
| `appearance.fonts[].url` | Google Font URL or same-origin URL |
| `appearance.fonts[].fontFamily` | CSS font-family name (must match URL) |
| `appearance.variables.primaryColor` | Hex color for radio buttons, links, action button |
| `locale` | Language code (see below) |

### Locale Values

| Language | Value |
|----------|-------|
| English | `en` |
| Spanish | `es` |
| Chinese | `zh` |
| Korean | `ko` |
| Portuguese | `pt` |
| Japanese | `ja` |
| French | `fr` |
| Bahasa Indonesia | `id` |
| Vietnamese | `vi` |

### Form Options (Checkout Session API)

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.form.action_button` | string | `save` (default), `next`, `pay`, or custom text (max 50 chars, UTF-8, no punctuation/special symbols) |
| `options.form.locale` | string | Language code |
| `options.form.show_flywire_logo` | boolean | Show "Powered by Flywire" logo |
| `options.form.show_amount_to` | boolean | Show amount merchant receives (default `true`) |
| `options.form.payor_fields_read_only` | boolean | Make all payer fields read-only |
| `options.form.payor_fields` | object | Per-field `hidden`/`read_only` settings |

---

## Element Configuration

### Create Element

```javascript
var element = await elements.create("payment", {
    sessionId: "your-session-id-here",
    displayMode: "container",
    fields: {
        first_name: { hidden: true, readOnly: true },
        last_name: { hidden: true, readOnly: true },
        country: { hidden: false, readOnly: true },
        address: { hidden: false, readOnly: true },
        city: { hidden: false, readOnly: true },
        phone: { hidden: false, readOnly: false },
        email: { hidden: false, readOnly: false },
        state: { hidden: false, readOnly: false },
        zip: { hidden: false, readOnly: false }
    },
});
```

### Display Modes

| Mode | Description |
|------|-------------|
| `container` | Embeds element in a container on your page |
| `full-screen` | Displays element as a full-screen modal pop-up (default) |

---

## Field Visibility & Read-Only Controls

Fields can be controlled at **three levels** (highest priority wins):

1. **Smart Rendering settings** (highest priority) - set in `elements.create()` `fields` option
2. **Individual field settings** - set in Checkout Session `options.form.payor_fields`
3. **Global form settings** - set in Checkout Session `options.form.payor_fields_read_only`

### Smart Rendering Fields (JavaScript)

```javascript
fields: {
    first_name: { hidden: false, readOnly: false },
    // hidden: true = field hidden, false = field shown (default)
    // readOnly: true = field read-only, false = field editable (default)
}
```

### Checkout Session Individual Fields (API)

```json
"payor_fields": {
    "first_name": {
        "hidden": false,
        "read_only": false
    }
}
```

### Available Fields

`first_name`, `last_name`, `business_name` (direct debit business accounts only), `address`, `city`, `country`, `state`, `phone`, `email`, `zip`

### Automatic Field Unlocking

If settings would prevent form submission (e.g., hidden field with invalid/missing value), the field automatically becomes visible and editable.

---

## Payer Fields Reference

### Pre-fill Parameters (Checkout Session API)

| Field | Parameter | Validation |
|-------|-----------|------------|
| First name | `payor.first_name` | Latin A-Z, 0-9. Max 256 chars |
| Last name | `payor.last_name` | Latin A-Z, 0-9. Max 256 chars |
| Address | `payor.address` | Latin A-Z, 0-9, comma, slash, hyphen. No PO boxes |
| City | `payor.city` | Latin A-Z, 0-9. Max 256 chars. Must contain a vowel and >1 char |
| Post code | `payor.zip` | US: exactly 5 digits. Other: max 10 digits/chars |
| Country | `payor.country` | ISO 3166-1 alpha-2 (e.g., `US`, `GB`) |
| State | `payor.state` | Second part of ISO 3166-2 (e.g., `NY`). Only for US/China |
| Email | `payor.email` | Latin A-Z, 0-9, `+`, `_`. Max 256 chars |
| Phone | `payor.phone` | Prefix country code with `00` (e.g., `0044123456789` → code `44`, number `123456789`). Max 15 digits |

### Card-Specific Fields (UI only)

| Field | Validation |
|-------|------------|
| Card Number | Valid card numbers only |
| Expiry Date | MM/YY format, cannot be in the past |
| CVV | Card verification value |

### Direct Debit Fields (by scheme)

| Scheme | Fields |
|--------|--------|
| SEPA | IBAN (validated against country), BIC code (8 or 11 chars, only for non-EEA countries) |
| ACH | Routing number, Account number, Account type (checking/savings) |
| BACS | Account number, Sort code (format: `00-00-00`) |
| EFT Canada | Handled via Plaid third-party redirect |

### Non-EEA Countries (require BIC for SEPA)

Andorra, Monaco, San Marino, Switzerland, United Kingdom, Vatican City

### Account Type for Direct Debit

| `account_holder_type` | Displayed Fields |
|-----------------------|------------------|
| `business` | Business Name |
| `personal` | First Name, Last Name |

Pre-fill parameter: `account_holder_type`
Business name parameter: `business_name`

---

## Event Handlers

### Smart Rendering Events

```javascript
// Success: form submitted, ready to confirm session
element.onEvent("success", (sessionResult) => {
    // sessionResult contains confirm_url
    // MANDATORY: Send to backend to confirm the Checkout Session
    fetch('/your-backend-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionResult),
    });
});

// Error: something went wrong or payer closed the element
element.onEvent("error", (error) => {
    // MANDATORY: Send error to backend for troubleshooting
    fetch('/your-backend-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
    });
});
```

### iframe Event Listener

```javascript
window.addEventListener("message", (event) => {
    if (event.origin.indexOf(".flywire.com")) {
        const result = event.data;
        if (result.source !== 'checkout_session') return;

        if (result.success && result.confirm_url) {
            const confirm_url = result.confirm_url;
            // Send confirm_url to your backend
        } else {
            console.error("Session unsuccessful or confirm_url missing.");
        }
    }
});
```

---

## Mounting the Element

### Full-screen (pop-up)

```javascript
// displayMode must be "full-screen" (default)
element.mount();
```

### In a Container

```javascript
// displayMode must be "container"
// Container element with matching ID must exist in DOM
element.mount("my-container-id");
```

```html
<div id="my-container-id"></div>
```

---

## PostMessage Reference

### Success PostMessage Structure

```json
{
  "confirm_url": {
    "method": "POST",
    "url": "https://api-platform.flywire.com/payments/v1/checkout/sessions/{session_id}/confirm"
  },
  "payor": {
    "email": "payer@example.com"
  },
  "source": "checkout_session",
  "success": true
}
```

| Field | Description |
|-------|-------------|
| `confirm_url.method` | Always `POST` |
| `confirm_url.url` | Full URL to confirm the session |
| `payor.email` | Email entered by payer (may differ from pre-filled value) |
| `source` | Always `checkout_session` (use to filter postMessages in iframe) |
| `success` | `true` = successful, `false` = failed |

---

## Direct Debit Specifics

### Supported Schemes

| Scheme | Region | Currency |
|--------|--------|----------|
| SEPA | 36 Eurozone countries | EUR |
| BACS | United Kingdom | GBP |
| ACH | United States | USD |
| EFT Canada | Canada | CAD (via Plaid) |

### Direct Debit Flow

1. Payer fills in payer + bank account info
2. Payer reviews mandate info ("Review mandate info" screen)
3. Payer confirms or edits
4. For EFT Canada: payer is redirected to Plaid for bank connection

---

## Bank Transfer Specifics

### Two Variants

| Schema | Use Case |
|--------|----------|
| `bank_transfer` | Standard international and local transfers (US, UK, Europe, etc.) |
| `bank_transfer_spei` | Domestic Mexico SPEI payments only (provides 18-digit CLABE) |

### Bank Transfer Flow

1. Payer fills in payer details
2. Bank transfer instructions are displayed
3. Payer transfers money based on instructions
4. Instructions can be re-displayed using the Instructions Element (`paymentInstructions`)
5. Download option includes authorization letter if required

---

## iframe Dimensions Reference

### Payment Elements

| Form | Type | Height | Width |
|------|------|--------|-------|
| Card | tokenization | 823 | 660 |
| Card | tokenization and pay | 1010 | 660 |
| Card | new mandate | 320 | 660 |
| Direct debit | SEPA tokenization | 835 | 660 |
| Direct debit | SEPA tokenization and pay | 968 | 660 |
| Direct debit | BACS tokenization | 928 | 660 |
| Direct debit | EFT Canada tokenization | 928 | 660 |
| Direct debit | ACH tokenization | 928 | 660 |
| Bank transfer | bank_transfer | 835 | 660 |

### Instructions Element

| Type | Height | Width |
|------|--------|-------|
| Bank transfer instructions | 835 | 660 |

---

## Amount Handling

- Amounts are specified in **subunits** (smallest unit of the currency)
- Example: 12025 cents = $120.25 USD
- Subunit-to-unit ratio varies by currency (not always 100)
- Use `show_amount_to` parameter to control visibility of the merchant-received amount

---

## Callback Notifications

- Callback URLs can be **static** (portal-level) or **dynamic** (per-payment via `notifications_url`)
- Both can be active simultaneously
- Dynamic URLs do **not** apply to Payment Request payments
- Set callback version to 2
- `external_reference` is included in all status notifications

| Static URL | Dynamic URL | Result |
|------------|-------------|--------|
| Set | Not set | Callbacks to static URL |
| Set | Set | Callbacks to both URLs |
| Not set | Set | Callbacks to dynamic URL only |
| Not set | Not set | No callbacks |

---

## Recipient Configuration

### Get Available Recipients

```
GET /payments/v1/recipients
```

### Get Recipient Details (required fields)

```
GET /payments/v1/recipients/{recipientId}
```

Required fields have `required: true` in the response.

### Recipient ID Format

- 3 letters (e.g., `FLW`)
- 5 alphanumeric characters starting with a letter (e.g., `ABC1D`)

---

## Quick Integration Checklist

1. [ ] Obtain API key and frontend key from Flywire
2. [ ] Identify your `recipient_id` (portal code)
3. [ ] Choose rendering method: Smart Rendering (recommended) or iframe
4. [ ] Backend: Create Checkout Session via API
5. [ ] Frontend: Load SDK script / set up iframe
6. [ ] Frontend: Initialize element with session ID / hosted form URL
7. [ ] Frontend: Handle success and error events
8. [ ] Backend: Confirm Checkout Session using `confirm_url` from postMessage
9. [ ] Backend: Set up webhook endpoint for payment status notifications
10. [ ] Handle mandatory payer emails (for tokenization flows)
