/**
 * Demo configuration drawer — lets the presenter pick which Checkout V2
 * capability to demo on the Caldera House booking page.
 *
 * Not part of the SDK integration. It only decides which `transaction`,
 * `config` and `styles` to hand to `FlywireCheckout.launch()`; every option
 * here mirrors a sample in https://checkout.demo.flywire.com/playground/.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'caldera.checkoutDemo.v1';
    const PLAYGROUND = 'https://checkout.demo.flywire.com/playground/';

    const FLOW_GROUPS = [
        { id: 'payment', label: 'Payments' },
        { id: 'tokenization', label: 'Card on file', hint: 'Tokenization' },
        { id: 'optional', label: 'Guest chooses to save card', hint: 'Optional tokenization' },
        { id: 'implicit', label: 'Card saved automatically', hint: 'Implicit tokenization' },
    ];

    /**
     * `guest*` fields are what the hotel guest sees on the booking page;
     * `title` / `pitch` are what the presenter sees in the drawer.
     */
    const FLOWS = [
        {
            id: 'pay_full', group: 'payment', type: 'payment',
            title: 'Pay in full',
            pitch: 'Prepaid rates, last-minute tours and experiences.',
            guestTitle: 'Pay in Full',
            guestDesc: (amt) => `One-time payment of ${amt}`,
            cta: (amt) => `Pay ${amt}`,
            playground: [['Payment with common fields', 'payment/common_fields']],
        },
        {
            id: 'reserve_hold', group: 'payment', type: 'payment', preauth: true,
            title: 'Reserve & hold',
            pitch: 'Pre-authorize at booking, capture at check-in. Holds can be extended or increased by API.',
            guestTitle: 'Reserve & Hold',
            guestDesc: (amt) => `Pre-authorize ${amt} today, charged at check-in`,
            cta: () => 'Reserve with a hold',
            playground: [['Payment with preauth', 'payment/with_preauth']],
        },
        {
            id: 'moto', group: 'payment', type: 'payment', channel: 'moto', preview: 'moto',
            title: 'Phone & email bookings (MOTO)',
            pitch: 'Reservations staff take the payment for guests booking by phone or email.',
            guestTitle: 'Reservations Desk Payment',
            guestDesc: (amt) => `Agent-assisted payment of ${amt}`,
            cta: (amt) => `Take payment of ${amt}`,
            playground: [['MOTO payment', 'payment/moto']],
        },
        {
            id: 'save_card', group: 'tokenization', type: 'tokenization', noAmount: true,
            title: 'Save card, charge later',
            pitch: 'Card-on-file guarantee. Charge deposits, balances or no-shows later with the token.',
            guestTitle: 'Guarantee with Card',
            guestDesc: () => 'Your card secures the booking. Nothing is charged today.',
            cta: () => 'Save card & reserve',
            playground: [['Tokenization without amount', 'tokenization/without_amount']],
        },
        {
            id: 'pay_save', group: 'tokenization', type: 'tokenization',
            title: 'Pay now & save card',
            pitch: 'Charge now and keep the card for extras: dive gear, spa, excursions, balances.',
            guestTitle: 'Pay & Save Card',
            guestDesc: (amt) => `Pay ${amt} now; card kept on file for extras`,
            cta: (amt) => `Pay ${amt} & save card`,
            playground: [['Tokenization with amount', 'tokenization/with_amount']],
        },
        {
            id: 'hold_save', group: 'tokenization', type: 'tokenization', preauth: true,
            title: 'Hold & save card',
            pitch: 'Pre-authorize the stay and keep the card for the final bill and incidentals.',
            guestTitle: 'Hold & Save Card',
            guestDesc: (amt) => `Pre-authorize ${amt}; card kept on file for your final bill`,
            cta: () => 'Reserve with a hold',
            playground: [['Tokenization with preauth', 'tokenization/with_preauth']],
        },
        {
            id: 'optional', group: 'optional', type: 'optional_tokenization',
            title: 'Pay, guest may save card',
            pitch: 'Guests decide whether to store their card for the next trip. Great for repeat guests.',
            guestTitle: 'Pay in Full',
            guestDesc: (amt) => `One-time payment of ${amt}, with the option to save your card`,
            cta: (amt) => `Pay ${amt}`,
            playground: [['Optional tokenization', 'optional_tokenization/standard']],
        },
        {
            id: 'optional_hold', group: 'optional', type: 'optional_tokenization', preauth: true,
            title: 'Hold, guest may save card',
            pitch: 'Pre-authorize the stay; the guest can opt in to keeping the card on file.',
            guestTitle: 'Reserve & Hold',
            guestDesc: (amt) => `Pre-authorize ${amt}, with the option to save your card`,
            cta: () => 'Reserve with a hold',
            playground: [['Optional tokenization with preauth', 'optional_tokenization/with_preauth']],
        },
        {
            id: 'implicit', group: 'implicit', type: 'implicit_tokenization',
            title: 'Pay & keep card on file',
            pitch: 'Card is stored automatically when the method supports it. Ideal for balance-due and installment plans.',
            guestTitle: 'Pay in Full',
            guestDesc: (amt) => `One-time payment of ${amt}; card kept on file for your stay`,
            cta: (amt) => `Pay ${amt}`,
            playground: [['Implicit tokenization', 'implicit_tokenization/standard']],
        },
        {
            id: 'implicit_hold', group: 'implicit', type: 'implicit_tokenization', preauth: true,
            title: 'Hold & keep card on file',
            pitch: 'Pre-authorize the stay and store the card automatically for later charges.',
            guestTitle: 'Reserve & Hold',
            guestDesc: (amt) => `Pre-authorize ${amt}; card kept on file for your stay`,
            cta: () => 'Reserve with a hold',
            playground: [['Implicit tokenization with preauth', 'implicit_tokenization/with_preauth']],
        },
    ];

    const SPLIT_ITEMS = [
        { amount: 35000, description: 'Sunset catamaran excursion' },
        { amount: 25000, description: 'Couples spa ritual' },
    ];

    const PAYER_FIELDS = [
        { id: 'first_name', label: 'First name' },
        { id: 'last_name', label: 'Last name' },
        { id: 'email', label: 'Email' },
        { id: 'phone', label: 'Phone' },
        { id: 'address', label: 'Address' },
        { id: 'city', label: 'City' },
        { id: 'zip', label: 'ZIP' },
        { id: 'country', label: 'Country' },
    ];

    const PORTAL_CODE = /^(?:[A-Z]{3}|[A-Z][A-Z0-9]{4})$/;
    const MAX_SPLIT_PARTNERS = 5;
    const DOCS_URL = 'https://developers.flywire.com/travel-b2b/Content/Travel-B2B/integrations/checkout-v2.htm';

    const PAYMENT_METHODS = [
        { id: 'credit_card', label: 'Cards' },
        { id: 'direct_debit', label: 'Direct debit' },
        { id: 'online', label: 'Local online methods' },
        { id: 'bank_transfer', label: 'Bank transfer' },
    ];

    const FONTS = {
        'Cormorant Garamond': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap',
        'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&display=swap',
        'Lora': 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap',
        'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
    };

    const DEFAULT_STATE = {
        flow: 'pay_full',
        display: 'overlay',
        session: 'authenticated',
        split: false,
        // null: use the partners configured on the server (CPX_SPLIT_RECIPIENTS).
        splitItems: null,
        waiveSurcharge: false,
        pages: { payer: 'auto', recipient: 'auto' },
        disabledFields: [],
        hideClose: false,
        disablePayerEmails: false,
        timeout: { enabled: false, type: 'checkout', minutes: 5 },
        methods: PAYMENT_METHODS.map((m) => m.id),
        hideAmex: false,
        currency: 'all',
        branding: { enabled: false, color: '#7F6E4B', font: 'Cormorant Garamond', fontSize: '18px', space: '' },
        locale: 'en',
    };

    let state = loadState();
    let serverConfig = { split_recipients: [], preview_features: [] };
    let bookingAmountCents = 0;
    const listeners = new Set();
    let lastFocused = null;

    // ── State ──

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || !FLOWS.some((f) => f.id === saved.flow)) return structuredClone(DEFAULT_STATE);
            return {
                ...structuredClone(DEFAULT_STATE),
                ...saved,
                timeout: { ...DEFAULT_STATE.timeout, ...saved.timeout },
                pages: { ...DEFAULT_STATE.pages, ...saved.pages },
                branding: { ...DEFAULT_STATE.branding, ...saved.branding },
            };
        } catch {
            return structuredClone(DEFAULT_STATE);
        }
    }

    function setState(patch) {
        state = { ...state, ...patch };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
        listeners.forEach((fn) => fn());
    }

    /** Recipient sent to checkout: the demo credentials entered in the back office. */
    function recipient() {
        const { client_id, code } = global.DemoCredentials.get();
        return { client_id, code };
    }

    function hasApiKey() {
        return Boolean(global.DemoCredentials.get().api_key);
    }

    function currentFlow() {
        return FLOWS.find((f) => f.id === state.flow);
    }

    function isPreviewEnabled(feature) {
        return serverConfig.preview_features.includes(feature);
    }

    function isFlowAvailable(flow) {
        if (flow.preview && !isPreviewEnabled(flow.preview)) return false;
        if (flow.type !== 'payment' && !hasApiKey()) return false;
        return true;
    }

    /** Why an option can't be used with the selected flow, or null when it can. */
    function unavailableReason(option, flow = currentFlow()) {
        switch (option) {
            case 'split':
                return flow.noAmount ? 'Needs an amount; not available when only saving a card.' : null;
            case 'recipientFormAlways':
                return flow.noAmount ? 'Checkout doesn’t allow forcing this page when only saving a card.' : null;
            case 'waiveSurcharge':
                return flow.noAmount ? 'Needs an amount; not available when only saving a card.' : null;
            case 'anonymous':
                if (flow.type !== 'payment') return 'Card-on-file flows always need an authenticated session.';
                return null;
            case 'authenticated':
                return hasApiKey() ? null : 'Add your demo API key in the hotel back office first.';
            default:
                return null;
        }
    }

    function effectiveSession(flow = currentFlow()) {
        if (unavailableReason('authenticated', flow)) return 'anonymous';
        if (unavailableReason('anonymous', flow)) return 'authenticated';
        return state.session;
    }

    function defaultSplitItems() {
        const items = serverConfig.split_recipients
            .slice(0, SPLIT_ITEMS.length)
            .map((recipient, i) => ({ recipient, ...SPLIT_ITEMS[i] }));
        return items.length ? items : [{ recipient: '', ...SPLIT_ITEMS[0] }];
    }

    function splitItems() {
        return state.splitItems || defaultSplitItems();
    }

    /** Split entries that will be sent (rows with a code and an amount). */
    function splitPayload() {
        const items = splitItems()
            .filter((item) => item.recipient && item.amount > 0)
            .map(({ recipient, amount, description }) => ({ recipient, amount, description: description || undefined }));
        return items.length ? items : undefined;
    }

    /** Same rules as checkout validates, so problems show before the guest sees an error. */
    function splitProblems(totalCents) {
        const problems = [];
        const items = splitItems();
        const seen = new Set();
        const base = (recipient().code || '').toUpperCase();
        items.forEach((item, i) => {
            const row = `Partner ${i + 1}`;
            if (!item.recipient) problems.push(`${row}: add a portal code.`);
            else if (!PORTAL_CODE.test(item.recipient)) problems.push(`${row}: portal codes are 3 letters (ABC) or 5 characters starting with a letter (ABC1D).`);
            else if (item.recipient === base) problems.push(`${row}: can’t be the hotel’s own portal (${base}).`);
            else if (seen.has(item.recipient)) problems.push(`${row}: ${item.recipient} is listed twice.`);
            seen.add(item.recipient);
            if (!(item.amount > 0)) problems.push(`${row}: enter an amount.`);
        });
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        if (totalCents && total > totalCents) problems.push(`Partners get ${money(total)}, more than the booking total of ${money(totalCents)}.`);
        return problems;
    }

    function money(cents) {
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    // ── Checkout options (consumed by app.js) ──

    function buildCheckoutOptions({ amountCents, embedTo }) {
        const flow = currentFlow();

        const details = flow.noAmount ? undefined : {
            amount: amountCents,
            authorization: flow.preauth ? 'preauth' : undefined,
            channel: flow.channel,
            split: state.split && !unavailableReason('split') ? splitPayload() : undefined,
            waive_adjustments: state.waiveSurcharge && !unavailableReason('waiveSurcharge') ? ['surcharge'] : undefined,
        };

        return {
            transaction: { type: flow.type, details },
            config: {
                locale: state.locale,
                embed_to: state.display === 'embedded' ? embedTo : undefined,
                offer_rules: buildOfferRules(),
                timeout: state.timeout.enabled
                    ? { type: state.timeout.type, duration: state.timeout.minutes * 60 }
                    : undefined,
                show_payer_form: pageSetting(state.pages.payer),
                show_recipient_form: state.pages.recipient === 'true' && unavailableReason('recipientFormAlways')
                    ? undefined
                    : pageSetting(state.pages.recipient),
                disabled_fields: state.disabledFields.length ? state.disabledFields : undefined,
                close_button: state.hideClose ? 'hidden' : undefined,
                disable_payer_emails: state.disablePayerEmails || undefined,
            },
            styles: state.branding.enabled
                ? {
                    primary_color: state.branding.color,
                    primary_font: { url: FONTS[state.branding.font], family: state.branding.font },
                    base_font_size: state.branding.fontSize || undefined,
                    base_space: state.branding.space || undefined,
                }
                : undefined,
            authenticated: effectiveSession(flow) === 'authenticated',
        };
    }

    /** 'auto' is checkout's default, so it is left out of initFields. */
    function pageSetting(value) {
        return value === 'auto' ? undefined : value === 'true';
    }

    function buildOfferRules() {
        const filters = {};
        if (state.methods.length && state.methods.length < PAYMENT_METHODS.length) filters.method = state.methods;
        if (state.currency !== 'all') filters.currency = [state.currency];
        if (state.hideAmex) filters.advanced = ['is_not_amex'];
        return Object.keys(filters).length ? { filters } : undefined;
    }

    /** Guest-facing copy for the booking panel. */
    function describeForGuest(formattedAmount) {
        const flow = currentFlow();
        const notes = [];
        const split = state.split && !unavailableReason('split') ? splitPayload() : undefined;
        if (split) {
            const parts = split.map((s) => `${(s.description || s.recipient).toLowerCase()} (${money(s.amount)})`);
            notes.push(`Includes ${parts.join(' and ')}, settled directly with our partners.`);
        }
        if (state.waiveSurcharge && !unavailableReason('waiveSurcharge')) notes.push('No card surcharge.');

        return {
            title: flow.guestTitle,
            description: flow.guestDesc(formattedAmount),
            notes,
            cta: flow.cta(formattedAmount),
        };
    }

    // ── Drawer ──

    const $ = (id) => document.getElementById(id);

    function init(config) {
        serverConfig = { ...serverConfig, ...config };
        if (!isFlowAvailable(currentFlow())) state.flow = DEFAULT_STATE.flow;

        renderFlowList();
        bindControls();
        render();

        global.DemoCredentials.onChange(() => {
            if (!isFlowAvailable(currentFlow())) state.flow = DEFAULT_STATE.flow;
            renderFlowList();
            render();
            listeners.forEach((fn) => fn());
        });

        $('demo-config-open').addEventListener('click', open);
        document.querySelectorAll('#demo-drawer [data-drawer-close]').forEach((el) => el.addEventListener('click', close));
        $('demo-drawer').addEventListener('keydown', onDrawerKeydown);
    }

    function open() {
        lastFocused = document.activeElement;
        $('demo-drawer').hidden = false;
        requestAnimationFrame(() => $('demo-drawer').classList.add('open'));
        $('demo-config-open').setAttribute('aria-expanded', 'true');
        document.body.classList.add('fw-drawer-locked');
        $('demo-drawer-title').focus();
    }

    function close() {
        const drawer = $('demo-drawer');
        drawer.classList.remove('open');
        $('demo-config-open').setAttribute('aria-expanded', 'false');
        document.body.classList.remove('fw-drawer-locked');
        setTimeout(() => { drawer.hidden = true; }, 250);
        lastFocused?.focus();
    }

    function onDrawerKeydown(e) {
        if (e.key === 'Escape') return close();
        if (e.key !== 'Tab') return;

        const focusable = [...$('demo-drawer').querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]'
        )].filter((el) => el.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function renderFlowList() {
        const list = $('demo-flow-list');
        list.replaceChildren(...FLOW_GROUPS.map((group) => {
            const fieldset = el('fieldset', 'fw-flow-group');
            const legend = el('legend', 'fw-flow-group-label', group.label);
            if (group.hint) legend.append(el('span', 'fw-flow-group-hint', group.hint));
            fieldset.append(legend);

            FLOWS.filter((f) => f.group === group.id).forEach((flow) => {
                const available = isFlowAvailable(flow);
                const label = el('label', 'fw-flow-option');
                label.dataset.flow = flow.id;

                const input = el('input');
                input.type = 'radio';
                input.name = 'demo-flow';
                input.value = flow.id;
                input.disabled = !available;
                input.addEventListener('change', () => setState({ flow: flow.id }));

                const body = el('span', 'fw-flow-option-body');
                const titleRow = el('span', 'fw-flow-option-title', flow.title);
                if (flow.preview && !isPreviewEnabled(flow.preview)) titleRow.append(el('span', 'fw-badge fw-badge-soon', 'Coming soon'));
                else if (flow.type !== 'payment' && !hasApiKey()) titleRow.append(el('span', 'fw-badge fw-badge-warn', 'Needs API key'));
                body.append(titleRow, el('span', 'fw-flow-option-pitch', flow.pitch), el('code', 'fw-flow-option-tech', techSummary(flow)));

                label.append(input, body);
                fieldset.append(label);
            });
            return fieldset;
        }));
    }

    function techSummary(flow) {
        const parts = [`type: '${flow.type}'`];
        if (flow.preauth) parts.push(`authorization: 'preauth'`);
        if (flow.channel) parts.push(`channel: '${flow.channel}'`);
        if (flow.noAmount) parts.push('no amount');
        return parts.join(' · ');
    }

    function bindControls() {
        document.querySelectorAll('input[name="demo-display"]').forEach((input) =>
            input.addEventListener('change', () => setState({ display: input.value })));
        document.querySelectorAll('input[name="demo-session"]').forEach((input) =>
            input.addEventListener('change', () => setState({ session: input.value })));

        $('demo-split').addEventListener('change', (e) => setState({ split: e.target.checked }));
        $('demo-waive').addEventListener('change', (e) => setState({ waiveSurcharge: e.target.checked }));

        $('demo-timeout').addEventListener('change', (e) => setState({ timeout: { ...state.timeout, enabled: e.target.checked } }));
        $('demo-timeout-type').addEventListener('change', (e) => setState({ timeout: { ...state.timeout, type: e.target.value } }));
        $('demo-timeout-minutes').addEventListener('change', (e) => setState({ timeout: { ...state.timeout, minutes: Number(e.target.value) } }));

        const methodList = $('demo-methods');
        methodList.replaceChildren(...PAYMENT_METHODS.map((method) => {
            const label = el('label', 'fw-chip');
            const input = el('input');
            input.type = 'checkbox';
            input.value = method.id;
            input.addEventListener('change', () => {
                const methods = PAYMENT_METHODS.map((m) => m.id)
                    .filter((id) => methodList.querySelector(`input[value="${id}"]`).checked);
                setState({ methods });
            });
            label.append(input, el('span', null, method.label));
            return label;
        }));
        document.querySelectorAll('input[name="demo-payer-form"]').forEach((input) =>
            input.addEventListener('change', () => setState({ pages: { ...state.pages, payer: input.value } })));
        document.querySelectorAll('input[name="demo-recipient-form"]').forEach((input) =>
            input.addEventListener('change', () => setState({ pages: { ...state.pages, recipient: input.value } })));

        const fieldList = $('demo-disabled-fields');
        fieldList.replaceChildren(...PAYER_FIELDS.map((field) => {
            const label = el('label', 'fw-chip');
            const input = el('input');
            input.type = 'checkbox';
            input.value = field.id;
            input.addEventListener('change', () => {
                const disabledFields = PAYER_FIELDS.map((f) => f.id)
                    .filter((id) => fieldList.querySelector(`input[value="${id}"]`).checked);
                setState({ disabledFields });
            });
            label.append(input, el('span', null, field.label));
            return label;
        }));
        $('demo-hide-close').addEventListener('change', (e) => setState({ hideClose: e.target.checked }));
        $('demo-disable-emails').addEventListener('change', (e) => setState({ disablePayerEmails: e.target.checked }));

        $('demo-hide-amex').addEventListener('change', (e) => setState({ hideAmex: e.target.checked }));
        $('demo-currency').addEventListener('change', (e) => setState({ currency: e.target.value }));

        $('demo-branding').addEventListener('change', (e) => setState({ branding: { ...state.branding, enabled: e.target.checked } }));
        $('demo-brand-color').addEventListener('input', (e) => setState({ branding: { ...state.branding, color: e.target.value } }));
        $('demo-brand-font').addEventListener('change', (e) => setState({ branding: { ...state.branding, font: e.target.value } }));
        $('demo-brand-font-size').addEventListener('change', (e) => setState({ branding: { ...state.branding, fontSize: e.target.value } }));
        $('demo-brand-space').addEventListener('change', (e) => setState({ branding: { ...state.branding, space: e.target.value } }));
        $('demo-locale').addEventListener('change', (e) => setState({ locale: e.target.value }));


        $('demo-reset').addEventListener('click', () => {
            splitEditorKey = null;
            setState(structuredClone(DEFAULT_STATE));
        });
        $('demo-copy-code').addEventListener('click', copyCode);
    }

    function render() {
        const flow = currentFlow();

        document.querySelectorAll('.fw-flow-option').forEach((label) => {
            const selected = label.dataset.flow === flow.id;
            label.classList.toggle('selected', selected);
            label.querySelector('input').checked = selected;
        });

        setRadio('demo-display', state.display);
        const session = effectiveSession(flow);
        setRadio('demo-session', session);
        setDisabled('demo-session-anonymous', unavailableReason('anonymous'));
        setDisabled('demo-session-authenticated', unavailableReason('authenticated'));
        $('demo-session-note').textContent = unavailableReason('anonymous') || unavailableReason('authenticated')
            || (session === 'authenticated'
                ? 'Recommended. Your server creates the session and confirms the outcome.'
                : 'Browser-only, for one-off payments. No server-side status lookup.');

        setToggle('demo-split', state.split, unavailableReason('split'));
        renderSplitEditor();
        setToggle('demo-waive', state.waiveSurcharge, unavailableReason('waiveSurcharge'));
        setToggle('demo-timeout', state.timeout.enabled, null);
        $('demo-timeout-type').value = state.timeout.type;
        $('demo-timeout-minutes').value = String(state.timeout.minutes);
        $('demo-timeout-fields').hidden = !state.timeout.enabled;
        $('demo-timeout-note').textContent = state.timeout.enabled && !isPreviewEnabled('timeout')
            ? 'The demo environment’s checkout doesn’t support timeout yet, so it is ignored there until that release ships. Set CPX_PREVIEW_FEATURES=timeout once it has.'
            : '';

        setRadio('demo-payer-form', state.pages.payer);
        const forcedRecipientForm = unavailableReason('recipientFormAlways');
        setDisabled('demo-recipient-form-true', forcedRecipientForm);
        setRadio('demo-recipient-form', state.pages.recipient === 'true' && forcedRecipientForm ? 'auto' : state.pages.recipient);
        $('demo-pages-note').textContent = forcedRecipientForm && state.pages.recipient === 'true'
            ? forcedRecipientForm
            : state.pages.payer === 'false'
                ? 'Hiding the payer page only works when checkout already has every required payer detail. The guest form prefills them.'
                : 'Auto skips a page when everything on it is already filled in, which is the case for the prefilled guest details.';
        $('demo-disabled-fields').querySelectorAll('input').forEach((input) => {
            input.checked = state.disabledFields.includes(input.value);
        });
        $('demo-disabled-fields-note').textContent = state.disabledFields.length && state.pages.payer !== 'true'
            ? 'Guests only see these on the payer page, which Auto skips when the details are prefilled. Set the payer page to Always show to demo it.'
            : 'The guest sees these fields but can’t change them, e.g. the email the booking was made with.';
        $('demo-hide-close').checked = state.hideClose;
        $('demo-disable-emails').checked = state.disablePayerEmails;

        $('demo-methods').querySelectorAll('input').forEach((input) => {
            input.checked = state.methods.includes(input.value);
        });
        $('demo-hide-amex').checked = state.hideAmex;
        $('demo-currency').value = state.currency;

        $('demo-branding').checked = state.branding.enabled;
        $('demo-brand-color').value = state.branding.color;
        $('demo-brand-color-value').textContent = state.branding.color.toUpperCase();
        $('demo-brand-font').value = state.branding.font;
        $('demo-brand-font-size').value = state.branding.fontSize;
        $('demo-brand-space').value = state.branding.space;
        $('demo-branding-fields').hidden = !state.branding.enabled;
        $('demo-locale').value = state.locale;

        renderCredentialsSummary();

        $('demo-config-open').title = `Checkout settings · ${flow.title}`;
        renderCodePreview(flow);
    }

    let splitEditorKey = null;

    /** Rebuilt only when rows are added or removed, so typing keeps focus. */
    function renderSplitEditor() {
        const editor = $('demo-split-editor');
        const visible = state.split && !unavailableReason('split');
        editor.hidden = !visible;
        if (!visible) {
            splitEditorKey = null;
            return;
        }

        const items = splitItems();
        const key = String(items.length);
        if (key !== splitEditorKey) {
            splitEditorKey = key;
            const updateItem = (index, patch) => {
                const next = splitItems().map((item, i) => (i === index ? { ...item, ...patch } : { ...item }));
                setState({ splitItems: next });
            };

            const rows = items.map((item, index) => {
                const row = el('div', 'fw-split-row');
                const codeInput = inputEl('text', item.recipient, 'Code', `Partner ${index + 1} portal code`);
                codeInput.maxLength = 5;
                codeInput.addEventListener('input', () => {
                    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    updateItem(index, { recipient: codeInput.value });
                });
                const amountInput = inputEl('number', item.amount ? (item.amount / 100).toFixed(2) : '', '0.00', `Partner ${index + 1} amount in USD`);
                amountInput.min = '0.01';
                amountInput.step = '0.01';
                amountInput.addEventListener('input', () => updateItem(index, { amount: Math.round(Number(amountInput.value) * 100) || 0 }));
                const descInput = inputEl('text', item.description, 'What for', `Partner ${index + 1} description`);
                descInput.addEventListener('input', () => updateItem(index, { description: descInput.value }));
                const remove = el('button', 'fw-icon-btn fw-split-remove', '×');
                remove.type = 'button';
                remove.setAttribute('aria-label', `Remove partner ${index + 1}`);
                remove.disabled = items.length === 1;
                remove.addEventListener('click', () => setState({ splitItems: splitItems().filter((_, i) => i !== index) }));
                const amountWrap = el('span', 'fw-split-amount');
                amountWrap.append(el('span', null, '$'), amountInput);
                row.append(codeInput, amountWrap, descInput, remove);
                return row;
            });

            const head = el('div', 'fw-split-row fw-split-head');
            ['Portal code', 'Amount', 'Description', ''].forEach((t) => head.append(el('span', null, t)));

            const actions = el('div', 'fw-split-actions');
            const add = el('button', 'fw-btn fw-btn-ghost', '+ Add partner');
            add.type = 'button';
            add.disabled = items.length >= MAX_SPLIT_PARTNERS;
            add.addEventListener('click', () => setState({ splitItems: [...splitItems(), { recipient: '', amount: 0, description: '' }] }));
            const reset = el('button', 'fw-btn fw-btn-ghost', 'Use default partners');
            reset.type = 'button';
            reset.className += ' fw-split-reset';
            reset.addEventListener('click', () => {
                splitEditorKey = null;
                setState({ splitItems: null });
            });
            actions.append(add, reset);

            editor.replaceChildren(head, ...rows, actions, el('p', 'fw-split-summary'), el('ul', 'fw-split-problems'));
        }

        editor.querySelector('.fw-split-reset').hidden = !state.splitItems;
        const total = bookingAmountCents || 735000;
        const partners = splitItems().reduce((sum, item) => sum + (item.amount || 0), 0);
        editor.querySelector('.fw-split-summary').textContent =
            `Partners ${money(partners)} · hotel keeps ${money(Math.max(0, total - partners))} of ${money(total)}${bookingAmountCents ? '' : ' (example total)'}`;
        const problems = splitProblems(total);
        editor.querySelector('.fw-split-problems').replaceChildren(...problems.map((p) => el('li', null, p)));
    }

    function inputEl(type, value, placeholder, label) {
        const input = el('input');
        input.type = type;
        input.value = value || '';
        input.placeholder = placeholder;
        input.setAttribute('aria-label', label);
        input.autocomplete = 'off';
        input.spellcheck = false;
        return input;
    }

    function renderCredentialsSummary() {
        const saved = global.DemoCredentials.get();
        const rows = [
            ['Client ID', saved.client_id],
            ['Recipient code', saved.code],
            ['API key', saved.api_key && global.DemoCredentials.mask(saved.api_key)],
        ];
        $('demo-credentials-summary').replaceChildren(...rows.flatMap(([term, value]) => {
            const dd = el('dd', value ? null : 'fw-cred-missing', value || 'Not set');
            return [el('dt', null, term), dd];
        }));
    }

    function renderCodePreview(flow) {
        const options = buildCheckoutOptions({ amountCents: bookingAmountCents || 735000, embedTo: '#payment-embed-target' });
        const initFields = global.FlywireCheckout.buildInitFields({
            ...options,
            recipient: { client_id: recipient().client_id || 'CLIENT_ID', code: recipient().code || 'RECIPIENT_CODE' },
            payer: { first_name: '…', last_name: '…', email: '…' },
            session: options.authenticated
                ? { id: code('session.id'), run_id: code('session.run_id'), run_token: code('session.run_token') }
                : undefined,
            response: {
                on_end: code('(reason, payload) => handleEnd(reason, payload)'),
                on_error: code('(type, payload) => handleError(type, payload)'),
            },
        });
        $('demo-code').textContent = `window.cpx_core.start(${printJs(initFields, 0)});`;

        const links = [...flow.playground];
        if (options.authenticated) links.push(['Payment with authenticated session', 'payment/authenticated']);
        if (state.display === 'embedded') links.push(['Payment embedded', 'payment/embedded']);
        if (options.transaction.details?.split) links.push(['Payment with split', 'payment/split']);
        if (options.transaction.details?.waive_adjustments) links.push(['Payment with waived surcharge', 'payment/waive_adjustments']);
        if (options.config.offer_rules) links.push(['Payment with offer rules', 'payment/offer_rules']);
        if (options.styles) links.push(['Payment with custom styles', 'payment/with_styles']);
        if (options.config.timeout) links.push(['Payment with timeout', 'payment/timeout']);
        const { show_payer_form, show_recipient_form, disabled_fields, close_button, disable_payer_emails } = options.config;
        if ([show_payer_form, show_recipient_form, disabled_fields, close_button, disable_payer_emails].some((v) => v !== undefined)) {
            links.push(['Checkout V2 configuration guide', DOCS_URL]);
        }

        $('demo-playground-links').replaceChildren(...links.map(([label, path]) => {
            const a = el('a', 'fw-link', label);
            a.href = path.startsWith('http') ? path : PLAYGROUND + path;
            a.target = '_blank';
            a.rel = 'noopener';
            const li = el('li');
            li.append(a);
            return li;
        }));
    }

    async function copyCode() {
        const btn = $('demo-copy-code');
        try {
            await navigator.clipboard.writeText($('demo-code').textContent);
            btn.textContent = 'Copied';
        } catch {
            btn.textContent = 'Copy failed';
        }
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }

    // ── Helpers ──

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function setRadio(name, value) {
        document.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === value; });
    }

    function setDisabled(id, reason) {
        const input = $(id);
        input.disabled = Boolean(reason);
        input.closest('label').title = reason || '';
    }

    function setToggle(id, checked, reason) {
        const input = $(id);
        input.disabled = Boolean(reason);
        input.checked = checked && !reason;
        const row = input.closest('.fw-toggle-row');
        row.classList.toggle('disabled', Boolean(reason));
        row.querySelector('.fw-toggle-reason').textContent = reason || '';
    }

    function code(source) {
        return { __code: source };
    }

    function printJs(value, depth) {
        const pad = '  '.repeat(depth);
        const inner = '  '.repeat(depth + 1);

        if (value && value.__code) return value.__code;
        if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        if (Array.isArray(value)) {
            if (value.every((v) => typeof v !== 'object')) return `[${value.map((v) => printJs(v, 0)).join(', ')}]`;
            return `[\n${value.map((v) => inner + printJs(v, depth + 1)).join(',\n')},\n${pad}]`;
        }
        if (value && typeof value === 'object') {
            const entries = Object.entries(value).filter(([, v]) => v !== undefined);
            const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`);
            return `{\n${entries.map(([k, v]) => `${inner}${key(k)}: ${printJs(v, depth + 1)}`).join(',\n')},\n${pad}}`;
        }
        return String(value);
    }

    global.DemoConfig = {
        init,
        open,
        onChange: (fn) => listeners.add(fn),
        currentFlow,
        recipient,
        buildCheckoutOptions,
        describeForGuest,
        setBookingAmount: (cents) => { bookingAmountCents = cents; render(); },
    };
})(window);
