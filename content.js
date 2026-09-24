(function() {
  'use strict';

  /* Guard against a second instance in the same document. The manifest injects
     this script on load; background.js ALSO injects it into already-open tabs
     when the extension updates, so a tab that was open across an update ends up
     running two copies — two 1s scan intervals, two sets of MutationObservers
     and window listeners, and two adopted stylesheets. It compounds with every
     update. Content scripts of one extension share an isolated world per frame,
     so a flag on `window` is visible to the second copy. */
  if (window.__geminiPolishLoaded) return;
  window.__geminiPolishLoaded = true;

  // ============================================================
  // Mermaid graph renderer (Gemini Polish · unchanged core)
  // ============================================================

  function getTheme() {
    // Runs at document_start, where <body> may not exist yet.
    return document.body && document.body.classList.contains('dark-theme') ? 'dark' : 'default';
  }

  function getMermaidConfig() {
    const theme = getTheme();
    return {
      startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'loose',
      suppressErrorRendering: true,
      flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
      themeVariables: theme === 'dark' ? {
        primaryColor: '#1e1f20', primaryTextColor: '#e3e3e3', primaryBorderColor: '#8ab4f8',
        lineColor: '#c4c7c5', secondaryColor: '#3c4043', tertiaryColor: '#131314'
      } : {},
    };
  }

  function initMermaid(tries = 0) {
    if (window.mermaid) { window.mermaid.initialize(getMermaidConfig()); return; }
    // Bounded: if the library never loads, stop rather than poll forever.
    if (tries < 50) setTimeout(() => initMermaid(tries + 1), 100);
    else console.warn('[Polish] mermaid did not load; diagram rendering is off');
  }
  initMermaid();

  const { cleanMermaidCode } = globalThis.GeminiPolishMermaidClean;

  function safeInjectHTML(container, htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const svg = doc.querySelector('svg');
    if (svg) {
      svg.style.display = 'block';
      const vb = svg.viewBox.baseVal;
      if (vb && vb.width > 0) {
        svg.setAttribute('width', vb.width);
        svg.setAttribute('height', vb.height);
      }
      container.replaceChildren(svg);
      return true;
    }
    return false;
  }

  /* ONE set of window listeners for every diagram on the page. These used to be
     attached per diagram and never removed, so a conversation with N diagrams
     ran N mousemove handlers on every mouse move — a per-frame cost that grew
     with the conversation and was never released. The active diagram registers
     a callback here instead. */
  let activeDrag = null;         // set while a diagram is being panned
  let exitFullscreen = null;     // set while a diagram is fullscreen

  window.addEventListener('mousemove', (e) => { if (activeDrag) activeDrag(e); });
  window.addEventListener('mouseup', () => { activeDrag = null; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exitFullscreen) exitFullscreen();
  });

  function createSide(isCode) {
    const side = document.createElement('div');
    side.className = `mermaid-side ${isCode ? 'mermaid-code-side' : 'mermaid-preview-side'}`;
    const content = document.createElement('div');
    content.className = 'mermaid-side-content';
    side.append(content);
    return { side, content };
  }

  const MERMAID_KEYWORDS = [
    'graph ', 'graph\n', 'graph\r', 'graph LR', 'graph TD', 'sequenceDiagram',
    'erDiagram', 'flowchart ', 'mindmap', 'timeline', 'gantt', 'pie',
    'classDiagram', 'stateDiagram',
  ];

  async function processCodeBlock(codeEl) {
    // 'no' means we already judged this block and it is not a diagram. Without
    // it, every non-mermaid code block on the page was re-sniffed on every
    // scan, forever.
    if (codeEl.dataset.mermaidProcessed) return;

    /* textContent, NOT innerText: innerText is layout-dependent, so reading it
       forces a synchronous reflow. Doing that for every code block on every
       scan is pure cost — the keyword sniff only needs the raw characters. */
    const rawCode = codeEl.textContent;
    const trimmed = rawCode.trim();
    // An empty block is still streaming; leave it unmarked and look again.
    if (!trimmed) return;
    if (!MERMAID_KEYWORDS.some(k => trimmed.startsWith(k))) {
      // The verdict rests on the first token, which no longer changes.
      codeEl.dataset.mermaidProcessed = 'no';
      return;
    }

    codeEl.dataset.mermaidProcessed = 'true';
    const preEl = codeEl.closest('pre');
    if (!preEl) return;
    preEl.style.display = 'none';

    const nativeCodeBlock = preEl.closest('.code-block') || preEl.closest('code-block');
    if (nativeCodeBlock) {
      nativeCodeBlock.classList.add('mermaid-clean-container-outer');
      const nativeHeader = nativeCodeBlock.querySelector('.code-block-decoration');
      if (nativeHeader) nativeHeader.classList.add('mermaid-hidden-native');
    }

    const luminousInner = preEl.closest('.formatted-code-block-internal-container');
    if (luminousInner) {
      luminousInner.classList.add('mermaid-clean-container');
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-wrapper';
    if (rawCode.includes('graph LR') || rawCode.includes('flowchart LR')) {
      wrapper.classList.add('mermaid-vertical');
    }

    const codeSideObj = createSide(true);
    const previewSideObj = createSide(false);
    const mainToolbar = document.createElement('div');
    mainToolbar.className = 'mermaid-main-toolbar';

    const createBtn = (text, onClick, isActive = false) => {
      const btn = document.createElement('button');
      btn.className = `mermaid-toolbar-btn ${isActive ? 'active' : ''}`;
      btn.textContent = text;
      btn.onclick = (e) => { e.stopPropagation(); onClick(btn); };
      return btn;
    };

    const btnCode = createBtn('CODE', (btn) => {
      const isHidden = codeSideObj.side.classList.toggle('mermaid-side-hidden');
      btn.classList.toggle('active', !isHidden);
      if (isHidden && previewSideObj.side.classList.contains('mermaid-side-hidden')) {
        previewSideObj.side.classList.remove('mermaid-side-hidden');
        btnPreview.classList.add('active');
      }
      setTimeout(autoFit, 450);
    }, true);

    const btnPreview = createBtn('PREVIEW', (btn) => {
      const isHidden = previewSideObj.side.classList.toggle('mermaid-side-hidden');
      btn.classList.toggle('active', !isHidden);
      if (isHidden && codeSideObj.side.classList.contains('mermaid-side-hidden')) {
        codeSideObj.side.classList.remove('mermaid-side-hidden');
        btnCode.classList.add('active');
      }
      setTimeout(autoFit, 450);
    }, true);

    const btnLayout = createBtn(wrapper.classList.contains('mermaid-vertical') ? 'VERTICAL' : 'SIDE-BY-SIDE', (btn) => {
      const isVert = wrapper.classList.toggle('mermaid-vertical');
      btn.textContent = isVert ? 'VERTICAL' : 'SIDE-BY-SIDE';
      setTimeout(autoFit, 450);
    });

    let placeholder = null;
    const toggleFullscreen = () => {
      const isFull = wrapper.classList.toggle('mermaid-fullscreen');
      btnFull.classList.toggle('active', isFull);
      btnFull.textContent = isFull ? 'EXIT FULL' : 'FULLSCREEN';
      exitFullscreen = isFull ? toggleFullscreen : null;
      if (isFull) {
        placeholder = document.createElement('div');
        wrapper.after(placeholder);
        document.body.appendChild(wrapper);
      } else {
        if (placeholder) {
          placeholder.after(wrapper);
          placeholder.remove();
          placeholder = null;
        }
      }
      setTimeout(() => render(codePre.textContent), 350);
    };
    const btnFull = createBtn('FULLSCREEN', toggleFullscreen);

    mainToolbar.append(btnCode, btnPreview, btnLayout, btnFull);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'mermaid-copy-btn';
    copyBtn.textContent = 'Copy Code';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(codePre.textContent).then(() => {
        const old = copyBtn.textContent; copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = old, 2000);
      });
    };
    codeSideObj.side.appendChild(copyBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'mermaid-export-btn';
    exportBtn.textContent = 'Export SVG';
    exportBtn.onclick = () => {
      const svg = zoomContainer.querySelector('svg');
      if (svg) {
        const blob = new Blob([svg.outerHTML], {type: 'image/svg+xml'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mermaid-${Date.now()}.svg`;
        a.click();
      }
    };
    previewSideObj.side.appendChild(exportBtn);

    const copyImgBtn = document.createElement('button');
    copyImgBtn.className = 'mermaid-copy-img-btn';
    copyImgBtn.textContent = 'Copy Image';
    copyImgBtn.onclick = () => {
      const svg = zoomContainer.querySelector('svg');
      if (!svg) return;
      const svgClone = svg.cloneNode(true);
      const viewBox = svgClone.viewBox.baseVal;
      const w = viewBox.width || svg.getBoundingClientRect().width || 800;
      const h = viewBox.height || svg.getBoundingClientRect().height || 600;
      svgClone.setAttribute('width', w);
      svgClone.setAttribute('height', h);

      const style = document.createElement('style');
      const isDark = document.body.classList.contains('dark-theme');
      style.textContent = `svg { background: ${isDark ? '#1e1f20' : '#ffffff'}; }`;
      svgClone.prepend(style);

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return;
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
            const old = copyImgBtn.textContent; copyImgBtn.textContent = 'Copied!';
            setTimeout(() => copyImgBtn.textContent = old, 2000);
          }).catch(err => console.error('Copy failed:', err));
        }, 'image/png', 1.0);
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
    };
    previewSideObj.side.appendChild(copyImgBtn);

    const codePre = document.createElement('pre');
    codeSideObj.content.appendChild(codePre);

    const zoomArea = document.createElement('div');
    zoomArea.className = 'mermaid-zoom-area';
    const zoomContainer = document.createElement('div');
    zoomContainer.className = 'mermaid-zoom-container';
    zoomArea.appendChild(zoomContainer);
    previewSideObj.content.appendChild(zoomArea);

    wrapper.append(codeSideObj.side, previewSideObj.side, mainToolbar);
    preEl.after(wrapper);

    let scale = 1, tx = 0, ty = 0;
    const update = () => zoomContainer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

    zoomArea.onwheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.min(Math.max(0.1, scale * delta), 15);
      update();
    };

    zoomArea.onmousedown = (e) => {
      const sx = e.clientX - tx, sy = e.clientY - ty;
      activeDrag = (ev) => { tx = ev.clientX - sx; ty = ev.clientY - sy; update(); };
    };

    const autoFit = () => {
      const svg = zoomContainer.querySelector('svg');
      if (!svg || !wrapper.isConnected) return;

      const vbAttr = svg.getAttribute('viewBox');
      let naturalW, naturalH;
      if (vbAttr) {
        const parts = vbAttr.split(/[\s,]+/).map(Number);
        if (parts.length === 4) { naturalW = parts[2]; naturalH = parts[3]; }
      }
      naturalW = naturalW || svg.viewBox.baseVal.width || 800;
      naturalH = naturalH || svg.viewBox.baseVal.height || 600;

      const containerRect = zoomArea.getBoundingClientRect();
      if (containerRect.width === 0) return;

      const padding = 80;
      scale = Math.min((containerRect.width - padding) / naturalW, (containerRect.height - padding) / naturalH, 4.0);
      tx = 0; ty = 0;
      update();
    };

    const previewId = 'mermaid-' + Math.random().toString(36).substr(2, 9);
    const renderDiv = document.createElement('div');
    renderDiv.id = previewId;
    zoomContainer.appendChild(renderDiv);

    const render = async (code) => {
      if (!code.trim()) return;
      try {
        window.mermaid.initialize(getMermaidConfig());
        codePre.textContent = code;
        const { svg } = await window.mermaid.render(previewId + '-svg', cleanMermaidCode(code));
        if (safeInjectHTML(renderDiv, svg)) {
          requestAnimationFrame(() => setTimeout(autoFit, 50));
        }
      } catch (err) {
        const stray = document.getElementById('d' + previewId + '-svg');
        if (stray) stray.remove();
        renderDiv.replaceChildren(Object.assign(document.createElement('pre'), {className:'mermaid-error', textContent:err.message || String(err)}));
      }
    };

    render(rawCode);

    /* While an answer streams, this block mutates on nearly every frame.
       Re-running mermaid per mutation means generating a full SVG each time —
       so coalesce, and read textContent rather than innerText to avoid forcing
       a reflow on every one of those mutations. */
    let renderTimer = null;
    new MutationObserver(() => {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => render(codeEl.textContent), 300);
    }).observe(codeEl, { characterData: true, childList: true, subtree: true });
  }

  // ============================================================
  // Polish · config + generated stylesheet
  // ============================================================

  const { DEFAULT_CONFIG, mergeConfig, emptyToggles, t } = globalThis.GeminiPolishConfig;
  const { buildCSS } = globalThis.GeminiPolishCSS;

  let currentConfig = DEFAULT_CONFIG;

  /* Write a partial config to both areas. `local` is the authoritative copy
     (no write-rate quota); `sync` is a best-effort cross-device mirror that is
     allowed to fail — its 120-writes/minute cap must never block the UI. */
  function persistPartial(patch) {
    const payload = { ...patch, updatedAt: Date.now() };
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) console.warn('[Polish] local write failed:', chrome.runtime.lastError.message);
    });
    chrome.storage.sync.set(payload, () => {
      if (chrome.runtime.lastError) console.warn('[Polish] sync mirror failed:', chrome.runtime.lastError.message);
    });
  }

  /* One constructed stylesheet, rebuilt whenever config changes.
     `adoptedStyleSheets` is applied after every document stylesheet, so a rule
     Gemini appends later (lazy-loaded Angular components do this) still cannot
     win a tie against ours. Where the constructor is unavailable we fall back to
     a <style> element, which is order-dependent but works in practice. */
  let sheet = null;
  let fallbackStyleEl = null;
  let sheetMode = null;  // 'adopted' | 'element'

  function ensureSheet() {
    if (sheetMode) return;
    try {
      sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      sheetMode = 'adopted';
    } catch (err) {
      console.warn('[Polish] adoptedStyleSheets unavailable, using <style>:', err.message);
      sheet = null;
      fallbackStyleEl = document.createElement('style');
      fallbackStyleEl.id = 'gemini-polish-generated';
      (document.head || document.documentElement).appendChild(fallbackStyleEl);
      sheetMode = 'element';
    }
  }

  /* Named applyConfigToDOM for continuity, but it no longer touches the DOM:
     the old build toggled ~20 `gp-*` classes on <body>, which could only happen
     after storage resolved and so landed after first paint. Now the config
     decides which rules exist at all, so there is no class to be missing and no
     window where the page is styled but the toggles are not. */
  /* Is our stylesheet still attached? Angular can assign
     `document.adoptedStyleSheets` wholesale during bootstrap, and anything we
     adopted at document_start is dropped when it does — which is exactly the
     intermittent "reload, nothing applied" case. A <style> element can likewise
     be lost while the parser builds <head>. */
  function styleIsLive() {
    if (sheetMode === 'adopted') return (document.adoptedStyleSheets || []).indexOf(sheet) !== -1;
    if (sheetMode === 'element') return !!(fallbackStyleEl && fallbackStyleEl.isConnected);
    return false;
  }

  function applyConfigToDOM() {
    // Re-attach rather than write into an orphan: replaceSync on a detached
    // sheet succeeds silently and paints nothing.
    if (sheetMode && !styleIsLive()) { sheetMode = null; sheet = null; fallbackStyleEl = null; }
    ensureSheet();
    const css = buildCSS(currentConfig);
    if (sheetMode === 'adopted') sheet.replaceSync(css);
    else fallbackStyleEl.textContent = css;
  }

  /* Startup watchdog. The race is only during Gemini's bootstrap, so this backs
     off and stops rather than polling forever. */
  function watchAttachment() {
    let tries = 0;
    const tick = () => {
      if (!styleIsLive()) applyConfigToDOM();
      if (++tries < 12) setTimeout(tick, tries < 6 ? 250 : 1000);
    };
    setTimeout(tick, 0);
    document.addEventListener('DOMContentLoaded', () => { if (!styleIsLive()) applyConfigToDOM(); });
    window.addEventListener('load', () => { if (!styleIsLive()) applyConfigToDOM(); });
  }

  // ============================================================
  // Polish · First-run toast (Shadow DOM, isolated from Gemini)
  // ============================================================

  const esc = (v) => String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function showFirstRunHint() {
    if (document.getElementById('gemini-polish-toast-host')) return;
    if (!document.body) {
      setTimeout(showFirstRunHint, 300);
      return;
    }

    const host = document.createElement('div');
    host.id = 'gemini-polish-toast-host';
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .toast {
          width: 320px;
          padding: 16px 18px 14px;
          background: #ffffff;
          color: #202124;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.18);
          font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
          font-size: 13px;
          line-height: 1.5;
          animation: slidein 0.3s ease;
        }
        @media (prefers-color-scheme: dark) {
          .toast { background: #1e1f20; color: #e3e3e3; border-color: rgba(255,255,255,0.1); }
        }
        @keyframes slidein { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .title { font-weight: 600; margin-bottom: 6px; font-size: 14px; display: flex; align-items: center; gap: 6px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #1a73e8; }
        .desc { opacity: 0.8; margin-bottom: 12px; }
        .actions { display: flex; gap: 8px; justify-content: flex-end; }
        button {
          font: inherit; cursor: pointer; padding: 6px 14px; border-radius: 8px;
          border: 1px solid transparent; transition: background 0.15s;
        }
        .primary { background: #1a73e8; color: #fff; }
        .primary:hover { background: #185abc; }
        .secondary { background: transparent; color: inherit; border-color: rgba(0,0,0,0.15); }
        .secondary:hover { background: rgba(0,0,0,0.04); }
        @media (prefers-color-scheme: dark) {
          .secondary { border-color: rgba(255,255,255,0.18); }
          .secondary:hover { background: rgba(255,255,255,0.05); }
        }
      </style>
      <div class="toast">
        <div class="title"><span class="dot"></span>${esc(t('toast_title', "Gemini Polish is active"))}</div>
        <div class="desc">${esc(t('toast_desc', "Comfortable reading typography is on. Open the toolbar icon to adjust anything, or switch to Native Gemini to restore the original interface."))}</div>
        <div class="actions">
          <button class="secondary" data-act="classic">${esc(t('toast_native', "Use native"))}</button>
          <button class="primary" data-act="ok">${esc(t('toast_ok', "Got it"))}</button>
        </div>
      </div>
    `;

    shadow.querySelector('[data-act="ok"]').onclick = () => {
      host.remove();
      persistPartial({ polishOnboarded: true });
    };
    shadow.querySelector('[data-act="classic"]').onclick = () => {
      host.remove();
      // "原生" is the whole-config off switch: structure off AND colours handed
      // back to Gemini, which is the pass-through scheme rather than a palette.
      const off = {
        preset: 'native',
        toggles: emptyToggles(),
        colorScheme: 'native',
      };
      currentConfig = mergeConfig({ ...currentConfig, ...off });
      applyConfigToDOM();
      persistPartial({ ...off, polishOnboarded: true });
    };

    setTimeout(() => { if (host.isConnected) host.remove(); }, 20000);
  }

  // ============================================================
  // Bootstrap · Storage load + reactive updates
  // ============================================================

  /* Read one storage area, resolving to {} instead of rejecting — a quota or
     network failure in `sync` must not stop `local` from being applied. */
  function readArea(area) {
    return new Promise(resolve => {
      if (!chrome.storage || !chrome.storage[area]) return resolve({});
      chrome.storage[area].get(null, (items) => {
        if (chrome.runtime.lastError) {
          console.warn(`[Polish] read ${area} failed:`, chrome.runtime.lastError.message);
          return resolve({});
        }
        resolve(items || {});
      });
    });
  }

  /* Newest-wins merge across the two areas. Both carry `updatedAt`, so a change
     made on another device (which only reaches us through `sync`) still beats a
     stale `local` copy, while same-device edits — always written to `local`
     first — win over a `sync` mirror that lagged behind or was rate-limited. */
  async function loadConfig() {
    const [local, sync] = await Promise.all([readArea('local'), readArea('sync')]);
    const hasLocal = Object.keys(local).length > 0;
    const hasSync = Object.keys(sync).length > 0;
    if (!hasLocal) return mergeConfig(sync);
    if (!hasSync) return mergeConfig(local);
    return mergeConfig(
      (local.updatedAt || 0) >= (sync.updatedAt || 0)
        ? { ...sync, ...local }
        : { ...local, ...sync }
    );
  }

  if (typeof chrome !== 'undefined' && chrome.storage) {
    loadConfig().then(cfg => {
      currentConfig = cfg;
      applyConfigToDOM();
      watchAttachment();
      if (!currentConfig.polishOnboarded) showFirstRunHint();
    });

    /* Coalesced: one popup edit lands in `local` then `sync`, and the popup has
       usually pushed the same config over the live channel already. */
    let reloadTimer = null;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' && area !== 'local') return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        currentConfig = await loadConfig();
        applyConfigToDOM();
      }, 60);
    });
  }

  /* Live preview channel · the popup pushes the in-flight config straight here
     on every input, so settings react immediately instead of waiting for a
     storage write + onChanged round-trip (which throttling can delay or drop). */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      /* The popup edits whichever palette is currently live, so it asks the
         page which theme Gemini is in rather than making the user pick. */
      if (msg && msg.type === 'polish:theme') {
        sendResponse({ dark: !!(document.body && document.body.classList.contains('dark-theme')) });
        return;
      }
      if (!msg || msg.type !== 'polish:apply') return;
      // Layer over the live config, not over the defaults: the popup only sends
      // the fields it owns, so anything else (polishOnboarded, and any future
      // content-side state) must survive the push rather than reset.
      currentConfig = mergeConfig({ ...currentConfig, ...msg.config });
      applyConfigToDOM();
      sendResponse({ ok: true });
    });
  }

  // ============================================================
  // Copy as Markdown · an alternative to Gemini's own copy
  // ============================================================

  /* Gemini's "Copy response" hangs the tab on long answers — reproduced with
     this extension disabled, so it is their conversion, not ours. We cannot fix
     their button, but we can offer one that does not go through it: a single
     walk of the rendered DOM, no reflow-forcing reads. */
  function makeCopyMdButton(response) {
    const btn = document.createElement('button');
    btn.className = 'gp-copy-md';
    btn.type = 'button';
    const label = t('copy_md', "Copy as Markdown");
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
      '<path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>' +
      '<span class="gp-copy-md-text">MD</span>';

    let resetTimer = null;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const md = globalThis.GeminiPolishMarkdown.fromElement(response);
      const done = (ok) => {
        btn.classList.toggle('is-done', ok);
        btn.classList.toggle('is-failed', !ok);
        btn.querySelector('.gp-copy-md-text').textContent =
          ok ? t('copy_done', "Copied") : t('copy_failed', "Copy failed");
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          btn.classList.remove('is-done', 'is-failed');
          btn.querySelector('.gp-copy-md-text').textContent = 'MD';
        }, 1800);
      };
      try { await navigator.clipboard.writeText(md); done(true); }
      catch (err) { console.warn('[Polish] copy failed:', err); done(false); }
    });
    return btn;
  }

  /* `message-actions` is a block-level host: its real button row lives one or two
     levels down in a flex container. Appending to the host puts our button on its
     own line under Gemini's row, so resolve the row first and fall back outward
     only if Gemini's markup changes. Class names carry an Angular version suffix
     (`buttons-container-v2`), hence the substring match. */
  function actionRow(bar) {
    return bar.querySelector('[class*="buttons-container"]')
        || bar.querySelector('[class*="actions-container"]')
        || bar;
  }

  function injectCopyButtons() {
    if (!currentConfig.enableCopyMd) return;
    document.querySelectorAll('message-actions, response-actions, model-response-actions')
      .forEach(bar => {
        const response = bar.closest('model-response');
        // The user's own turn has an action bar too; only answers are copyable.
        if (!response || !response.querySelector('.markdown')) return;
        /* Presence of the button is the guard, not a dataset flag: Angular can
           re-render the inner row while keeping the host, which would drop our
           button and leave a flag claiming it is still there. */
        if (bar.querySelector('.gp-copy-md')) return;
        /* Lead the row rather than trail it. The row ends with a `div.spacer`
           carrying `flex: 1 1 0%`, so anything appended lands on the far side of
           ~560px of stretch and reads as a separate, unrelated control. */
        actionRow(bar).prepend(makeCopyMdButton(response));
      });
  }

  /* Scan when the conversation actually changes, not on a timer. The old 1s
     interval ran forever — in background tabs, in idle conversations, long
     after the last message — and each tick re-sniffed every code block on the
     page. Streaming produces bursts of mutations, so the scan is debounced
     rather than run per mutation. */
  let scanTimer = null;
  function scanForDiagrams() {
    if (currentConfig.enableGraph) {
      document.querySelectorAll('code[data-test-id="code-content"], pre code')
        .forEach(processCodeBlock);
    }
    // Gemini renders its action bar lazily, so this rides the same observer.
    injectCopyButtons();
  }
  function queueScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanForDiagrams, 250);
  }

  function startScanning() {
    if (!document.body) { setTimeout(startScanning, 200); return; }
    scanForDiagrams();
    new MutationObserver(queueScan)
      .observe(document.body, { childList: true, subtree: true });
  }
  startScanning();
})();
