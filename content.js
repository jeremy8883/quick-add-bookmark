(() => {
  if (window.__quickFindLoaded) return;
  window.__quickFindLoaded = true;

  const HOST_ID = 'quick-find-host';
  const OVERLAY_ID = 'quick-find-scroll-overlay';
  const HIGHLIGHT_STYLE_ID = 'quick-find-highlight-style';

  const options = { regex: false, matchCase: false, wholeWord: false };
  let host, shadow, input, statusEl, scrollOverlay;
  let matches = [];
  let currentIndex = -1;
  let matchHighlight, currentHighlight;
  let isOpen = false;
  let searchTimer = null;

  function injectHighlightStyles() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `
      ::highlight(qf-match) { background-color: #ffeb3b; color: #000; }
      ::highlight(qf-current) { background-color: #ff9800; color: #000; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createUI() {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; position: fixed; top: 16px; right: 24px; z-index: 2147483647;';
    shadow = host.attachShadow({ mode: 'closed' });

    const css = `
      :host { all: initial; }
      .qf-bar {
        display: flex;
        align-items: center;
        gap: 4px;
        background: #2b2b2b;
        color: #e0e0e0;
        font: 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 6px 8px;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        border: 1px solid #3a3a3a;
      }
      .qf-input {
        background: #1e1e1e;
        color: #fff;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 4px 8px;
        font: inherit;
        outline: none;
        width: 240px;
      }
      .qf-input:focus { border-color: #4a9eff; }
      .qf-input.qf-invalid { border-color: #ff6e6e; }
      .qf-status { padding: 0 6px; color: #aaa; min-width: 56px; text-align: center; font-variant-numeric: tabular-nums; }
      .qf-status.qf-no-match { color: #ff6e6e; }
      .qf-btn {
        background: transparent;
        color: #ccc;
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 3px 6px;
        cursor: pointer;
        font: inherit;
        min-width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .qf-btn:hover { background: #3a3a3a; }
      .qf-btn.qf-active { background: #4a9eff; color: #fff; }
      .qf-toggle { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
      .qf-divider { width: 1px; height: 18px; background: #444; margin: 0 2px; }
      .qf-close { font-size: 18px; line-height: 1; }
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <style>${css}</style>
      <div class="qf-bar">
        <input class="qf-input" type="text" placeholder="Find" spellcheck="false" />
        <span class="qf-status"></span>
        <div class="qf-divider"></div>
        <button class="qf-btn qf-toggle" data-toggle="matchCase" title="Match case">Aa</button>
        <button class="qf-btn qf-toggle" data-toggle="wholeWord" title="Whole word">\\b</button>
        <button class="qf-btn qf-toggle" data-toggle="regex" title="Regex">.*</button>
        <div class="qf-divider"></div>
        <button class="qf-btn" data-nav="prev" title="Previous (Shift+Enter)">↑</button>
        <button class="qf-btn" data-nav="next" title="Next (Enter)">↓</button>
        <button class="qf-btn qf-close" title="Close (Esc)">×</button>
      </div>
    `;
    shadow.appendChild(wrapper);

    input = shadow.querySelector('.qf-input');
    statusEl = shadow.querySelector('.qf-status');

    shadow.querySelectorAll('.qf-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        options[key] = !options[key];
        btn.classList.toggle('qf-active', options[key]);
        runSearch();
        input.focus();
      });
    });
    shadow.querySelector('[data-nav="prev"]').addEventListener('click', () => navigate(-1));
    shadow.querySelector('[data-nav="next"]').addEventListener('click', () => navigate(1));
    shadow.querySelector('.qf-close').addEventListener('click', close);

    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 80);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (matches.length === 0) {
          runSearch();
          return;
        }
        navigate(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    document.documentElement.appendChild(host);

    scrollOverlay = document.createElement('div');
    scrollOverlay.id = OVERLAY_ID;
    scrollOverlay.style.cssText = `
      position: fixed; top: 0; right: 0; width: 14px; height: 100vh;
      pointer-events: none; z-index: 2147483646;
    `;
    document.documentElement.appendChild(scrollOverlay);
  }

  function ensureHighlights() {
    if (matchHighlight) return;
    matchHighlight = new Highlight();
    currentHighlight = new Highlight();
    CSS.highlights.set('qf-match', matchHighlight);
    CSS.highlights.set('qf-current', currentHighlight);
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildRegex(query, opts) {
    if (!query) return null;
    let pattern = opts.regex ? query : escapeRegex(query);
    if (opts.wholeWord) pattern = `\\b(?:${pattern})\\b`;
    const flags = `g${opts.matchCase ? '' : 'i'}`;
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (style.display === 'none') return false;
    return true;
  }

  function findMatches(regex) {
    const ranges = [];
    if (!regex || !document.body) return ranges;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(`#${HOST_ID}, #${OVERLAY_ID}`)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      regex.lastIndex = 0;
      let match;
      let safety = 0;
      while ((match = regex.exec(text)) !== null) {
        if (safety++ > 5000) break;
        if (match[0].length === 0) {
          regex.lastIndex++;
          continue;
        }
        const range = new Range();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        ranges.push(range);
        if (ranges.length > 10000) return ranges;
      }
    }
    return ranges;
  }

  function runSearch() {
    const query = input.value;
    const regex = buildRegex(query, options);
    const invalid = options.regex && query && !regex;
    input.classList.toggle('qf-invalid', !!invalid);

    matches = findMatches(regex);
    currentIndex = matches.length > 0 ? 0 : -1;
    applyHighlights();
    updateStatus();
    updateScrollOverlay();
    if (currentIndex >= 0) scrollToCurrent();
  }

  function applyHighlights() {
    ensureHighlights();
    matchHighlight.clear();
    currentHighlight.clear();
    matches.forEach((range, i) => {
      if (i === currentIndex) currentHighlight.add(range);
      else matchHighlight.add(range);
    });
  }

  function updateStatus() {
    if (!input.value) {
      statusEl.textContent = '';
      statusEl.classList.remove('qf-no-match');
      return;
    }
    if (matches.length === 0) {
      statusEl.textContent = '0/0';
      statusEl.classList.add('qf-no-match');
    } else {
      statusEl.textContent = `${currentIndex + 1}/${matches.length}`;
      statusEl.classList.remove('qf-no-match');
    }
  }

  function navigate(dir) {
    if (matches.length === 0) return;
    currentIndex = (currentIndex + dir + matches.length) % matches.length;
    applyHighlights();
    updateStatus();
    updateScrollOverlay();
    scrollToCurrent();
  }

  function scrollToCurrent() {
    const range = matches[currentIndex];
    if (!range) return;
    const rect = range.getBoundingClientRect();
    const margin = 80;
    if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
      const targetY = window.scrollY + rect.top - window.innerHeight / 2;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }
  }

  function updateScrollOverlay() {
    if (!scrollOverlay) return;
    scrollOverlay.replaceChildren();
    if (matches.length === 0) return;
    const docHeight = document.documentElement.scrollHeight;
    const overlayHeight = window.innerHeight;
    if (docHeight <= 0) return;

    const frag = document.createDocumentFragment();
    matches.forEach((range, i) => {
      const rect = range.getBoundingClientRect();
      const docY = rect.top + window.scrollY;
      const tickY = Math.max(0, Math.min(overlayHeight - 2, (docY / docHeight) * overlayHeight));
      const tick = document.createElement('div');
      const isCurrent = i === currentIndex;
      tick.style.cssText = `
        position: absolute;
        top: ${tickY}px;
        right: 2px;
        width: ${isCurrent ? 10 : 8}px;
        height: ${isCurrent ? 3 : 2}px;
        background: ${isCurrent ? '#ff9800' : '#ffeb3b'};
        border-radius: 1px;
        box-shadow: 0 0 1px rgba(0,0,0,0.4);
      `;
      frag.appendChild(tick);
    });
    scrollOverlay.appendChild(frag);
  }

  function open() {
    injectHighlightStyles();
    if (!host) createUI();
    host.style.display = '';
    scrollOverlay.style.display = '';
    isOpen = true;

    const sel = window.getSelection();
    const selText = sel ? sel.toString() : '';
    if (selText && selText.length < 200 && !selText.includes('\n')) {
      input.value = selText;
    }
    input.focus();
    input.select();
    if (input.value) runSearch();
  }

  function close() {
    if (!host) return;
    host.style.display = 'none';
    scrollOverlay.style.display = 'none';
    matchHighlight?.clear();
    currentHighlight?.clear();
    isOpen = false;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'toggle-quick-find') toggle();
  });

  window.addEventListener('scroll', () => {
    if (isOpen) updateScrollOverlay();
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (isOpen) updateScrollOverlay();
  });
})();
