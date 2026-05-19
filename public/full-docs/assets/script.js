(function () {
  var body = document.body;
  var page = body.getAttribute('data-page');
  var navToggle = document.querySelector('[data-nav-toggle]');
  var primaryNav = document.getElementById('primary-navigation');
  var desktopNavQuery = window.matchMedia('(min-width: 821px)');
  var copyStatus = document.createElement('div');

  copyStatus.className = 'visually-hidden';
  copyStatus.setAttribute('role', 'status');
  copyStatus.setAttribute('aria-live', 'polite');
  copyStatus.setAttribute('aria-atomic', 'true');
  document.body.appendChild(copyStatus);

  if (page) {
    document.querySelectorAll('[data-nav-page]').forEach(function (link) {
      if (link.getAttribute('data-nav-page') === page) {
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    primaryNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        closeNavigation();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeNavigation();
      }
    });

    document.addEventListener('click', function (event) {
      if (!body.classList.contains('nav-open')) {
        return;
      }

      if (!primaryNav.contains(event.target) && !navToggle.contains(event.target)) {
        closeNavigation();
      }
    });

    if (desktopNavQuery.addEventListener) {
      desktopNavQuery.addEventListener('change', closeNavigationOnDesktop);
    } else if (desktopNavQuery.addListener) {
      desktopNavQuery.addListener(closeNavigationOnDesktop);
    }

    window.addEventListener('orientationchange', closeNavigationOnDesktop);
    closeNavigationOnDesktop();
  }

  document.querySelectorAll('.code-card').forEach(function (card) {
    var code = card.querySelector('pre code');
    if (!code || card.querySelector('.copy-button')) {
      return;
    }

    var header = document.createElement('div');
    header.className = 'code-card-header';

    var label = document.createElement('span');
    label.textContent = card.getAttribute('data-language') || 'code';

    var button = document.createElement('button');
    button.className = 'copy-button';
    button.type = 'button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code snippet');

    header.appendChild(label);
    header.appendChild(button);
    card.insertBefore(header, card.firstChild);

    button.addEventListener('click', function () {
      var value = code.innerText.replace(/\n$/, '');
      copyText(value).then(function () {
        button.textContent = 'Copied';
        announceCopyStatus('Code copied to clipboard.');
        window.setTimeout(function () {
          button.textContent = 'Copy';
        }, 1800);
      }).catch(function () {
        button.textContent = 'Select code';
        announceCopyStatus('Copy failed. Select the code manually.');
        window.setTimeout(function () {
          button.textContent = 'Copy';
        }, 2200);
      });
    });
  });

  var sectionLinks = Array.prototype.slice.call(document.querySelectorAll('.section-rail a[href^="#"]'));
  var sections = sectionLinks.map(function (link) {
    return document.querySelector(link.getAttribute('href'));
  }).filter(Boolean);

  if (sectionLinks.length) {
    setActiveSection(getInitialSectionId());
    window.addEventListener('hashchange', function () {
      setActiveSection(getInitialSectionId());
    });
  }

  if ('IntersectionObserver' in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        setActiveSection(entry.target.id);
      });
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0.01 });

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function closeNavigation() {
    body.classList.remove('nav-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function closeNavigationOnDesktop() {
    if (desktopNavQuery.matches) {
      closeNavigation();
    }
  }

  function announceCopyStatus(message) {
    copyStatus.textContent = '';
    window.setTimeout(function () {
      copyStatus.textContent = message;
    }, 10);
  }

  function getInitialSectionId() {
    var hashId = window.location.hash ? window.location.hash.slice(1) : '';

    if (hashId && document.getElementById(hashId)) {
      return hashId;
    }

    return sections.length ? sections[0].id : '';
  }

  function setActiveSection(sectionId) {
    sectionLinks.forEach(function (link) {
      var isActive = link.getAttribute('href') === '#' + sectionId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }

    return new Promise(function (resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy') ? resolve() : reject(new Error('Copy command failed'));
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }
})();
