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

    const t = (key, vars) => global.I18n.t(key, vars);

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
            id: 'moto', group: 'payment', type: 'payment', channel: 'moto',
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
        { amount: 35000, descriptionKey: 'demo.partners.excursion' },
        { amount: 25000, descriptionKey: 'demo.partners.spa' },
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

    const CURRENCIES = [
        'all',
        'payer_currency',
        'other_than_payer_currency',
        'recipient_currency',
        'other_than_recipient_currency',
        'payer_and_recipient',
    ];

    /** Full method order for `offer_rules.sort`. Unlisted methods would sink to the end. */
    const METHOD_SORTS = {
        '': null,
        cards_first: ['credit_card', 'online', 'direct_debit', 'bank_transfer'],
        online_first: ['online', 'credit_card', 'direct_debit', 'bank_transfer'],
        debit_first: ['direct_debit', 'credit_card', 'online', 'bank_transfer'],
        transfer_first: ['bank_transfer', 'online', 'credit_card', 'direct_debit'],
    };

    /** Currency relationship order for `offer_rules.sort`. First match wins. */
    const CURRENCY_SORTS = {
        '': null,
        payer_first: ['payer_currency', 'other_than_payer_currency'],
        hotel_first: ['recipient_currency', 'other_than_recipient_currency'],
        other_first: ['other_than_payer_currency', 'payer_currency'],
    };

    const FONTS = {
        'Cormorant Garamond': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap',
        'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&display=swap',
        'Lora': 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap',
        'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
    };

    const GOOGLE_FONTS_ORIGIN = 'https://fonts.googleapis.com';
    /** Same rule checkout uses for `styles.primary_font.family`. */
    const FONT_FAMILY = /^[A-Za-z0-9 ]+$/;

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
        hideHeader: false,
        hideAmount: false,
        disablePayerEmails: false,
        timeout: { enabled: false, type: 'checkout', minutes: 5 },
        methods: PAYMENT_METHODS.map((m) => m.id),
        hideAmex: false,
        currency: 'all',
        methodSort: '',
        currencySort: '',
        branding: { enabled: false, color: '#7F6E4B', font: 'Cormorant Garamond', customFont: '', fontSize: '18px', space: '' },
        locale: 'en',
    };

    let state = loadState();
    let serverConfig = { split_recipients: [] };
    let bookingAmountCents = 0;
    let bookingChargeMinor = 0;
    const listeners = new Set();
    let lastFocused = null;

    // ── State ──

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || !FLOWS.some((f) => f.id === saved.flow)) return structuredClone(DEFAULT_STATE);
            const next = {
                ...structuredClone(DEFAULT_STATE),
                ...saved,
                timeout: { ...DEFAULT_STATE.timeout, ...saved.timeout },
                pages: { ...DEFAULT_STATE.pages, ...saved.pages },
                branding: { ...DEFAULT_STATE.branding, ...saved.branding },
            };
            if (next.branding.font !== 'custom' && !(next.branding.font in FONTS)) {
                next.branding.customFont = next.branding.font;
                next.branding.font = 'custom';
            }
            if (typeof next.branding.customFont !== 'string') next.branding.customFont = '';
            if (!CURRENCIES.includes(next.currency)) next.currency = DEFAULT_STATE.currency;
            if (!(next.methodSort in METHOD_SORTS)) next.methodSort = '';
            if (!(next.currencySort in CURRENCY_SORTS)) next.currencySort = '';
            next.hideHeader = next.hideHeader === true;
            next.hideAmount = next.hideAmount === true;
            next.locale = global.I18n?.canonicalLocale
                ? global.I18n.canonicalLocale(next.locale)
                : DEFAULT_STATE.locale;
            return next;
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
        const fields = global.DemoCredentials.fieldMap();
        return fields ? { client_id, code, fields } : { client_id, code };
    }

    function hasApiKey() {
        return Boolean(global.DemoCredentials.get().api_key);
    }

    function currentFlow() {
        return FLOWS.find((f) => f.id === state.flow);
    }

    function isFlowAvailable(flow) {
        if (flow.type !== 'payment' && !hasApiKey()) return false;
        return true;
    }

    /** Why an option can't be used with the selected flow, or null when it can. */
    function unavailableReason(option, flow = currentFlow()) {
        switch (option) {
            case 'split':
                return flow.noAmount ? t('demo.unavailable.needsAmount') : null;
            case 'recipientFormAlways':
                return flow.noAmount ? t('demo.unavailable.noForcePage') : null;
            case 'waiveSurcharge':
                return flow.noAmount ? t('demo.unavailable.needsAmount') : null;
            case 'anonymous':
                if (flow.type !== 'payment') return t('demo.unavailable.cardOnFileNeedsSession');
                return null;
            case 'authenticated':
                return hasApiKey() ? null : t('demo.unavailable.needsApiKey');
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
    /** Stored split amounts are USD cents. Checkout receives recipient minor units. */
    function checkoutAmount(usdCents) {
        return global.DemoMoney ? global.DemoMoney.usdCentsToMinor(usdCents) : usdCents;
    }

    function splitPayload() {
        const items = splitItems()
            .filter((item) => item.recipient && item.amount > 0)
            .map(({ recipient, amount, description, descriptionKey }) => ({
                recipient,
                amount: checkoutAmount(amount),
                description: description || (descriptionKey ? t(descriptionKey) : undefined),
            }));
        return items.length ? items : undefined;
    }

    /** Same rules as checkout validates, so problems show before the guest sees an error. */
    function splitProblems(totalCents) {
        const problems = [];
        const items = splitItems();
        const seen = new Set();
        const base = (recipient().code || '').toUpperCase();
        items.forEach((item, i) => {
            const row = t('demo.split.rowLabel', { n: i + 1 });
            if (!item.recipient) problems.push(t('demo.split.needCode', { row }));
            else if (!PORTAL_CODE.test(item.recipient)) problems.push(t('demo.split.badCode', { row }));
            else if (item.recipient === base) problems.push(t('demo.split.ownPortal', { row, code: base }));
            else if (seen.has(item.recipient)) problems.push(t('demo.split.duplicate', { row, code: item.recipient }));
            seen.add(item.recipient);
            if (!(item.amount > 0)) problems.push(t('demo.split.needAmount', { row }));
        });
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        if (totalCents && total > totalCents) problems.push(t('demo.split.overTotal', { partners: money(total), total: money(totalCents) }));
        return problems;
    }

    /** `cents` are catalog USD cents. Displayed in the recipient currency. */
    function money(cents) {
        if (global.DemoMoney) return global.DemoMoney.formatUsdCents(cents);
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    // ── Checkout options (consumed by app.js) ──

    function buildCheckoutOptions({ amountCents, amountMinor, embedTo }) {
        const flow = currentFlow();

        const details = flow.noAmount ? undefined : {
            amount: amountMinor != null ? amountMinor : checkoutAmount(amountCents),
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
                header: state.hideHeader ? 'hidden' : undefined,
                show_amount_info: state.hideAmount ? false : undefined,
                close_button: state.hideClose ? 'hidden' : undefined,
                disable_payer_emails: state.disablePayerEmails || undefined,
            },
            styles: state.branding.enabled ? brandStyles() : undefined,
            authenticated: effectiveSession(flow) === 'authenticated',
        };
    }

    /**
     * Checkout loads `styles.primary_font` only from fonts.googleapis.com, and the
     * family may contain letters, numbers and spaces.
     */
    function parseGoogleFont(input) {
        const raw = (input || '').trim();
        if (!raw) {
            return { ok: false, message: t('demo.brandFontEmpty') };
        }
        if (/^https?:\/\//i.test(raw)) {
            let url;
            try {
                url = new URL(raw);
            } catch {
                return { ok: false, message: t('demo.brandFontBadUrl') };
            }
            if (url.origin !== GOOGLE_FONTS_ORIGIN) {
                return { ok: false, message: t('demo.brandFontOrigin') };
            }
            const familyParam = url.searchParams.get('family');
            const family = familyParam
                ? familyParam.split(':')[0].replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
                : '';
            if (!FONT_FAMILY.test(family)) {
                return { ok: false, message: t('demo.brandFontFamily') };
            }
            return { ok: true, family, url: url.href };
        }
        const family = raw.replace(/\s+/g, ' ');
        if (!FONT_FAMILY.test(family)) {
            return { ok: false, message: t('demo.brandFontChars') };
        }
        return {
            ok: true,
            family,
            url: `${GOOGLE_FONTS_ORIGIN}/css2?family=${family.replace(/ /g, '+')}:wght@400;500;600&display=swap`,
        };
    }

    function resolveBrandFont() {
        if (state.branding.font !== 'custom') {
            return { url: FONTS[state.branding.font], family: state.branding.font };
        }
        const parsed = parseGoogleFont(state.branding.customFont);
        return parsed.ok ? { url: parsed.url, family: parsed.family } : null;
    }

    function brandStyles() {
        return {
            primary_color: state.branding.color,
            primary_font: resolveBrandFont() || undefined,
            base_font_size: state.branding.fontSize || undefined,
            base_space: state.branding.space || undefined,
        };
    }

    /** 'auto' is checkout's default, so it is left out of initFields. */
    function pageSetting(value) {
        return value === 'auto' ? undefined : value === 'true';
    }

    function buildOfferRules() {
        const filters = {};
        if (state.methods.length && state.methods.length < PAYMENT_METHODS.length) filters.method = state.methods;
        if (state.currency === 'payer_and_recipient') filters.currency = ['payer_currency', 'recipient_currency'];
        else if (state.currency !== 'all') filters.currency = [state.currency];
        if (state.hideAmex) filters.advanced = ['is_not_amex'];

        const sort = [];
        const currencyOrder = CURRENCY_SORTS[state.currencySort];
        const methodOrder = METHOD_SORTS[state.methodSort];
        if (currencyOrder) sort.push({ field: 'currency', order: currencyOrder });
        if (methodOrder) sort.push({ field: 'method', order: methodOrder });

        const rules = {};
        if (Object.keys(filters).length) rules.filters = filters;
        if (sort.length) rules.sort = sort;
        return Object.keys(rules).length ? rules : undefined;
    }

    /** Guest-facing copy for the booking panel. */
    function describeForGuest(formattedAmount) {
        const flow = currentFlow();
        const notes = [];
        const split = state.split && !unavailableReason('split') ? splitPayload() : undefined;
        if (split) {
            const parts = split.map((s) => `${s.description || s.recipient} (${global.DemoMoney ? global.DemoMoney.formatMinor(s.amount) : money(s.amount)})`);
            const listed = parts.length < 2
                ? (parts[0] || '')
                : `${parts.slice(0, -1).join(', ')} ${t('flows.splitAnd')} ${parts[parts.length - 1]}`;
            notes.push(t('flows.splitNote', { parts: listed }));
        }
        if (state.waiveSurcharge && !unavailableReason('waiveSurcharge')) notes.push(t('flows.noSurcharge'));

        return {
            title: t(`flows.${flow.id}.guestTitle`),
            description: t(`flows.${flow.id}.guestDesc`, { amount: formattedAmount }),
            notes,
            cta: t(`flows.${flow.id}.cta`, { amount: formattedAmount }),
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

        global.DemoMoney?.onChange(() => {
            splitEditorKey = null;
            render();
        });

        $('demo-config-open').addEventListener('click', open);
        document.querySelectorAll('#demo-drawer [data-drawer-close]').forEach((el) => el.addEventListener('click', close));
        $('demo-drawer').addEventListener('keydown', onDrawerKeydown);
        bindLangMenu();
    }

    function setLangMenuOpen(open) {
        const menu = $('demo-lang-menu');
        const button = $('demo-lang-btn');
        if (!menu || !button) return;
        menu.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function bindLangMenu() {
        const button = $('demo-lang-btn');
        const menu = $('demo-lang-menu');
        if (!button || !menu || !global.I18n?.locales) return;
        const current = global.I18n.storedLocale();
        menu.replaceChildren(...global.I18n.locales.map((item) => {
            const selected = item.id === current;
            const option = el('button', 'fw-lang-option', item.label);
            option.type = 'button';
            option.setAttribute('role', 'menuitemradio');
            option.setAttribute('aria-checked', selected ? 'true' : 'false');
            option.lang = item.id;
            if (selected) {
                option.setAttribute('aria-current', 'true');
                option.append(el('span', 'fw-lang-check', '✓'));
                option.lastElementChild.setAttribute('aria-hidden', 'true');
            }
            option.addEventListener('click', () => {
                if (selected) setLangMenuOpen(false);
                else global.I18n.choose(item.id);
            });
            const itemRow = el('li');
            itemRow.append(option);
            return itemRow;
        }));
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            setLangMenuOpen(menu.hidden);
        });
        $('demo-drawer').addEventListener('click', (e) => {
            if (menu.hidden || button.contains(e.target) || menu.contains(e.target)) return;
            setLangMenuOpen(false);
        });
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
        setLangMenuOpen(false);
        const drawer = $('demo-drawer');
        drawer.classList.remove('open');
        $('demo-config-open').setAttribute('aria-expanded', 'false');
        document.body.classList.remove('fw-drawer-locked');
        setTimeout(() => { drawer.hidden = true; }, 250);
        lastFocused?.focus();
    }

    function onDrawerKeydown(e) {
        if (e.key === 'Escape') {
            if (!$('demo-lang-menu').hidden) {
                setLangMenuOpen(false);
                $('demo-lang-btn').focus();
                return;
            }
            return close();
        }
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
            const legend = el('legend', 'fw-flow-group-label', t(`flows.groups.${group.id}`));
            const hintKey = `flows.groups.${group.id}Hint`;
            if (global.I18n.has(hintKey)) legend.append(el('span', 'fw-flow-group-hint', t(hintKey)));
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
                const titleRow = el('span', 'fw-flow-option-title', t(`flows.${flow.id}.title`));
                if (flow.type !== 'payment' && !hasApiKey()) titleRow.append(el('span', 'fw-badge fw-badge-warn', t('flows.needsApiKey')));
                body.append(titleRow, el('span', 'fw-flow-option-pitch', t(`flows.${flow.id}.pitch`)), el('code', 'fw-flow-option-tech', techSummary(flow)));

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
        if (flow.noAmount) parts.push(t('flows.noAmountTech'));
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
            label.append(input, el('span', null, t(`demo.method${method.id === 'credit_card' ? 'Cards' : method.id === 'direct_debit' ? 'Debit' : method.id === 'online' ? 'Online' : 'Transfer'}`)));
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
            const fieldKey = {
                first_name: 'demo.fieldFirstName',
                last_name: 'demo.fieldLastName',
                email: 'demo.fieldEmail',
                phone: 'demo.fieldPhone',
                address: 'demo.fieldAddress',
                city: 'demo.fieldCity',
                zip: 'demo.fieldZip',
                country: 'demo.fieldCountry',
            }[field.id];
            label.append(input, el('span', null, t(fieldKey)));
            return label;
        }));
        $('demo-hide-close').addEventListener('change', (e) => setState({ hideClose: e.target.checked }));
        $('demo-hide-header').addEventListener('change', (e) => setState({ hideHeader: e.target.checked }));
        $('demo-hide-amount').addEventListener('change', (e) => setState({ hideAmount: e.target.checked }));
        $('demo-disable-emails').addEventListener('change', (e) => setState({ disablePayerEmails: e.target.checked }));

        $('demo-hide-amex').addEventListener('change', (e) => setState({ hideAmex: e.target.checked }));
        $('demo-currency').addEventListener('change', (e) => setState({ currency: e.target.value }));
        $('demo-currency-sort').addEventListener('change', (e) => setState({ currencySort: e.target.value }));
        $('demo-method-sort').addEventListener('change', (e) => setState({ methodSort: e.target.value }));

        $('demo-branding').addEventListener('change', (e) => setState({ branding: { ...state.branding, enabled: e.target.checked } }));
        $('demo-brand-color').addEventListener('input', (e) => setState({ branding: { ...state.branding, color: e.target.value } }));
        $('demo-brand-font').addEventListener('change', (e) => setState({ branding: { ...state.branding, font: e.target.value } }));
        $('demo-brand-font-custom').addEventListener('input', (e) => setState({ branding: { ...state.branding, font: 'custom', customFont: e.target.value } }));
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
                ? t('demo.sessionAuthenticatedNote')
                : t('demo.sessionAnonymousNote'));

        setToggle('demo-split', state.split, unavailableReason('split'));
        renderSplitEditor();
        setToggle('demo-waive', state.waiveSurcharge, unavailableReason('waiveSurcharge'));
        setToggle('demo-timeout', state.timeout.enabled, null);
        $('demo-timeout-type').value = state.timeout.type;
        $('demo-timeout-minutes').value = String(state.timeout.minutes);
        $('demo-timeout-fields').hidden = !state.timeout.enabled;

        setRadio('demo-payer-form', state.pages.payer);
        const forcedRecipientForm = unavailableReason('recipientFormAlways');
        setDisabled('demo-recipient-form-true', forcedRecipientForm);
        setRadio('demo-recipient-form', state.pages.recipient === 'true' && forcedRecipientForm ? 'auto' : state.pages.recipient);
        $('demo-pages-note').textContent = forcedRecipientForm && state.pages.recipient === 'true'
            ? forcedRecipientForm
            : state.pages.payer === 'false'
                ? t('demo.pagesNoteHidePayer')
                : t('demo.pagesNoteAuto');
        $('demo-disabled-fields').querySelectorAll('input').forEach((input) => {
            input.checked = state.disabledFields.includes(input.value);
        });
        $('demo-disabled-fields-note').textContent = state.disabledFields.length && state.pages.payer !== 'true'
            ? t('demo.readOnlyNoteHidden')
            : t('demo.readOnlyNote');
        $('demo-hide-close').checked = state.hideClose;
        $('demo-hide-header').checked = state.hideHeader;
        $('demo-hide-amount').checked = state.hideAmount;
        $('demo-disable-emails').checked = state.disablePayerEmails;

        $('demo-methods').querySelectorAll('input').forEach((input) => {
            input.checked = state.methods.includes(input.value);
        });
        $('demo-hide-amex').checked = state.hideAmex;
        $('demo-currency').value = state.currency;
        $('demo-currency-sort').value = state.currencySort;
        $('demo-method-sort').value = state.methodSort;

        $('demo-branding').checked = state.branding.enabled;
        $('demo-brand-color').value = state.branding.color;
        $('demo-brand-color-value').textContent = state.branding.color.toUpperCase();
        $('demo-brand-font').value = state.branding.font in FONTS ? state.branding.font : 'custom';
        const customFont = $('demo-brand-font-custom');
        const customWrap = $('demo-brand-font-custom-wrap');
        const showCustomFont = state.branding.enabled && state.branding.font === 'custom';
        customWrap.hidden = !showCustomFont;
        if (customFont.value !== state.branding.customFont) customFont.value = state.branding.customFont;
        const fontNote = $('demo-brand-font-note');
        if (showCustomFont) {
            const parsed = parseGoogleFont(state.branding.customFont);
            fontNote.textContent = parsed.ok
                ? t('demo.brandFontOk', { family: parsed.family })
                : parsed.message;
            fontNote.classList.toggle('fw-help-warn', !parsed.ok);
        } else {
            fontNote.textContent = '';
            fontNote.classList.remove('fw-help-warn');
        }
        $('demo-brand-font-size').value = state.branding.fontSize;
        $('demo-brand-space').value = state.branding.space;
        $('demo-branding-fields').hidden = !state.branding.enabled;
        $('demo-locale').value = state.locale;

        renderCredentialsSummary();

        $('demo-config-open').title = t('nav.checkoutSettingsWithFlow', { flow: t(`flows.${flow.id}.title`) });
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
        const moneyProfile = global.DemoMoney;
        const key = `${items.length}:${moneyProfile ? moneyProfile.code() : 'USD'}:${moneyProfile ? moneyProfile.fx()?.rate : 1}`;
        if (key !== splitEditorKey) {
            splitEditorKey = key;
            const updateItem = (index, patch) => {
                const next = splitItems().map((item, i) => (i === index ? { ...item, ...patch } : { ...item }));
                setState({ splitItems: next });
            };

            const rows = items.map((item, index) => {
                const row = el('div', 'fw-split-row');
                const codeInput = inputEl('text', item.recipient, t('demo.split.codePlaceholder'), t('demo.split.codeLabel', { n: index + 1 }));
                codeInput.maxLength = 5;
                codeInput.addEventListener('input', () => {
                    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    updateItem(index, { recipient: codeInput.value });
                });
                const digits = moneyProfile ? moneyProfile.fractionDigits() : 2;
                const major = item.amount && moneyProfile ? moneyProfile.usdCentsToMajor(item.amount) : (item.amount ? item.amount / 100 : '');
                const amountInput = inputEl(
                    'number',
                    major === '' ? '' : Number(major).toFixed(digits),
                    digits === 0 ? t('demo.split.amountPlaceholderWhole') : t('demo.split.amountPlaceholderCents'),
                    t('demo.split.amountLabel', { n: index + 1, currency: moneyProfile ? moneyProfile.code() : 'USD' })
                );
                amountInput.min = digits === 0 ? '1' : '0.01';
                amountInput.step = digits === 0 ? '1' : '0.01';
                amountInput.addEventListener('input', () => {
                    const typed = Number(amountInput.value);
                    const usdCents = moneyProfile
                        ? moneyProfile.majorToUsdCents(typed)
                        : Math.round(typed * 100);
                    updateItem(index, { amount: Number.isFinite(typed) ? usdCents : 0 });
                });
                const descInput = inputEl('text', splitDescription(item), t('demo.split.whatFor'), t('demo.split.descriptionLabel', { n: index + 1 }));
                descInput.addEventListener('input', () => updateItem(index, { description: descInput.value }));
                const remove = el('button', 'fw-icon-btn fw-split-remove', '×');
                remove.type = 'button';
                remove.setAttribute('aria-label', t('demo.split.remove', { n: index + 1 }));
                remove.disabled = items.length === 1;
                remove.addEventListener('click', () => setState({ splitItems: splitItems().filter((_, i) => i !== index) }));
                const amountWrap = el('span', 'fw-split-amount');
                amountWrap.append(el('span', null, moneyProfile ? moneyProfile.symbol() : '$'), amountInput);
                row.append(codeInput, amountWrap, descInput, remove);
                return row;
            });

            const head = el('div', 'fw-split-row fw-split-head');
            [
                t('demo.split.portalCode'),
                t('demo.split.amount', { currency: moneyProfile ? moneyProfile.code() : 'USD' }),
                t('demo.split.description'),
                '',
            ].forEach((label) => head.append(el('span', null, label)));

            const actions = el('div', 'fw-split-actions');
            const add = el('button', 'fw-btn fw-btn-ghost', t('demo.split.add'));
            add.type = 'button';
            add.disabled = items.length >= MAX_SPLIT_PARTNERS;
            add.addEventListener('click', () => setState({ splitItems: [...splitItems(), { recipient: '', amount: 0, description: '' }] }));
            const reset = el('button', 'fw-btn fw-btn-ghost', t('demo.split.useDefaults'));
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
        const summaryKey = bookingAmountCents ? 'demo.split.summary' : 'demo.split.summaryExample';
        editor.querySelector('.fw-split-summary').textContent = t(summaryKey, {
            partners: money(partners),
            hotel: money(Math.max(0, total - partners)),
            total: money(total),
        });
        const problems = splitProblems(total);
        editor.querySelector('.fw-split-problems').replaceChildren(...problems.map((p) => el('li', null, p)));
    }

    function splitDescription(item) {
        if (item.description) return item.description;
        return item.descriptionKey ? t(item.descriptionKey) : '';
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
            saved.client_name && [t('demo.clientName'), saved.client_name],
            [t('demo.clientId'), saved.client_id],
            [t('demo.recipientCode'), saved.code],
            [t('demo.apiKey'), saved.api_key && global.DemoCredentials.mask(saved.api_key)],
        ].filter(Boolean);
        $('demo-credentials-summary').replaceChildren(...rows.flatMap(([term, value]) => {
            const dd = el('dd', value ? null : 'fw-cred-missing', value || t('common.notSet'));
            return [el('dt', null, term), dd];
        }));
    }

    function renderCodePreview(flow) {
        const options = buildCheckoutOptions({
            amountCents: bookingAmountCents || 735000,
            amountMinor: bookingChargeMinor || undefined,
            embedTo: '#payment-embed-target',
        });
        const savedRecipient = recipient();
        const initFields = global.FlywireCheckout.buildInitFields({
            ...options,
            recipient: {
                client_id: savedRecipient.client_id || 'CLIENT_ID',
                code: savedRecipient.code || 'RECIPIENT_CODE',
                ...(savedRecipient.fields ? { fields: savedRecipient.fields } : {}),
            },
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

        const links = flow.playground.map(([, path]) => [t(`flows.${flow.id}.playground`), path]);
        if (options.authenticated) links.push([t('flows.playground.authenticated'), 'payment/authenticated']);
        if (state.display === 'embedded' || options.config.header || options.config.show_amount_info === false) {
            links.push([t('flows.playground.embedded'), 'payment/embedded']);
        }
        if (options.transaction.details?.split) links.push([t('flows.playground.split'), 'payment/split']);
        if (options.transaction.details?.waive_adjustments) links.push([t('flows.playground.waive'), 'payment/waive_adjustments']);
        if (options.config.offer_rules) links.push([t('flows.playground.offerRules'), 'payment/offer_rules']);
        if (options.styles) links.push([t('flows.playground.styles'), 'payment/with_styles']);
        if (options.config.timeout) links.push([t('flows.playground.timeout'), 'payment/timeout']);
        const { show_payer_form, show_recipient_form, disabled_fields, header, show_amount_info, close_button, disable_payer_emails } = options.config;
        if ([show_payer_form, show_recipient_form, disabled_fields, header, show_amount_info, close_button, disable_payer_emails].some((v) => v !== undefined)) {
            links.push([t('flows.playground.docs'), DOCS_URL]);
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
            btn.textContent = t('common.copied');
        } catch {
            btn.textContent = t('common.copyFailed');
        }
        setTimeout(() => { btn.textContent = t('common.copy'); }, 1500);
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
        setBookingAmount: (cents, chargeMinor) => {
            bookingAmountCents = cents;
            bookingChargeMinor = chargeMinor || 0;
            render();
        },
    };
})(window);
