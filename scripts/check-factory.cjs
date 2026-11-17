// Factory v2: real selections, vehicle preview, keyboard, downloads, missions and legacy storage.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
(async () => {
  const { createChallenge } = await import('../src/games/factory-challenge.ts');
  const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  if (base.startsWith('file:')) await context.setOffline(true);
  const old = { version: 1, profile: { nickname: '工厂测试', workstation: '07' }, vehicle: { name: '旧车', color: '#abcdef', battery: 60, motor: 140, body: 'sport' }, progress: { factory: { completed: true, awards: { old: { points: 17, label: '旧积分' } }, data: { configuration: { name: '旧车', color: '#abcdef', battery: 60, motor: 140, body: 'sport' }, saved: true } } } };
  old.progress.factory.data.runs = [{ route: 'city', routeName: '校园快递员', vehicle: old.vehicle, fingerprint: '60-140-sport', targetDistance: 1200, distance: 480, ratio: .4, duration: 80, energy: .1, remaining: 38.9, peakPower: 30, maxSpeed: 40, mass: 1390, rangeEstimate: 200, limiting: '旧教学模型', timestamp: '2026-11-01T00:00:00.000Z' }];
  await context.addInitScript(value => { if (!localStorage.getItem('city-future-garage-v1')) localStorage.setItem('city-future-garage-v1', JSON.stringify(value)); }, old);
  const page = await context.newPage(), errors = [], results = [];
  page.on('pageerror', e => errors.push(e.message));
  fs.mkdirSync('output/playwright', { recursive: true });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')));
  const config = async () => (await state()).progress.factory.data.configuration;
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
  const shot = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `output/playwright/factory-v2-${name}.png`, fullPage: true }); };
  try {
    await page.clock.install();
    await page.goto(base + '#factory'); await page.waitForSelector('.factory-stage canvas');
    await check('legacy vehicle and points are retained; new parts acquire defaults', async () => {
      const v = await config(); assert.equal(v.name, '旧车'); assert.equal(v.body, 'sport'); assert.equal(v.inverter, 100); assert.equal(v.reducer, 9); assert.equal(v.wheels, 'grip');
      assert.equal((await state()).progress.factory.awards.old.points, 17);
      assert.equal((await state()).progress.factory.data.runs[0].fingerprint, '60-140-sport');
    });
    await check('all six parts expose three real options and update diagram and record', async () => {
      for (const [part, choice] of [['battery', 24], ['inverter', 45], ['motor', 60], ['reducer', 12], ['wheels', 'trail'], ['body', 'touring']]) {
        await page.locator(`button[data-part="${part}"]`).click(); assert.equal(await page.locator('.factory-option').count(), 3);
        await page.locator(`[data-option="${choice}"]`).click(); assert.equal((await config())[part], choice);
        assert.equal(await page.locator(`.factory-option[data-option="${choice}"]`).getAttribute('aria-pressed'), 'true');
      }
      const text = await page.locator('.factory-parameter-diagram').textContent(); assert.match(text, /轻巧逆变器/); assert.match(text, /爬坡减速器/); assert.match(text, /大径旅行轮/);
    });
    await check('diagram keyboard selection works and data/save controls live only in the preview widget', async () => {
      const motor = page.locator('[data-diagram-part="motor"]').first(); await motor.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('button[data-part="motor"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.factory-controls .factory-config-summary, .factory-controls .factory-save-row').count(), 0);
      assert.equal(await page.locator('.factory-stage .factory-widget .factory-save').count(), 1);
      await page.locator('.factory-widget-close').click();
      await page.locator('button[data-part="body"]').click();
      for (const body of ['city', 'touring', 'sport']) {
        await page.locator('[data-option="' + body + '"]').click(); await page.clock.runFor(200);
        await page.locator('.factory-stage').screenshot({ path: 'output/playwright/factory-vehicle-only-' + body + '.png' });
      }
      await page.locator('[data-option="touring"]').click();
      await page.locator('.factory-widget-open').click();
    });
    await check('widget supports bounded mouse/keyboard dragging, closing, reopening and remembered position', async () => {
      await page.locator('.factory-stage').scrollIntoViewIfNeeded();
      const initial = await page.locator('.factory-widget').boundingBox(), handle = await page.locator('.factory-widget-handle').boundingBox();
      const drag = async (dx, dy) => {
        const b = await page.locator('.factory-widget-handle').boundingBox();
        await page.mouse.move(b.x + 35, b.y + b.height / 2); await page.mouse.down();
        await page.mouse.move(b.x + 35 + dx, b.y + b.height / 2 + dy, { steps: 8 }); await page.mouse.up();
      };
      await drag(-170, 85);
      const moved = await page.locator('.factory-widget').boundingBox(); assert.ok(moved.x < initial.x - 100); assert.ok(moved.y > initial.y + 60);
      const saved = (await state()).progress.factory.data.widget;
      await page.reload(); await page.waitForSelector('.factory-stage canvas');
      assert.deepEqual((await state()).progress.factory.data.widget, saved);
      const restored = await page.locator('.factory-widget').boundingBox(); assert.ok(Math.abs(restored.x - moved.x) < 2);
      await page.locator('.factory-widget-handle').focus(); await page.keyboard.press('ArrowLeft');
      assert.ok((await page.locator('.factory-widget').boundingBox()).x < restored.x);
      await page.keyboard.press('Home'); await drag(-3000, 3000);
      const box = await page.locator('.factory-widget').boundingBox(), stage = await page.locator('.factory-stage').boundingBox();
      assert.ok(box.x >= stage.x && box.y >= stage.y && box.x + box.width <= stage.x + stage.width + 1 && box.y + box.height <= stage.y + stage.height + 1);
      await page.locator('.factory-widget-handle').focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.factory-widget').isHidden(), true); assert.equal(await page.locator('.factory-widget-open').isVisible(), true);
      await page.reload(); await page.waitForSelector('.factory-stage canvas'); assert.equal(await page.locator('.factory-widget').isHidden(), true);
      await page.locator('.factory-widget-open').click(); await page.locator('.factory-widget-handle').focus(); await page.keyboard.press('Home');
      await page.locator('.factory-stage').screenshot({ path: 'output/playwright/factory-floating-widget.png' });
    });
    await check('preset, speed slider, saving and reload share the selected parameters', async () => {
      await page.locator('[data-setup="hill"]').click(); const v = await config(); assert.equal(v.reducer, 12); assert.equal(v.motor, 140); assert.equal(v.wheels, 'grip');
      await page.locator('#factory-demo-speed').fill('60'); await page.locator('#factory-demo-speed').dispatchEvent('input');
      assert.match(await page.locator('.factory-speed-readings').textContent(), /12圈/); assert.equal(await page.locator('#factory-demo-speed-value').textContent(), '60 km/h');
      await page.locator('#factory-name').fill('未来车 & 工程师'); await page.locator('.factory-save').click();
      assert.equal((await state()).vehicle.reducer, 12); assert.match((await state()).progress.factory.data.report.map(x => x.value).join(' '), /100 kW/);
      await page.reload(); await page.waitForSelector('.factory-stage canvas'); assert.equal((await config()).inverter, 100); assert.equal(await page.locator('#factory-name').inputValue(), '未来车 & 工程师');
    });
    await check('complete SVG/PNG downloads contain the selected six-part diagram', async () => {
      for (const ext of ['svg', 'png']) {
        const wait = page.waitForEvent('download'); await page.locator(`[data-export-parameters="${ext}"]`).click(); const download = await wait;
        const target = path.resolve(`output/playwright/factory-v2-parameters.${ext}`); await download.saveAs(target);
        assert.ok(fs.statSync(target).size > 10000);
        if (ext === 'svg') { const text = fs.readFileSync(target, 'utf8'); assert.match(text, /未来车 &amp; 工程师/); for (const part of ['逆变器', '电机', '减速器', '车轮']) assert.match(text, new RegExp(part)); assert.ok(!text.includes('data-diagram-part')); }
        else { const data = fs.readFileSync(target); assert.equal(data.readUInt32BE(16), 2400); assert.equal(data.readUInt32BE(20), 2100); }
      }
    });
    await check('road challenge completes through real answers and stores new configuration', async () => {
      await page.locator('[data-setup="city"]').click();
      const s = await state(), seed = s.progress.factory.data.attempts.city || 0, challenge = createChallenge('city', seed);
      await page.locator('[data-route="city"]').click(); assert.equal(await page.locator('button[data-part="inverter"]').isDisabled(), true);
      for (const event of challenge.events) {
        await page.clock.runFor(5000); await page.locator('.factory-event').waitFor({ state: 'visible' });
        await page.locator(`[data-decision="${event.choices.findIndex(c => c.correct)}"]`).click(); await page.locator('.factory-event-continue').click();
      }
      await page.clock.runFor(8000); await page.locator('.factory-result').waitFor({ state: 'visible' });
      const run = (await state()).progress.factory.data.runs.at(-1); assert.equal(run.stars, 3); assert.equal(run.ratio, 1); assert.match(run.fingerprint, /^powertrain-v2:/); assert.equal(run.vehicle.inverter, 45);
      assert.equal(await page.locator('.factory-comparison').isHidden(), true, 'legacy physics is not compared with new physics');
      await shot('mission'); await page.locator('.factory-return').click();
    });
    await check('new configurations can produce a valid same-route comparison', async () => {
      await page.locator('button[data-part="wheels"]').click(); await page.locator('[data-option="grip"]').click();
      const seed = (await state()).progress.factory.data.attempts.city, challenge = createChallenge('city', seed);
      await page.locator('[data-route="city"]').click();
      for (const event of challenge.events) { await page.clock.runFor(5000); await page.locator(`[data-decision="${event.choices.findIndex(c => c.correct)}"]`).click(); await page.locator('.factory-event-continue').click(); }
      await page.clock.runFor(8000); assert.equal(await page.locator('.factory-comparison').isVisible(), true);
      assert.equal((await state()).progress.factory.data.compared, true); await page.locator('.factory-return').click();
    });
    await check('320–1920 px layouts keep content inside the page and diagram scrolls locally', async () => {
      for (const width of [320, 390, 768, 1366, 1920]) {
        await page.setViewportSize({ width, height: 900 }); await page.clock.runFor(200);
        const bounds = await page.evaluate(() => ({ width: innerWidth, body: document.documentElement.scrollWidth }));
        assert.ok(bounds.body <= bounds.width + 1, JSON.stringify(bounds));
        if (width === 390 || width === 1366) await shot(String(width));
      }
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.clock.runFor(200); await shot('desktop');
    });
    assert.deepEqual(errors, []); fs.writeFileSync('output/playwright/factory-v2-checks.json', JSON.stringify({ url: base, results, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
