// Run against Vite or a built offline HTML file. Requires Playwright on NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
const failures = [];
async function check(name, run) {
  try { await run(); console.log('PASS', name); }
  catch (error) { failures.push(name); console.error('FAIL', name, error.message); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  const page = await browser.newPage();
  if (base.startsWith('file:')) await page.context().setOffline(true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync('output/responsive', { recursive: true });
  const visit = async route => {
    await page.goto(`${base}#${route}`);
    await page.waitForLoadState('networkidle');
    if (['perception', 'factory', 'ai', 'regen'].includes(route)) await page.waitForSelector('canvas[data-logical-width]');
  };
  await check('primary perception picture fits a desktop viewport', async () => {
    for (const [width, height] of [[1920, 1080], [1920, 900], [1440, 900], [1366, 768], [1280, 720]]) {
      await page.setViewportSize({ width, height }); await visit('perception');
      const rect = await page.locator('.perception-playfield').boundingBox();
      assert.ok(rect.y + rect.height <= height - 20, `${width}×${height}: picture ends at ${Math.round(rect.y + rect.height)}`);
    }
  });
  await check('six different scenes load, switch targets and persist selection', async () => {
    await page.setViewportSize({ width: 1366, height: 900 }); await visit('perception');
    const buttons = page.locator('button[data-scene]');
    assert.equal(await buttons.count(), 6);
    const sceneIds = await buttons.evaluateAll(elements => elements.map(e => e.dataset.scene));
    const pictures = new Set();
    for (const id of sceneIds) {
      await page.locator(`button[data-scene="${id}"]`).click();
      await page.waitForFunction(id => document.querySelector('.perception-experience').dataset.scene === id && document.querySelector('.perception-experience').dataset.imageState === 'ready', id);
      await page.locator('.perception-photo-zoom').click();
      const image = page.locator('.perception-zoom-image');
      await image.evaluate(img => img.decode()); pictures.add(await image.getAttribute('src'));
      assert.ok(await image.evaluate(img => img.naturalWidth >= 1000));
      await page.locator('.perception-zoom-close').click();
      for (const target of await page.locator('[data-target]').evaluateAll(elements => elements.map(e => e.dataset.target))) {
        await page.locator(`[data-target="${target}"]`).click();
        await page.waitForFunction(target => document.querySelector(`[data-target="${target}"]`).classList.contains('is-found'), target);
        await page.locator('.perception-target-zoom').click();
        await image.evaluate(img => img.decode());
        assert.ok(await image.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0));
        await page.locator('.perception-zoom-close').click();
      }
    }
    assert.equal(pictures.size, 6, 'scene choices must show different photographs');
    await page.locator('.perception-capture').click(); await page.reload();
    await page.waitForSelector('canvas[data-logical-width]');
    assert.equal(await page.locator('.perception-experience').getAttribute('data-scene'), sceneIds.at(-1));
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception);
    assert.equal(record.data.discovered.length, 4);
    assert.equal(record.data.scanCompleted, true);
    assert.equal(Object.keys(record.awards).filter(key => key.startsWith('target-')).length, 4, 'changing scenes must not create duplicate category awards');
    assert.match(record.data.report.find(row => row.label === '观察场景').value, /俯瞰斑马线/);
  });
  await check('all pages fit wide and narrow browser windows', async () => {
    for (const width of [1920, 1440, 1366, 1280, 1100, 1024, 900, 768, 600, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['home', 'perception', 'factory', 'ai', 'regen', 'report']) {
        await visit(route);
        const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(sizes.page <= sizes.viewport + 1, `${route} at ${width}px overflows by ${sizes.page - sizes.viewport}px`);
        for (const canvas of await page.locator('canvas[data-logical-width]').all()) {
          const ratio = await canvas.evaluate(c => { const r = c.getBoundingClientRect(); return (r.width / r.height) / (Number(c.dataset.logicalWidth) / Number(c.dataset.logicalHeight)); });
          assert.ok(Math.abs(ratio - 1) < .02, `${route} at ${width}px stretches its canvas`);
        }
      }
    }
  });
  await check('resize preserves split, scene and enabled controls', async () => {
    await page.setViewportSize({ width: 1366, height: 768 }); await visit('perception');
    await page.locator('[data-view="compare"]').click();
    await page.locator('#perception-split').fill('70');
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await page.locator('#perception-split').inputValue(), '70');
    await page.locator('.perception-playfield').scrollIntoViewIfNeeded();
    const stage = await page.locator('.perception-playfield canvas').boundingBox();
    await page.mouse.move(stage.x + stage.width * .6936, stage.y + stage.height * .5);
    await page.mouse.down(); await page.mouse.move(stage.x + stage.width * .3064, stage.y + stage.height * .5, { steps: 10 }); await page.mouse.up();
    assert.ok(Math.abs(Number(await page.locator('#perception-split').inputValue()) - 30) < 3, 'split dragging must still map mouse coordinates after resize');
    await page.locator('.perception-tools summary').click();
    await page.waitForSelector('.perception-tool-playfield canvas[data-logical-width]');
    await page.locator('#perception-distance').fill('30');
    assert.match(await page.locator('[data-value="distance"]').textContent(), /30/);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/responsive/perception-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/responsive/perception-narrow.png', fullPage: true });
  });
  if (!base.startsWith('file:')) await check('failed photograph can be retried without stale scene content', async () => {
    await page.route('**/hong-kong-traffic.jpg*', route => route.abort());
    await visit('perception');
    await page.locator('button[data-scene="hong-kong-traffic"]').click();
    await page.waitForFunction(() => document.querySelector('.perception-experience').dataset.imageState === 'error');
    assert.equal(await page.locator('.perception-photo-zoom').isDisabled(), true);
    await page.unroute('**/hong-kong-traffic.jpg*');
    await page.locator('.perception-image-retry').click();
    await page.waitForFunction(() => document.querySelector('.perception-experience').dataset.imageState === 'ready');
    assert.equal(await page.locator('.perception-photo-zoom').isEnabled(), true);
  });
  await check('no browser runtime errors', async () => assert.deepEqual(errors, []));
  await browser.close();
  if (failures.length) { console.error(`${failures.length} checks failed: ${failures.join(', ')}`); process.exitCode = 1; }
})();
