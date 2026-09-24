# QA handoff — Caldera House · Flywire Checkout V2 demo

This demo is used by Flywire sales to show Checkout V2 (Commercial Payex v2) to travel clients. Most features were built and checked with simulated checkout results; the items below still need testing with a **real checkout and a sandbox card**, which only a person can do.

- **Booking site:** `http://localhost:<PORT>/` (rooms → guest details → payment)
- **Hotel back office:** `http://localhost:<PORT>/dashboard/`
- **Reference docs:** [Checkout V2 configuration guide](https://developers.flywire.com/travel-b2b/Content/Travel-B2B/integrations/checkout-v2.htm) · [Playground](https://checkout.demo.flywire.com/playground/)

---

## 1. Setup

1. Install **Node.js 18+** (20 recommended) and use **desktop Chrome** (DevTools is needed for evidence).
2. Clone the repo and install:
   ```bash
   npm install
   cp .env.example .env
   ```
3. Fill in `.env` (ask the demo owner for the values; never commit `.env`):

   | Field | Required | What to put |
   | --- | --- | --- |
   | `CPX_CLIENT_ID` | yes | Demo recipient client ID (UUID) |
   | `CPX_CODE` | yes | Demo recipient code, e.g. `DTT` |
   | `CPX_API_KEY` | yes | Demo API key (server-side secret) |
   | `CPX_API_BASE` | no | Leave empty. Defaults to `https://api-platform.demo.flywire.com` |
   | `CPX_EVENT_URL` | no | Leave empty unless testing session events |
   | `CPX_SPLIT_RECIPIENTS` | no | Leave empty (defaults to `EVT,UUI`) |
   | `CPX_PREVIEW_FEATURES` | no | Leave empty. Only set `moto,timeout` once the demo checkout supports them |
   | `PORT` | no | Defaults to `3000` |

4. Start the server: `npm run dev`, then open the booking site. The terminal must print `Server running at http://localhost:<PORT>`.
5. **Sandbox card:** use the Flywire demo test cards from the team (a Mastercard ending **5454** has worked for card payments, holds and saving cards). Never use a real card.

### Where things are on the booking site

| Icon in the header (next to *Oia, Santorini*) | Opens |
| --- | --- |
| Pulse | **Checkout activity** drawer: live callbacks and results |
| Grid | **Hotel back office** (`/dashboard/`) |
| Cog | **Checkout settings** drawer: flow, display, pages, payment options, branding, session, recipient |

The dates line on the rooms page (with the pencil) and the pencil in the *Your Selection* / *Your Stay* panels open the **dates & guests** picker.

---

## 2. Evidence: what to paste, and where

Create one folder per test case under **`docs/qa/evidence/<TEST-ID>/`** (e.g. `docs/qa/evidence/A3/`) and add the files below that apply.

| File | How to get it | When |
| --- | --- | --- |
| `booking.json` | DevTools → **Application** → **Local Storage** → `http://localhost:<PORT>` → key **`caldera.bookings.v1`** → copy the value. Keep only the booking you tested (find it by its `CH-XXXXXX` reference). | Every back-office test (A, E, H) |
| `activity-log.json` | Booking site → pulse icon → **Copy log** → paste into the file | Every checkout test (B, C, G) |
| `network-<name>.json` | DevTools → **Network** → click the failing request (e.g. `captures`, `charge`, `flywire-session`) → **Response** tab → copy | Any failed request |
| `screenshot-<n>.png` | Screenshot of the relevant screen: checkout, drawer, dashboard detail | Visual checks and every failure |
| `notes.md` | Steps you actually took, what you expected, what happened | Every failure |

**Never paste** the value of `flywire.checkoutDemo.apiKey` or the `.env` file: they hold the API key. Tokens and payor IDs in `booking.json` are sandbox data and are fine to share.

### Browser storage used by the demo (for reference and resets)

| Key | Storage | Holds |
| --- | --- | --- |
| `caldera.bookings.v1` | localStorage | Back-office bookings, payments, actions history |
| `caldera.checkoutActivity.v1` | localStorage | Checkout activity drawer log (last 20 runs) |
| `caldera.checkoutDemo.v1` | localStorage | Checkout settings drawer choices |
| `flywire.checkoutDemo.recipient` | localStorage | Client ID / recipient code override |
| `flywire.checkoutDemo.apiKey` | localStorage | API key override — **secret, don't paste** |
| `caldera.stay.v1` | sessionStorage | Stay dates and guests |

**Reset between test groups:** back office → **Clear all** and **Use server defaults**; activity drawer → **Clear**; settings drawer → **Reset**. Or DevTools → Application → **Clear site data**.

---

## 3. Already verified — only retest for regressions

- Pay in full, Save card (charge later), Reserve & hold, Hold & save card with a real card
- Back office: **Refresh status**, **Capture** (full and partial), **Extend hold**, **Charge saved card** (response `payment_reference`, `charge_info`, `charge_result`)
- Session creation and lookup, server-side key check, messy-key clean-up (unit-checked)
- Activity drawer contents and persistence, card brand icons, amounts in subunits shown as dollars

---

## 4. Test cases

Mark each row **Pass / Fail / Blocked** in section 6. Unless stated otherwise: authenticated session, full-screen overlay, default settings.

### A. Back office — session actions

| ID | Steps | Expected |
| --- | --- | --- |
| A1 | Settings → *Pay in full*. Book a room, open checkout, **close it without paying**. Open the back office. | Booking shows **Abandoned**; Refresh status and Resume session are available. |
| A2 | On the A1 booking click **Resume session**. Checkout reopens on the dashboard. Pay with the sandbox card. | History shows *Session resumed · checkout reopened*, then *Checkout completed after resume*. Status becomes **Paid**; payment appears with card icon. |
| A3 | Book with *Reserve & hold*, pay. Back office → **Refresh status** → **Capture** a **partial** amount (e.g. $5,000 of $7,350). | 200 response, history *Captured $5,000.00 · received*, status **Partly captured**. Capture and Extend hold then show an explanation that the hold has ended. |
| A4 | New *Reserve & hold* booking. **Extend hold** with a **higher** amount, then capture the new amount. | Extend: *Hold raised to … and extended 7 days · received*; Authorized shows the new amount. Capture of the higher amount succeeds. |
| A5 | Extend hold with an amount **lower** than authorized. | The form refuses it ("must be at least …") before calling Flywire. |
| A6 | 10–30 min after A3, click **Refresh status**. | Payment status moves on from `SOME_IN_PROGRESS` (record what it becomes in `notes.md`). |
| A7 | *Hold (guest may save card)* and *Hold & keep card on file* flows: pay, then Capture and Charge saved card if a card was saved. | Same as A3; Charge saved card works when the tokenization report has a token. |

### B. Anonymous session and card brands

| ID | Steps | Expected |
| --- | --- | --- |
| B1 | Settings → Session **Anonymous** → *Pay in full*. Pay. Open activity drawer. | Outcome card says the report came from the browser (`on_end` payload); no session ID; back office shows Refresh/Resume as unavailable with a reason. |
| B2 | Pay with a **Visa** and an **Amex** sandbox card (if available). | Success screen, activity drawer and back office show the right brand icon. If a generic card icon appears, save `booking.json` (we need Flywire's brand spelling). |

### C. Settings from the configuration guide

| ID | Steps | Expected |
| --- | --- | --- |
| C1 | Pages → Payer details page **Always show**; Read-only fields **First name** + **Email**. Pay in full. | Checkout shows the payer page; first name and email are visible but not editable. |
| C2 | Payer details page **Hide**. | Checkout skips the payer page. |
| C3 | Custom fields page **Always show**, then **Hide** (any flow except *Save card, charge later*). | Page shown / skipped (DTT may have no custom fields: note what you see). For *Save card, charge later*, "Always show" is disabled with a reason. |
| C4 | **Hide the close button** — once in overlay, once with Display **Embed checkout in page**. | No close (×) button in either mode. |
| C5 | **Don't email the payer** ON: enter **your own email** in the guest form and pay. Repeat with it OFF. | ON: no Flywire payment email arrives. OFF: an email arrives. |
| C6 | **Split with partners** ON with default partners (EVT $350, UUI $250). Pay in full. | Checkout opens without the "Checkout rejected this configuration" notice; payment completes. |
| C7 | Split: set a partner code to `DTT`, then `AB`, then amounts above the total. | The drawer lists a warning for each. Launching anyway shows the checkout rejection notice with Flywire's reason. |
| C8 | **Checkout timeout** ON (3 min). | On the current demo environment: **no countdown** and an amber note in the drawer — expected. Once `CPX_PREVIEW_FEATURES=timeout` is set on an environment that supports it: countdown shows, and at zero the site shows *Time's up*. |
| C9 | Waive card surcharge, payment method chips (Cards only), Hide Amex, currency filter. | Checkout offers only the selected methods/currencies. |

### D. Branding and language

| ID | Steps | Expected |
| --- | --- | --- |
| D1 | Branding ON, font Cormorant Garamond, Text size **Large 18px**, Spacing **Roomy**. | Checkout text is readable; spacing visibly larger. Screenshot vs *Checkout default*. |
| D2 | Try each font and a custom colour. | Checkout uses the font and colour. |
| D3 | Language **Español**, **Deutsch**, **日本語**. | Checkout texts in that language. |

### E. Back office — credentials

| ID | Steps | Expected |
| --- | --- | --- |
| E1 | Paste into API key: `"X-Authentication-Key: <key>"` with a line break in the middle. | Field cleans itself; a blue note lists what was removed. **Save & test connection** → *Connected · your key*. |
| E2 | Save a wrong key. | *Key rejected* with Flywire's reason; booking site card-on-file flows then fail with a clear message. |
| E3 | Enter another account's client ID, code and key (if available). Make a booking. | Checkout opens for that account; back-office actions work for it. |
| E4 | **Use server defaults**, refresh the page. | Fields empty, *Connected · server key*; values stay cleared after refresh. |

### F. Dates, guests and amounts

| ID | Steps | Expected |
| --- | --- | --- |
| F1 | Open the dates picker from the hero line. | Past dates crossed out; default stay is 3–8 weeks ahead. |
| F2 | Pick 5 nights, 3 adults + 1 child. | Summary: 5 nights × rate + 2 extra guests × $150 × 5 nights; total matches the payment button and the checkout amount. |
| F3 | Change dates from the pencil on the payment step, then pay. | Checkout and the back office booking use the new total and dates. |

### G. Checkout flows smoke test

| ID | Steps | Expected |
| --- | --- | --- |
| G1 | Open checkout once for each flow in the settings drawer (MOTO is locked). | Each opens without a rejection notice; success screen wording fits the flow. |
| G2 | Display **Embed checkout in page** with Pay in full. | Checkout renders inside the payment panel; after completion the panel returns to normal. |
| G3 | Close checkout during payment (cancel). | Booking site stays on the payment step; activity shows `on_end('canceled')`; back office shows **Abandoned**. |

### H. Persistence and multi-tab

| ID | Steps | Expected |
| --- | --- | --- |
| H1 | After several tests, refresh both pages. | Bookings, history, activity log, settings and credentials are all still there. |
| H2 | Refresh the booking site **while checkout is open**. | Activity drawer shows that run as *Interrupted by reload*. |
| H3 | Open booking site and back office side by side; make a booking. | The back office list updates without refreshing. |

### I. Layout

| ID | Steps | Expected |
| --- | --- | --- |
| I1 | Check booking site, drawers and back office at 1440, 1024, 768 and 390 px wide (DevTools device toolbar). | Nothing overlaps or is cut off; drawers scroll; tables scroll horizontally if needed. |

---

## 5. Expected behaviour — not bugs

- **Amounts:** bookings are in USD. `charge_info` in a charge response is what the **guest** paid in their own currency (e.g. €110.17 for a $120 charge).
- **Capture is one-time:** after any capture the hold ends; the rest is released to the guest, so Capture/Extend explain why they're unavailable.
- **`received` status:** capture and extend are accepted and processed asynchronously; `SOME_IN_PROGRESS` right after is normal.
- **Reserve & hold card details:** Flywire doesn't return brand/last four for held payments, so a plain Reserve & hold booking shows a generic card. Hold & save card bookings show the saved card.
- **Timeout and MOTO:** not in the demo environment's checkout yet (checked 23 Sep 2026).
- **API key in the browser:** the back office can store an API key in the browser for demos only. The page says so.
- **Unavailable back-office actions:** buttons with a dashed outline are clickable and explain why they don't apply.

---

## 6. Results

| ID | Result (Pass / Fail / Blocked) | Tester | Date | Evidence folder / notes |
| --- | --- | --- | --- | --- |
| A1 | | | | |
| A2 | | | | |
| A3 | | | | |
| A4 | | | | |
| A5 | | | | |
| A6 | | | | |
| A7 | | | | |
| B1 | | | | |
| B2 | | | | |
| C1 | | | | |
| C2 | | | | |
| C3 | | | | |
| C4 | | | | |
| C5 | | | | |
| C6 | | | | |
| C7 | | | | |
| C8 | | | | |
| C9 | | | | |
| D1 | | | | |
| D2 | | | | |
| D3 | | | | |
| E1 | | | | |
| E2 | | | | |
| E3 | | | | |
| E4 | | | | |
| F1 | | | | |
| F2 | | | | |
| F3 | | | | |
| G1 | | | | |
| G2 | | | | |
| G3 | | | | |
| H1 | | | | |
| H2 | | | | |
| H3 | | | | |
| I1 | | | | |

### Bug report template (`docs/qa/evidence/<TEST-ID>/notes.md`)

```markdown
**Test:** A3 — partial capture on Reserve & hold
**Booking:** CH-XXXXXX
**Steps:** 1. … 2. … 3. …
**Expected:** …
**Actual:** …
**Evidence:** booking.json, network-captures.json, screenshot-1.png
**Browser / OS:** Chrome 1xx / macOS
```
