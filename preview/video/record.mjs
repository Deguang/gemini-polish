/* Records the real 1.3.0 extension driving a real Gemini conversation.
   Frames come from CDP Page.startScreencast, so CSS transitions (the colour
   fades) are captured as they actually render — a screenshot loop would only
   ever catch settled states. Captions are injected into the page as an overlay
   so they are part of the captured stream; no ffmpeg text filters, no fonts to
   ship, no escaping. */
process.env.NO_PROXY = '127.0.0.1,localhost';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '/Users/deguang/Documents/Codespaces/gemini-graph-viewer/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const EXT   = 'hfkikekhjmmoogpmjoehjklgjjnpmjbm';
const DIR   = path.dirname(new URL(import.meta.url).pathname);
const FRAMES= path.join(DIR, 'frames');
/* Record at 1280x720 CSS pixels with a 1.5x device pixel ratio: the captured
   surface is still 1920x1080, but Gemini's fixed-width content column fills
   ~58% of the frame instead of ~38%, and every glyph is 1.5x larger — which is
   what makes the difference on a phone-sized YouTube player. Capturing at
   1920 logical left ~600px of dead white on each side. */
const CSS_W = 1280, CSS_H = 720, DPR = 1.5;
const W = CSS_W * DPR, H = CSS_H * DPR;
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await b.pages();
const gem = pages.find(p => p.url().includes('gemini.google.com'));
if (!gem) { console.log('  ✗ 没有 Gemini 标签页'); process.exit(1); }
const pop = pages.find(p => p.url().includes(EXT))
         || await (async () => { const p = await b.newPage();
              await p.goto(`chrome-extension://${EXT}/popup/popup.html`, { waitUntil:'domcontentloaded' });
              return p; })();

const CONVO = 'https://gemini.google.com/app/18f33d937e48afc9';
await gem.bringToFront();
await gem.setViewport({ width: CSS_W, height: CSS_H, deviceScaleFactor: DPR });
if (!gem.url().includes('18f33d937e48afc9')) {
  await gem.goto(CONVO, { waitUntil: 'domcontentloaded' });
}
/* Wait for the answer AND the extension's diagram pass, not a fixed delay:
   the mermaid block is rendered by our own MutationObserver after Gemini's
   markup lands, and filming before that shows a bare code block. */
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const r = await gem.evaluate(() => ({
    md: document.querySelectorAll('.markdown').length,
    diagram: document.querySelectorAll('svg[id^="mermaid"], [data-mermaid-processed="yes"]').length,
    btn: document.querySelectorAll('.gp-copy-md').length,
  }));
  if (r.md && r.diagram && r.btn) { console.log('  素材就绪:', JSON.stringify(r)); break; }
  if (i === 39) console.log('  ⚠ 素材未完全就绪:', JSON.stringify(r));
}

/* Caption overlay + end card, injected once and driven by name afterwards. */
await gem.evaluate(() => {
  document.getElementById('gp-film')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'gp-film';
  wrap.innerHTML = `
    <style>
      #gp-cap{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);
        z-index:2147483647;background:rgba(20,23,29,.93);color:#fff;
        font:600 21px/1.35 -apple-system,'Segoe UI',Roboto,sans-serif;
        padding:13px 24px;border-radius:11px;letter-spacing:-.2px;
        opacity:0;transition:opacity .45s ease;pointer-events:none;
        box-shadow:0 12px 40px rgba(0,0,0,.28);max-width:78vw;text-align:center}
      #gp-cap.on{opacity:1}
      #gp-end{position:fixed;inset:0;z-index:2147483646;background:#14171d;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:14px;opacity:0;transition:opacity .5s ease;pointer-events:none}
      #gp-end.on{opacity:1}
      #gp-end .t{font:700 46px/1.1 -apple-system,'Segoe UI',Roboto,sans-serif;color:#fff}
      #gp-end .s{font:400 19px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;color:#9aa3b2}
    </style>
    <div id="gp-cap"></div>
    <div id="gp-end"><div class="t">Gemini Polish</div>
      <div class="s">Free on the Chrome Web Store</div></div>`;
  document.documentElement.appendChild(wrap);
  window.__cap = (t) => { const c = document.getElementById('gp-cap');
    if (!t) { c.classList.remove('on'); return; }
    c.classList.remove('on');
    setTimeout(() => { c.textContent = t; c.classList.add('on'); }, 220); };
  window.__end = (on) => document.getElementById('gp-end').classList.toggle('on', on);
});

/* The sidebar lists real conversation titles and notebook names, and this is
   going on YouTube. Collapse it with Gemini's own control — matched on the
   EXACT aria-label, because an earlier loose `[aria-label*="menu"]` match is
   what signed the profile out. Verified before filming rather than assumed. */
const collapsed = await gem.evaluate(() => {
  const btn = document.querySelector('button[aria-label="Close sidebar"]');
  if (!btn) return false;
  btn.click();
  return true;
});
await sleep(1500);
const titlesVisible = await gem.evaluate(() =>
  [...document.querySelectorAll('a[href*="/app/"]')]
    .filter(a => a.getBoundingClientRect().width > 40).length);
if (!collapsed || titlesVisible > 0) {
  console.log(`  ⚠ 侧边栏未收起（按钮:${collapsed} 可见标题:${titlesVisible}），改用模糊兜底`);
  await gem.evaluate(() => {
    const st = document.createElement('style'); st.id = 'gp-privacy';
    st.textContent = `bard-sidenav a[href*="/app/"], bard-sidenav [class*="notebook"] {
      filter: blur(7px) !important; }`;
    document.head.appendChild(st);
  });
} else {
  console.log('  ✓ 侧边栏已收起，无可见会话标题');
}

/* Showing the answer change without showing what caused it reads as magic.
   Mirror the REAL settings panel into the frame: pull popup.js's rendered DOM
   and popup.css straight out of the extension page, and mount them in a shadow
   root so neither stylesheet can reach the other. Re-pulled after every change,
   so the selects show their new values and the panel re-tints with the scheme
   it is editing — the same behaviour the panel has in real use. */
async function popupSnapshot() {
  return pop.evaluate(async () => {
    const d = document;
    d.querySelectorAll('select').forEach(sel =>
      [...sel.options].forEach(o => o.toggleAttribute('selected', o.value === sel.value)));
    d.querySelectorAll('input').forEach(i => {
      i.toggleAttribute('checked', i.checked); i.setAttribute('value', i.value); });
    /* The panel lives at chrome-extension://<id>/popup/popup.html, so an
       absolute '/popup.css' resolves one directory too high and 404s. That
       failure used to be swallowed, and the mirrored panel rendered as raw
       unstyled HTML. Resolve relative to the document instead, and fail loud. */
    const cssUrl = new URL('popup.css', location.href).href;
    const res = await fetch(cssUrl);
    if (!res.ok) throw new Error('popup.css ' + res.status + ' at ' + cssUrl);
    const css = await res.text();
    /* Relative <img src> would not resolve once the markup is moved into the
       Gemini page; inline it. */
    /* popup.html sits in popup/, the icon at the extension root. */
    const iconUrl = new URL('../icon.png', location.href).href;
    const icon = await fetch(iconUrl).then(r => r.blob()).then(bl =>
      new Promise(ok => { const fr = new FileReader();
        fr.onload = () => ok(fr.result); fr.readAsDataURL(bl); })).catch(() => '');
    d.querySelectorAll('img').forEach(i => { if (icon) i.setAttribute('src', icon); });
    return { html: d.body.innerHTML, css,
             rootStyle: d.documentElement.getAttribute('style') || '' };
  });
}

async function mountPanel() {
  const snap = await popupSnapshot();
  await gem.evaluate(({ html, css, rootStyle }) => {
    let host = document.getElementById('gp-panel');
    if (!host) {
      host = document.createElement('div');
      host.id = 'gp-panel';
      host.style.cssText =
        'position:fixed;right:34px;bottom:150px;width:348px;z-index:2147483645;' +
        'border-radius:14px;overflow:hidden;background:#fff;' +
        'box-shadow:0 18px 60px rgba(0,0,0,.22);transform-origin:100% 100%;' +
        'transform:scale(.78);' +
        'opacity:0;transition:opacity .5s ease';
      host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);
      window.__panel = (on) => { host.style.opacity = on ? '1' : '0'; };
    }
    /* popup.css targets :root and body; inside a shadow root neither matches,
       so both are re-pointed at the host element. */
    const scoped = css.split(':root').join(':host').replace(/(^|[^-\w])body\b/g, '$1:host');
    host.shadowRoot.innerHTML = `<style>:host{${rootStyle}}\n${scoped}</style>${html}`;
  }, snap);
}
await mountPanel();

const apply = async (patch) => {
  for (const [id, val] of Object.entries(patch)) {
    await pop.select('#' + id, val).catch(() => {});
  }
  await mountPanel();          // keep the mirrored panel in step with the page
};

const client = await gem.createCDPSession();
let n = 0; const meta = [];
client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const f = String(n++).padStart(5, '0') + '.jpg';
  fs.writeFileSync(path.join(FRAMES, f), Buffer.from(data, 'base64'));
  meta.push({ f, t: metadata.timestamp });
  try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
});

/* Gemini opens a loaded conversation scrolled to the bottom of the answer.
   Starting there drops the viewer mid-sentence with no idea what was asked —
   open on the question instead. Instant, not smooth: this happens before the
   first frame is captured, so it must be settled by the time recording starts. */
await gem.evaluate(() => {
  const q = document.querySelector('user-query, .user-query-bubble-with-background');
  if (q) { q.scrollIntoView({ behavior: 'auto', block: 'start' }); return; }
  const sc = document.querySelector('infinite-scroller, .chat-history, main')
          || document.scrollingElement;
  sc.scrollTop = 0;
});
await sleep(1200);

console.log('  开始录制…');
await client.send('Page.startScreencast',
  { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const t0 = Date.now();
const at = async (ms) => { const d = ms - (Date.now() - t0); if (d > 0) await sleep(d); };

// 0:00 — native, dense
await apply({ preset: 'native', colorScheme: 'native' });
await gem.evaluate(() => { window.__panel(false);
  window.__cap('Gemini answers are dense by default.'); });
await at(4200);

// 0:04 — typography, then a slow drift through the restyled answer
/* Panel in first, then the change — so the viewer sees the cause before the
   effect rather than wondering what moved. */
await gem.evaluate(() => { window.__panel(true);
  window.__cap('One control changes the typography.'); });
await sleep(900);
await apply({ preset: 'comfort' });
await sleep(1200);
/* Drift rather than jump: the point of this beat is the reading experience,
   and a smooth crawl shows headings, lists, table and quotes in sequence. */
await gem.evaluate(() => {
  const sc = document.querySelector('infinite-scroller, .chat-history, main') || document.scrollingElement;
  window.__drift = (px, ms) => new Promise(res => {
    const t0 = performance.now(), from = sc.scrollTop;
    const step = (t) => { const k = Math.min(1, (t - t0) / ms);
      sc.scrollTop = from + px * (k < .5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2);
      k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
});
await gem.evaluate(() => window.__drift(520, 3600));
await at(10200);

// 0:10 — colour, over that same rich content (the visual payoff, longest beat)
/* Park on prose before cycling. A scheme repaints headings, bold text, inline
   code, table borders and the quote bar — none of which are on screen if the
   viewport is sitting on the diagram, which is what the drift above ends on.
   The table is the anchor: it puts a heading, body text, a list and the quote
   in frame around it. */
await gem.evaluate(() => {
  const md = [...document.querySelectorAll('.markdown')].pop();
  const anchor = md?.querySelector('table') || md?.querySelector('blockquote');
  anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
await sleep(1600);
await gem.evaluate(() => window.__cap('Six colour schemes. Light and dark, matched.'));
for (const s of ['amber', 'nord', 'gruvbox', 'sepia', 'solarized', 'amber']) {
  await apply({ colorScheme: s });
  await sleep(1050);
}
await at(18400);

// 0:18 — diagram: shown in place beside its source, with a short fullscreen peek
await gem.evaluate(() => { window.__panel(false);
  window.__cap('Diagrams render beside their source.'); });
await gem.evaluate(() => {
  document.querySelector('.mermaid-clean-container-outer, .mermaid-wrapper')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
await sleep(2400);
const wentFull = await gem.evaluate(() => {
  const btn = [...document.querySelectorAll('.mermaid-toolbar-btn')]
    .find(b => /fullscreen/i.test(b.textContent || ''));
  if (!btn) return false;
  btn.click(); return true;
});
console.log('  全屏切换:', wentFull ? '✓' : '✗');
await sleep(2600);
await gem.evaluate(() => {
  const btn = [...document.querySelectorAll('.mermaid-toolbar-btn')]
    .find(b => /exit/i.test(b.textContent || ''));
  btn ? btn.click() : null;
});
await at(24200);

// 0:24 — copy as markdown
await gem.evaluate(() => window.__cap('Copy any answer as clean Markdown.'));
await gem.evaluate(() => {
  document.querySelector('.gp-copy-md')?.scrollIntoView({ behavior:'smooth', block:'center' });
});
await sleep(1600);
await gem.evaluate(() => document.querySelector('.gp-copy-md')?.click());
await at(27200);

// 0:27 — end card
await gem.evaluate(() => { window.__cap(''); window.__end(true); });
await at(30200);

await client.send('Page.stopScreencast');
await gem.evaluate(() => { document.getElementById('gp-film')?.remove();
  document.getElementById('gp-privacy')?.remove(); });
fs.writeFileSync(path.join(DIR, 'frames.json'), JSON.stringify(meta));
console.log(`  录制完成：${meta.length} 帧，${((Date.now()-t0)/1000).toFixed(1)}s`);
b.disconnect();
