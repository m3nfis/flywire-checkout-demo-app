/**
 * Stay picker — dates and guests for the demo booking (hotel scaffolding,
 * not part of the Flywire integration).
 *
 * Default dates are always in the future: a random check-in 3–8 weeks from
 * today, kept for the browser session so a demo doesn't reshuffle on reload.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'caldera.stay.v1';
    const DEFAULT_NIGHTS = 3;
    const MAX_NIGHTS = 30;
    const INCLUDED_GUESTS = 2;
    const EXTRA_GUEST_FEE = 150;
    const LIMITS = { adults: [1, 6], children: [0, 4] };

    let stay = loadStay();
    let draft = null;
    let viewMonth = null;
    const listeners = new Set();
    let trigger = null;
    let popover;

    // ── Dates ──

    function today() {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function addDays(date, days) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    }

    function toIso(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function fromIso(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function nightsBetween(a, b) {
        return Math.round((b - a) / 86400000);
    }

    function sameDay(a, b) {
        return a && b && a.getTime() === b.getTime();
    }

    // ── State ──

    function randomStay() {
        const offset = 21 + Math.floor(Math.random() * 36);
        const checkIn = addDays(today(), offset);
        return { checkIn, checkOut: addDays(checkIn, DEFAULT_NIGHTS), adults: 2, children: 0 };
    }

    function loadStay() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
            const checkIn = fromIso(saved.checkIn);
            const checkOut = fromIso(saved.checkOut);
            if (checkIn > today() && checkOut > checkIn) {
                return { checkIn, checkOut, adults: saved.adults, children: saved.children };
            }
        } catch {
            // fall through to a fresh random stay
        }
        return randomStay();
    }

    function persist() {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            checkIn: toIso(stay.checkIn),
            checkOut: toIso(stay.checkOut),
            adults: stay.adults,
            children: stay.children,
        }));
    }

    function commit(next) {
        stay = next;
        persist();
        renderTrigger();
        listeners.forEach((fn) => fn(get()));
    }

    function get() {
        const guests = stay.adults + stay.children;
        return {
            ...stay,
            nights: nightsBetween(stay.checkIn, stay.checkOut),
            guests,
            extraGuests: Math.max(0, guests - INCLUDED_GUESTS),
            extraGuestFee: EXTRA_GUEST_FEE,
        };
    }

    // ── Formatting ──

    const fmt = (date, options) => date.toLocaleDateString('en-US', options);

    function formatRange(a, b) {
        const sameYear = a.getFullYear() === b.getFullYear();
        const sameMonth = sameYear && a.getMonth() === b.getMonth();
        if (sameMonth) return `${fmt(a, { month: 'long', day: 'numeric' })} – ${b.getDate()}, ${b.getFullYear()}`;
        if (sameYear) return `${fmt(a, { month: 'short', day: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric' })}, ${b.getFullYear()}`;
        return `${fmt(a, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    function plural(n, word) {
        return `${n} ${word}${n === 1 ? '' : 's'}`;
    }

    function guestsLabel(s = stay) {
        const parts = [plural(s.adults, 'Adult')];
        if (s.children) parts.push(s.children === 1 ? '1 Child' : `${s.children} Children`);
        return parts.join(', ');
    }

    const format = {
        short: (date) => fmt(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        long: (date) => fmt(date, { month: 'long', day: 'numeric', year: 'numeric' }),
        guests: () => guestsLabel(),
        nights: (n) => plural(n, 'night'),
    };

    // ── Popover ──

    function init() {
        const triggers = [...document.querySelectorAll('[data-stay-trigger]')];
        popover = document.getElementById('stay-popover');

        triggers.forEach((btn) => btn.addEventListener('click', () => {
            const wasOpenHere = !popover.hidden && trigger === btn;
            close();
            if (!wasOpenHere) open(btn);
        }));
        popover.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        document.addEventListener('mousedown', (e) => {
            if (!popover.hidden && !popover.contains(e.target) && !triggers.some((t) => t.contains(e.target))) close();
        });
        window.addEventListener('resize', () => { if (!popover.hidden) { render(); position(); } });

        persist();
        renderTrigger();
    }

    function open(btn) {
        trigger = btn;
        draft = { checkIn: stay.checkIn, checkOut: stay.checkOut };
        viewMonth = new Date(stay.checkIn.getFullYear(), stay.checkIn.getMonth(), 1);
        popover.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        render();
        position();
        popover.querySelector('.stay-day.selected, .stay-day:not(:disabled)')?.focus({ preventScroll: true });
    }

    function close() {
        if (popover.hidden) return;
        popover.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        draft = null;
        trigger.focus({ preventScroll: true });
    }

    function position() {
        const rect = trigger.getBoundingClientRect();
        const width = popover.offsetWidth;
        // Icon-sized triggers sit at the right edge of a panel, so right-align under them.
        const preferred = rect.width < 64 ? rect.right - width : rect.left + rect.width / 2 - width / 2;
        const left = Math.min(Math.max(12, preferred), document.documentElement.clientWidth - width - 12);
        popover.style.top = `${rect.bottom + window.scrollY + 12}px`;
        popover.style.left = `${left + window.scrollX}px`;
    }

    function renderTrigger() {
        const s = get();
        document.getElementById('stay-summary').textContent =
            `${formatRange(s.checkIn, s.checkOut)} · ${plural(s.nights, 'Night')} · ${plural(s.guests, 'Guest')}`;
    }

    function render() {
        const monthCount = window.innerWidth >= 760 ? 2 : 1;
        const firstMonth = new Date(today().getFullYear(), today().getMonth(), 1);
        const nights = draft.checkOut ? nightsBetween(draft.checkIn, draft.checkOut) : null;

        const header = el('div', 'stay-popover-header');
        const title = el('p', 'stay-popover-title', nights ? plural(nights, 'night') : 'Select check-out date');
        const subtitle = el('p', 'stay-popover-sub', draft.checkOut
            ? formatRange(draft.checkIn, draft.checkOut)
            : `Check-in ${format.short(draft.checkIn)} · up to ${MAX_NIGHTS} nights`);
        header.append(title, subtitle);

        const nav = el('div', 'stay-cal-nav');
        const prev = navButton('Previous month', 'M15 18l-6-6 6-6', viewMonth <= firstMonth, -1);
        const next = navButton('Next month', 'M9 18l6-6-6-6', false, 1);
        nav.append(prev, next);

        const months = el('div', 'stay-cal-months');
        for (let i = 0; i < monthCount; i++) {
            months.append(renderMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + i, 1)));
        }

        const calendar = el('div', 'stay-cal');
        calendar.append(nav, months);

        const guests = el('div', 'stay-guests');
        guests.append(
            stepper('adults', 'Adults', 'Ages 13 or above'),
            stepper('children', 'Children', 'Ages 2–12'),
            el('p', 'stay-guests-note', `Rates include ${INCLUDED_GUESTS} guests. Each extra guest is $${EXTRA_GUEST_FEE} per night.`)
        );

        const footer = el('div', 'stay-popover-footer');
        const reset = el('button', 'stay-link', 'Reset');
        reset.type = 'button';
        reset.addEventListener('click', () => {
            const fresh = randomStay();
            commit(fresh);
            draft = { checkIn: fresh.checkIn, checkOut: fresh.checkOut };
            viewMonth = new Date(fresh.checkIn.getFullYear(), fresh.checkIn.getMonth(), 1);
            render();
        });
        const done = el('button', 'stay-done', 'Done');
        done.type = 'button';
        done.addEventListener('click', close);
        footer.append(reset, done);

        popover.replaceChildren(header, calendar, guests, footer);
    }

    function navButton(label, path, disabled, delta) {
        const btn = el('button', 'stay-nav-btn');
        btn.type = 'button';
        btn.setAttribute('aria-label', label);
        btn.disabled = disabled;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
        btn.addEventListener('click', () => {
            viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
            render();
        });
        return btn;
    }

    function renderMonth(month) {
        const wrap = el('div', 'stay-month');
        wrap.append(el('p', 'stay-month-title', fmt(month, { month: 'long', year: 'numeric' })));

        const grid = el('div', 'stay-grid');
        grid.setAttribute('role', 'grid');
        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((d) => grid.append(el('span', 'stay-weekday', d)));
        for (let i = 0; i < month.getDay(); i++) grid.append(el('span'));

        const minDate = addDays(today(), 1);
        const pickingCheckOut = !draft.checkOut;
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const btn = el('button', 'stay-day', String(day));
            btn.type = 'button';
            btn.setAttribute('aria-label', format.short(date));

            const tooFar = pickingCheckOut && nightsBetween(draft.checkIn, date) > MAX_NIGHTS;
            btn.disabled = date < minDate || tooFar;

            const isStart = sameDay(date, draft.checkIn);
            const isEnd = sameDay(date, draft.checkOut);
            if (isStart || isEnd) {
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');
            }
            if (draft.checkOut && date > draft.checkIn && date < draft.checkOut) btn.classList.add('in-range');

            btn.addEventListener('click', () => selectDate(date));
            grid.append(btn);
        }

        wrap.append(grid);
        return wrap;
    }

    function selectDate(date) {
        if (draft.checkOut || date <= draft.checkIn) {
            draft = { checkIn: date, checkOut: null };
        } else {
            draft = { ...draft, checkOut: date };
            commit({ ...stay, checkIn: draft.checkIn, checkOut: draft.checkOut });
        }
        render();
        popover.querySelector(`.stay-day[aria-label="${format.short(date)}"]`)?.focus({ preventScroll: true });
    }

    function stepper(key, label, hint) {
        const row = el('div', 'stay-stepper');
        const text = el('div', 'stay-stepper-text');
        text.append(el('span', 'stay-stepper-label', label), el('span', 'stay-stepper-hint', hint));

        const [min, max] = LIMITS[key];
        const controls = el('div', 'stay-stepper-controls');
        const value = el('span', 'stay-stepper-value', String(stay[key]));
        value.setAttribute('aria-live', 'polite');
        const change = (delta) => {
            commit({ ...stay, [key]: stay[key] + delta });
            render();
            popover.querySelector(`[data-step="${key}${delta}"]`)?.focus({ preventScroll: true });
        };
        const minus = stepButton(`Remove ${label.toLowerCase()}`, '−', stay[key] <= min, () => change(-1));
        const plus = stepButton(`Add ${label.toLowerCase()}`, '+', stay[key] >= max, () => change(1));
        minus.dataset.step = `${key}-1`;
        plus.dataset.step = `${key}1`;
        controls.append(minus, value, plus);

        row.append(text, controls);
        return row;
    }

    function stepButton(label, symbol, disabled, onClick) {
        const btn = el('button', 'stay-step-btn', symbol);
        btn.type = 'button';
        btn.setAttribute('aria-label', label);
        btn.disabled = disabled;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    global.Stay = {
        init,
        get,
        format,
        onChange: (fn) => listeners.add(fn),
    };
})(window);
