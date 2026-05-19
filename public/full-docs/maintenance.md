# Static Site Maintenance

This project is intentionally plain static HTML, CSS, and JavaScript. There is no build step, template engine, package manager, framework, or CDN dependency.

When changing shared shell markup, update every top-level page consistently:

- Keep the skip link, sticky header, brand link, mobile menu button, primary navigation, main content landmark, footer, and shared `assets/script.js` include aligned across all pages.
- Keep primary navigation links and `data-nav-page` values in the same order on every page: Overview, Integration, Sessions, Capabilities, Events, API, Reference.
- Keep each page body class and `data-page` value matched to its active navigation key.
- Keep section rail links pointed at section IDs that exist on the same page.
- Keep shared styles and behavior in `assets/styles.css` and `assets/script.js`; do not add page-specific dependencies or inline scripts unless a later task explicitly requires it.
- After shell changes, verify relative links, required landmarks, ASCII-only content, and JavaScript syntax with local tools only.
