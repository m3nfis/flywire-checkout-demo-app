/**
 * Loads public/i18n/<locale>.yaml and fills the page.
 *
 * Translator comments in the YAML are discarded. Placeholders use {name}.
 * Plural keys end in _one, _other, _two, _few, _many or _zero; pass { count }.
 * The chosen language is `caldera.locale` in localStorage. A missing catalog
 * falls back to English; the saved choice is kept for when that file arrives.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'caldera.locale';

    /** Page languages, one per catalog file. Labels are endonyms, so they are not translated. */
    const LOCALES = [
        { id: 'en', label: 'English' },
        { id: 'en-GB', label: 'English (UK)' },
        { id: 'es-ES', label: 'Español' },
        { id: 'es-419', label: 'Español (Latin America)' },
        { id: 'fr-FR', label: 'Français' },
        { id: 'fr-CA', label: 'Français (CA)' },
        { id: 'pt-PT', label: 'Português' },
        { id: 'pt-BR', label: 'Português (BR)' },
        { id: 'pl', label: 'Polski' },
        { id: 'it', label: 'Italiano' },
        { id: 'ko', label: '한국어' },
        { id: 'zh', label: '中文' },
        { id: 'ja', label: '日本語' },
        { id: 'de', label: 'Deutsch' },
        { id: 'id', label: 'Bahasa Indonesia' },
        { id: 'vi', label: 'Tiếng Việt' },
    ];

    /** Older codes that named the same catalog. Kept so a saved choice still opens that language. */
    const LOCALE_ALIASES = {
        'en-US': 'en',
        es: 'es-ES',
        fr: 'fr-FR',
        pt: 'pt-PT',
        'de-DE': 'de',
        'pl-PL': 'pl',
        'it-IT': 'it',
        'ja-JP': 'ja',
        'ko-KR': 'ko',
        'zh-CN': 'zh',
        'id-ID': 'id',
        'vi-VN': 'vi',
    };

    const cache = { locale: 'en', tree: {} };

    function canonicalLocale(id) {
        const mapped = LOCALE_ALIASES[id] || id;
        return LOCALES.some((item) => item.id === mapped) ? mapped : 'en';
    }

    function storedLocale() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            const id = canonicalLocale(saved);
            if (saved && saved !== id) localStorage.setItem(STORAGE_KEY, id);
            return id;
        } catch {
            return 'en';
        }
    }

    /** Saves the choice and reloads so every string is read in the new language. */
    function choose(id) {
        if (!LOCALES.some((item) => item.id === id) || id === storedLocale()) return;
        try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
        location.reload();
    }

    function unquote(value) {
        if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1).replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch));
        }
        if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1).replace(/''/g, "'");
        }
        return value;
    }

    /** Nested maps and quoted scalars. Full-line comments are ignored. */
    function parseYaml(text) {
        const root = {};
        const stack = [{ indent: -1, node: root }];
        for (const rawLine of text.split(/\r?\n/)) {
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const indent = rawLine.match(/^ */)[0].length;
            const match = trimmed.match(/^([^:]+):\s*(.*)$/);
            if (!match) continue;
            const key = match[1].trim();
            const rest = match[2];
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
            const parent = stack[stack.length - 1].node;
            if (rest === '') {
                const child = {};
                parent[key] = child;
                stack.push({ indent, node: child });
            } else {
                parent[key] = unquote(rest);
            }
        }
        return root;
    }

    function lookup(path) {
        return String(path).split('.').reduce((node, key) => (
            node && typeof node === 'object' ? node[key] : undefined
        ), cache.tree);
    }

    function pluralCategory(count) {
        const n = Number(count);
        try {
            return new Intl.PluralRules(cache.locale).select(n);
        } catch {
            return n === 1 ? 'one' : 'other';
        }
    }

    function resolve(path, vars) {
        const direct = lookup(path);
        if (typeof direct === 'string') return direct;
        if (vars && Object.prototype.hasOwnProperty.call(vars, 'count')) {
            const category = pluralCategory(vars.count);
            const formed = lookup(`${path}_${category}`);
            if (typeof formed === 'string') return formed;
            const fallback = lookup(`${path}_other`);
            if (typeof fallback === 'string') return fallback;
        }
        return undefined;
    }

    function interpolate(value, vars) {
        if (!vars) return value;
        return value.replace(/\{(\w+)\}/g, (match, key) => (
            vars[key] == null ? match : String(vars[key])
        ));
    }

    function t(path, vars) {
        const value = resolve(path, vars);
        return typeof value === 'string' ? interpolate(value, vars) : path;
    }

    function has(path) {
        return typeof lookup(path) === 'string';
    }

    function apply(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const count = el.getAttribute('data-i18n-count');
            const vars = count == null ? undefined : { count: Number(count) };
            el.textContent = t(el.getAttribute('data-i18n'), vars);
        });
        scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
            el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
                const splitAt = pair.indexOf(':');
                if (splitAt === -1) return;
                const attr = pair.slice(0, splitAt).trim();
                const key = pair.slice(splitAt + 1).trim();
                if (attr && key) el.setAttribute(attr, t(key));
            });
        });
    }

    async function load(locale) {
        const requested = locale || 'en';
        let response = await fetch(`/i18n/${encodeURIComponent(requested)}.yaml`);
        let used = requested;
        if (!response.ok && requested !== 'en') {
            response = await fetch('/i18n/en.yaml');
            used = 'en';
        }
        if (!response.ok) throw new Error(`Missing translation file for ${requested}`);
        cache.locale = used;
        cache.tree = parseYaml(await response.text());
        document.documentElement.lang = used;
        apply(document);
        global.DemoCredentials?.renderBanners?.();
        return cache.tree;
    }

    global.I18n = {
        load,
        t,
        has,
        apply,
        locales: LOCALES,
        canonicalLocale,
        storedLocale,
        choose,
        get locale() { return cache.locale; },
        ready: null,
    };

    global.I18n.ready = load(storedLocale());
})(window);
