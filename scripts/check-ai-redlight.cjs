const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

// Drive the production animation loop using the browser clock; all game input
// comes through its visible controls. Dataset values are read-only diagnostics.
async function checkAIRedlight(page, outputDir, label = 'web', options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const checks = [];
  const selected = name => !options.cases || options.cases.includes(name);
  const state = () => page.locator('.aib-root').evaluate(el => ({ ...el.dataset }));
  const until = async (predicate, maxMs = 25000, step = 200) => {
    for (let elapsed = 0; elapsed <= maxMs; elapsed += step) {
      const value = await state();
      if (predicate(value)) return value;
      await page.clock.runFor(step);
    }
    throw new Error(`AI flow did not advance: ${JSON.stringify(await state())}`);
  };
  const shot = async name => {
    await page.locator('[data-aib-stage]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, `${label}-${name}.png`), scale: 'css' });
  };
  const fresh = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!page.url().endsWith('#ai')) {
      await page.locator('[data-game="ai"], [data-nav="ai"], a[href="#ai"]').first().click();
    }
    await page.locator('.aib-root').waitFor();
    await page.locator('[data-aib-reset-brain]').click();
    await page.locator('[data-aib-style="balanced"]').click();
  };
  const redTrain = async (decision = false) => {
    await fresh();
    await page.locator('[data-aib-start-train]').click();
    // The first clear-road decision times out safely without teaching a sample.
    return until(s => s.scenario === 'redlight' && s.eventState === (decision ? 'decision' : 'approaching'));
  };
  const passRed = async uid => {
    const green = await until(s => s.eventUid === uid && s.lightGreen === 'true', 6000, 100);
    assert.equal(green.eventState, 'executing');
    await until(s => s.eventUid === uid && +s.speed > 15, 2000, 100);
    await shot('green-restart');
    await until(s => s.eventUid !== uid && s.running === 'true', 12000);
  };
  try {
    if (!options.clockInstalled) {
      await page.clock.install();
      await page.clock.pauseAt(Date.now() + 100);
    }

    if (selected('untrained')) {
      await fresh();
      await page.locator('[data-aib-start-exam]').click();
      const freshRed = await until(s => s.scenario === 'redlight' && s.eventState === 'executing');
      assert.match(await page.locator('[data-aib-coach-text]').innerText(), /安全护航接管/);
      await passRed(freshRed.eventUid);
      await until(s => s.running === 'false' && s.examIndex === '6', 45000);
      assert.match(await page.locator('[data-aib-overlay]').innerText(), /毕业路考成绩单/);
      await shot('untrained-exam-complete');
      checks.push('Untrained automatic exam: red-light safety interception, green restart, all six events complete.');
    }

    if (selected('learned')) {
      const early = await redTrain();
      assert.ok(+early.eventX > 800, `Early-stop coverage requires a distant light: ${early.eventX}`);
      await page.locator('.aib-header-copy h2').click();
      await page.keyboard.press('3');
      await until(s => s.eventUid === early.eventUid && +s.speed <= 1, 2000, 100);
      await page.locator('[data-aib-pause]').click();
      const stopped = await state();
      assert.equal(stopped.lightGreen, 'false');
      assert.ok(+stopped.eventX > 700);
      await page.clock.runFor(3000);
      assert.deepEqual(await state(), stopped, 'Pause must freeze red-light wait and vehicle position.');
      await shot('red-wait-paused');
      await page.locator('[data-aib-pause]').click();
      await passRed(early.eventUid);
      assert.match(await page.locator('[data-aib-memory]').innerText(), /学会「刹停」/);
      checks.push('Training: early keyboard stop, red wait paused/resumed, green restart, learned stop retained.');

      await page.locator('[data-aib-start-exam]').click();
      const learned = await until(s => s.scenario === 'redlight' && s.eventState === 'executing');
      assert.match(await page.locator('[data-aib-coach-text]').innerText(), /AI 自主完美通过/);
      await passRed(learned.eventUid);
      await until(s => s.running === 'false' && s.examIndex === '6', 45000);
      checks.push('Learned automatic exam: autonomous red-light stop resumes and completes the exam.');
    }

    if (selected('window')) {
      const window = await redTrain(true);
      assert.ok(+window.decisionRemaining > 5.2 && +window.decisionRemaining <= 5.5);
      assert.equal(await page.locator('[data-aib-decision-status]').isVisible(), true);
      assert.match(await page.locator('[data-aib-decision-count]').innerText(), /剩余 5\.[2-5] 秒/);
      await shot('decision-5-seconds');
      await page.locator('[data-aib-pause]').click();
      const pausedDecision = await state();
      await page.clock.runFor(3000);
      assert.deepEqual(await state(), pausedDecision, 'Pause must freeze the decision window.');
      await page.locator('[data-aib-pause]').click();
      await page.clock.runFor(5000);
      const late = await state();
      assert.equal(late.bullet, 'true', 'Demonstration must still be possible after five seconds.');
      assert.ok(+late.decisionRemaining > 0 && +late.decisionRemaining < 0.6);
      assert.equal(await page.locator('[data-aib-act="stop"]').isEnabled(), true);
      await page.locator('[data-aib-act="stop"]').click();
      assert.match(await page.locator('[data-aib-coach-text]').innerText(), /示范成功/);
      assert.equal(await page.locator('[data-aib-decision-status]').isVisible(), false);
      await passRed(window.eventUid);
      checks.push('5.5-second window: pause preserves time, a demonstration after five seconds still succeeds.');
    }

    if (selected('timeout')) {
      const timeout = await redTrain(true);
      await page.clock.runFor(5800);
      assert.equal((await state()).bullet, 'false');
      assert.equal((await state()).eventState, 'executing');
      assert.match(await page.locator('[data-aib-coach-text]').innerText(), /安全护航接管/);
      await passRed(timeout.eventUid);
      checks.push('Expired decision: safety coach takes over after 5.5 seconds and the red light resumes.');
    }

    if (selected('wrong')) {
      const bad = await redTrain();
      await page.locator('[data-aib-act="go"]').click();
      assert.match(await page.locator('[data-aib-coach-text]').innerText(), /数据污染实验/);
      assert.match(await page.locator('[data-aib-memory]').innerText(), /误学为「前行」/);
      await passRed(bad.eventUid);
      await page.locator('[data-aib-start-exam]').click();
      const polluted = await until(s => s.scenario === 'redlight' && s.eventState === 'executing');
      assert.match(await page.locator('[data-aib-coach-text]').innerText(), /安全护航接管/);
      await passRed(polluted.eventUid);
      checks.push('Incorrect demonstration and polluted automatic prediction: original wrong memory retained; safety stop resumes.');
    }

    if (selected('pedestrian')) {
      await fresh();
      await page.locator('[data-aib-start-train]').click();
      const pedestrian = await until(s => s.scenario === 'pedestrian' && s.eventState === 'approaching', 45000);
      assert.ok(+pedestrian.eventX > 800);
      await page.locator('[data-aib-act="stop"]').click();
      await until(s => s.eventUid !== pedestrian.eventUid, 12000);
      checks.push('Early pedestrian stop: crossing continues and a later road event appears.');
    }

    assert.deepEqual(errors, []);
    const report = { label, checks, pageErrors: errors };
    await fs.writeFile(path.join(outputDir, `${label}-regression.json`), JSON.stringify(report, null, 2));
    return report;
  } finally {
    page.off('pageerror', onError);
  }
}

module.exports = { checkAIRedlight };

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.QA_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/#ai');
      console.log(JSON.stringify(await checkAIRedlight(page, path.resolve('output/ai-redlight')), null, 2));
    } finally {
      await browser.close();
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
