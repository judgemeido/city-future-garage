// Cyberpunk visual and interaction QA. Set QA_URL to Vite or the offline HTML.
// Requires Playwright on NODE_PATH; outputs screenshots plus a JSON audit.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
const games = ['perception', 'factory', 'ai', 'regen', 'parking', 'repair', 'charging', 'grip'];
const pages = ['home', ...games, 'report'];
const output = `output/cyberpunk/${base.startsWith('file:') ? 'offline' : 'online'}`;
const failures = [], warnings = [], audit = [], screenshots = [];
let browser;

async function check(name, run) {
  try { await run(); console.log('PASS', name); }
  catch (error) { failures.push({ name, message: error.message }); console.error('FAIL', name, error.message); }
}

// Resolve translucent control surfaces against their DOM ancestors. A gradient's
// first stop is used for the audit; screenshots remain the visual source of truth.
function inspectPage() {
  function rgba(value) {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return [0, 0, 0, 0];
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  function composite(foreground, background) {
    const alpha = foreground[3];
    return foreground.slice(0, 3).map((value, i) => value * alpha + background[i] * (1 - alpha)).concat(1);
  }
  function luminance(color) {
    const linear = color.slice(0, 3).map(value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  }
  function background(element) {
    const ancestors = []; for (let current = element; current; current = current.parentElement) ancestors.unshift(current);
    let color = [255, 255, 255, 1];
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      color = composite(rgba(style.backgroundColor), color);
      if (style.backgroundImage.includes('gradient')) {
        const stop = rgba(style.backgroundImage); if (stop[3]) color = composite(stop, color);
      }
    }
    return color;
  }
  const bodyBackground = background(document.body);
  const controls = [];
  for (const element of document.querySelectorAll('button,a.btn,summary,input[type=text],select')) {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    if (!rect.width || !rect.height || style.visibility === 'hidden' || element.disabled || element.closest('[hidden]')) continue;
    if (!element.textContent.trim() && !element.getAttribute('aria-label')) continue;
    const textElements = [element, ...element.querySelectorAll('span,strong,b,small')].filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
    for (const textElement of textElements) {
      const textStyle = getComputedStyle(textElement), foreground = rgba(textStyle.color), bg = background(textElement);
      const fg = luminance(composite(foreground, bg)), backdrop = luminance(bg), ratio = (Math.max(fg, backdrop) + .05) / (Math.min(fg, backdrop) + .05);
      controls.push({ label: textElement.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), selector: element.className || element.tagName, ratio: Number(ratio.toFixed(2)), fontSize: parseFloat(textStyle.fontSize), width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  }
  const primary = [...document.querySelectorAll('.btn-primary,.perception-test,.regen-brake,.lab-hold')].filter(e => e.getBoundingClientRect().height && !e.disabled);
  const mainTouches = primary.map(e => ({ label: e.textContent.trim().slice(0, 40), height: e.getBoundingClientRect().height }));
  return { pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, bodyLuminance: luminance(bodyBackground), controls, mainTouches };
}

async function createContactSheet(page, size) {
  const picks = screenshots.filter(item => item.size === size && item.viewport);
  const html = `<!doctype html><html><head><style>body{margin:0;padding:16px;background:#080e21;color:#e8f3ff;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(${size === 'desktop' ? 2 : 5},1fr);gap:14px}figure{margin:0;min-width:0;background:#101a32;border:1px solid #284458}figcaption{padding:9px;color:#47eaff}img{display:block;width:100%}</style></head><body><main>${picks.map(item => `<figure><figcaption>${item.route} · ${size}</figcaption><img src="data:image/png;base64,${fs.readFileSync(item.file).toString('base64')}"></figure>`).join('')}</main></body></html>`;
  await page.setViewportSize({ width: size === 'desktop' ? 1440 : 1400, height: 900 });
  await page.setContent(html); await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await page.screenshot({ path: `${output}/${size}-contact-sheet.png`, fullPage: true });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  if (base.startsWith('file:')) await context.setOffline(true);
  const page = await context.newPage(), runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const visit = async route => {
    await page.goto(`${base}#${route}`); await page.waitForLoadState('networkidle');
    if (games.includes(route)) await page.waitForSelector('canvas[data-logical-width]');
    if (['parking', 'repair', 'charging', 'grip'].includes(route)) await page.waitForFunction(() => document.querySelector('#game-host')?.dataset.photoState === 'ready');
    if (route === 'perception') await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
  };

  await check('fresh lobby offers eight games and a working first experience', async () => {
    await visit('home'); assert.equal(await page.locator('[data-game-card]:visible').count(), 8);
    assert.equal(await page.locator('.hero-actions a').first().getAttribute('href'), '#perception');
    await page.locator('.hero-actions a').first().click(); await page.waitForSelector('.perception-experience');
  });
  await check('home filters expose 8, 3, 3 and 2 games with selected state', async () => {
    await visit('home');
    for (const [filter, count] of [['all', 8], ['build', 3], ['drive', 3], ['observe', 2]]) {
      await page.locator(`[data-filter="${filter}"]`).click();
      assert.equal(await page.locator('[data-game-card]:visible').count(), count, filter);
      assert.equal(await page.locator(`[data-filter="${filter}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.locator('[data-filter="all"]').click();
  });
  await check('continue follows the last game across reload and report visits', async () => {
    await visit('charging'); await visit('report'); await visit('home');
    assert.equal(await page.locator('.hero-actions a').first().getAttribute('href'), '#charging');
    assert.equal(await page.evaluate(() => localStorage.getItem('city-future-garage-last-game')), 'charging');
    await page.reload(); assert.equal(await page.locator('.hero-actions a').first().getAttribute('href'), '#charging');
  });
  await check('keyboard skip link keeps the active game and focuses its content', async () => {
    await visit('parking'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#parking');
    assert.equal(await page.locator('#page-content').evaluate(e => e === document.activeElement), true);
  });
  await check('keyboard focus is visible on the main lobby action', async () => {
    await visit('home'); const link = page.locator('.hero-actions a').first(); await link.focus();
    const focus = await link.evaluate(e => { const s = getComputedStyle(e); return { outline: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow }; });
    assert.ok((focus.outline !== 'none' && focus.width >= 2) || focus.shadow !== 'none');
  });

  // Capture the initial experience after the persistence checks, so the lobby
  // gallery shows all eight cards without carrying QA's earlier route choices.
  await page.evaluate(() => { localStorage.removeItem('city-future-garage-v1'); localStorage.removeItem('city-future-garage-last-game'); });

  for (const [size, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844], ['small', 320, 720]]) {
    await page.setViewportSize({ width, height });
    for (const route of pages) await check(`${route} ${width}px: dark theme, layout, controls and Canvas proportions`, async () => {
      await visit(route);
      const result = await page.evaluate(inspectPage); audit.push({ route, size, ...result });
      if (size !== 'small') {
        const file = path.join(output, `${route}-${size}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const viewport = path.join(output, `${route}-${size}-viewport.png`);
        await page.screenshot({ path: viewport }); screenshots.push({ route, size, viewport: true, file: viewport });
      }
      assert.ok(result.pageWidth <= result.viewport + 1, `page overflows by ${result.pageWidth - result.viewport}px`);
      assert.ok(result.bodyLuminance < .08, `body is not a dark surface (${result.bodyLuminance.toFixed(3)})`);
      for (const canvas of await page.locator('canvas[data-logical-width]').all()) {
        if (!await canvas.isVisible()) continue;
        const ratio = await canvas.evaluate(c => { const r = c.getBoundingClientRect(); return (r.width / r.height) / (Number(c.dataset.logicalWidth) / Number(c.dataset.logicalHeight)); });
        assert.ok(Math.abs(ratio - 1) < .02, `Canvas is stretched (${ratio.toFixed(3)})`);
      }
      for (const touch of result.mainTouches) assert.ok(touch.height >= 43, `main action "${touch.label}" is only ${Math.round(touch.height)}px high`);
      const veryLow = result.controls.filter(control => control.ratio < 3);
      const belowNormal = result.controls.filter(control => control.ratio >= 3 && control.ratio < 4.5);
      if (belowNormal.length) warnings.push({ route, size, type: 'text-contrast-below-4.5', controls: belowNormal });
      if (veryLow.length) warnings.push({ route, size, type: 'text-contrast-below-3', controls: veryLow });
      const allButtons = await page.locator('.btn-primary:visible').all();
      for (const button of allButtons) {
        if (await button.isDisabled()) continue;
        const label = (await button.textContent()).trim().replace(/\s+/g, ' ').slice(0, 60);
        const matching = result.controls.find(control => control.label === label);
        if (matching) assert.ok(matching.ratio >= 4.5, `primary "${label}" contrast ${matching.ratio}:1`);
      }
    });
  }
  await check('narrow navigation reaches the report without page overflow', async () => {
    await page.setViewportSize({ width: 320, height: 720 }); await visit('home');
    const nav = page.locator('.side-nav'); const navSize = await nav.evaluate(e => ({ width: e.clientWidth, scrollWidth: e.scrollWidth }));
    assert.ok(navSize.scrollWidth > navSize.width, 'mobile navigation should scroll horizontally');
    await nav.evaluate(e => { e.scrollLeft = e.scrollWidth; });
    const report = page.locator('.side-nav a[href="#report"]'); const rect = await report.boundingBox();
    assert.ok(rect.x >= -1 && rect.x + rect.width <= 321, 'last nav item is outside the viewport');
    await report.click(); await page.waitForSelector('.report-grid');
  });
  await check('all real photos remain unfiltered and originals decode in dialogs', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of ['perception', 'parking', 'repair', 'charging', 'grip']) {
      await visit(route);
      const selector = route === 'perception' ? '.perception-photo-zoom' : '[data-photo-zoom]';
      await page.locator(selector).click();
      const image = page.locator(route === 'perception' ? '.perception-zoom-image' : '[data-photo-original]');
      const photo = await image.evaluate(async e => { await e.decode(); return { width: e.naturalWidth, height: e.naturalHeight, filter: getComputedStyle(e).filter }; });
      assert.ok(photo.width >= 1000 && photo.height >= 600, `${route} original dimensions`); assert.equal(photo.filter, 'none');
      await page.keyboard.press('Escape');
    }
  });
  await check('downloaded report keeps the dark design and all eight sections', async () => {
    await visit('report'); const pending = page.waitForEvent('download');
    await page.locator('[data-action="download-report"]').click(); const download = await pending;
    const file = `${output}/cyberpunk-report.html`; await download.saveAs(file);
    const reportPage = await context.newPage(); await reportPage.goto(`file:///${path.resolve(file).replace(/\\/g, '/')}`);
    assert.equal(await reportPage.locator('.report-card').count(), 8);
    const result = await reportPage.evaluate(inspectPage); assert.ok(result.bodyLuminance < .08, 'exported report is not dark');
    await reportPage.screenshot({ path: `${output}/downloaded-report.png`, fullPage: true }); await reportPage.close();
  });
  await check('no browser runtime errors', async () => assert.deepEqual(runtimeErrors, []));
  const sheet = await context.newPage();
  await createContactSheet(sheet, 'desktop'); await createContactSheet(sheet, 'mobile');
  await sheet.close();
  fs.writeFileSync(`${output}/qa.json`, JSON.stringify({ base, failures, warnings, runtimeErrors, audit }, null, 2));
  console.log(`Screenshots and audit: ${output}; failures=${failures.length}, contrast warnings=${warnings.length}`);
  await browser.close(); browser = undefined;
  if (failures.length) process.exitCode = 1;
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
