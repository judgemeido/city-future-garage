import './styles.css';
import { mountPerception } from './games/perception';
import { mountFactory } from './games/factory';
import { mountAI } from './games/ai';
import { mountRegen } from './games/regen';
import { downloadFile, escapeHTML } from './platform';
import { heroIllustration, icon } from './visuals';
import { premiumCarSVG } from './car-art';
import { GAME_IDS, loadState, persist, score, totalScore, sanitizeVehicle } from './store';
import type { AppState, GameAPI, GameId, MountedGame, MountGame } from './types';

const state: AppState = loadState();
const app = document.querySelector<HTMLDivElement>('#app')!;
let mounted: MountedGame | undefined;
let toastLast = '', toastTime = 0;
const metadata: Record<GameId, { title: string; subtitle: string; icon: string; tag: string; description: string; short: string }> = {
  perception: { title: '汽车的超级眼睛', subtitle: '滑动、扫描、发现：换个视角看城市。', icon: 'eye', tag: 'PERCEPTION LAB · 感知', description: '打开汽车的超级视界，发现道路里的秘密。', short: '超级眼睛' },
  factory: { title: '我的新能源车厂', subtitle: '把零件装进去，把你的想法开出来。', icon: 'car', tag: 'EV GARAGE · 创造', description: '选部件、换颜色，造一辆属于你的新能源车。', short: '造车工厂' },
  ai: { title: '我教的 AI 小司机', subtitle: '给它一点示范，看看它学会了什么。', icon: 'ai', tag: 'AI DRIVING · 训练', description: '亲手教一个小司机，陪它在城市里练习。', short: 'AI 司机' },
  regen: { title: '刹车充电秀', subtitle: '停得漂亮，也看看能量去了哪里。', icon: 'bolt', tag: 'ENERGY TRACK · 探索', description: '轻轻刹车，让看不见的能量流动起来。', short: '能量回收' }
};
const mounts: Record<GameId, MountGame> = { perception: mountPerception, factory: mountFactory, ai: mountAI, regen: mountRegen };
const toastRegion = document.createElement('div'); toastRegion.className = 'toast-region'; toastRegion.setAttribute('aria-live', 'polite'); document.body.append(toastRegion);
function notify(message: string) {
  const now = Date.now(); if (message === toastLast && now - toastTime < 1800) return;
  toastLast = message; toastTime = now;
  if (toastRegion.children.length >= 2) toastRegion.firstElementChild?.remove();
  const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `${icon('check', 17)}<span>${escapeHTML(message)}</span>`;
  toastRegion.append(toast); setTimeout(() => { toast.classList.add('fade'); setTimeout(() => toast.remove(), 220); }, 2700);
  playChime();
}
let audioContext: AudioContext | undefined;
function playChime() {
  if (state.muted) return;
  try {
    audioContext ??= new AudioContext(); void audioContext.resume();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.connect(gain); gain.connect(audioContext.destination);
    const time = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(660, time); oscillator.frequency.exponentialRampToValueAtTime(880, time + .08);
    gain.gain.setValueAtTime(.04, time); gain.gain.exponentialRampToValueAtTime(.001, time + .18);
    oscillator.start(time); oscillator.stop(time + .19);
  } catch { /* Sound is optional. */ }
}
function updateProgressUI() {
  document.querySelectorAll<HTMLElement>('[data-total-score]').forEach(el => el.textContent = String(totalScore(state)));
  document.querySelectorAll<HTMLElement>('[data-stamp-count]').forEach(el => el.textContent = String(GAME_IDS.filter(id => state.progress[id].completed).length));
  for (const id of GAME_IDS) {
    document.querySelectorAll<HTMLElement>(`[data-score="${id}"]`).forEach(el => el.textContent = String(score(state.progress[id])));
    document.querySelectorAll<HTMLElement>(`[data-stamp="${id}"]`).forEach(el => {
      el.classList.toggle('complete', state.progress[id].completed);
      el.innerHTML = state.progress[id].completed ? `${icon('check', 12)} 已体验` : '随时可玩';
    });
  }
  document.querySelectorAll<HTMLElement>('[data-profile-name]').forEach(el => el.textContent = state.profile.nickname);
  document.querySelectorAll<HTMLElement>('[data-workstation]').forEach(el => el.textContent = state.profile.workstation);
}
const api: GameAPI = {
  award(game, key, points, label) {
    if (!Number.isFinite(points)) return;
    const previous = state.progress[game].awards[key]?.points ?? 0;
    const next = Math.min(100, Math.max(0, points));
    if (next <= previous + .001) return;
    const before = score(state.progress[game]);
    state.progress[game].awards[key] = { points: next, label };
    persist(state); updateProgressUI();
    const increase = score(state.progress[game]) - before;
    if (increase > 0) notify(`${label} · +${increase} 积分`);
  },
  complete(game) {
    if (state.progress[game].completed) return;
    state.progress[game].completed = true; persist(state); updateProgressUI(); notify(`${metadata[game].short}体验章，收好啦！`);
  },
  record(game, data) { state.progress[game].data = { ...state.progress[game].data, ...data }; persist(state); },
  getRecord(game) { return structuredClone(state.progress[game].data); },
  saveImage(game, image) { if (image.startsWith('data:image/')) { state.progress[game].image = image; persist(state); } },
  notify,
  getVehicle: () => ({ ...state.vehicle }),
  setVehicle(vehicle) { state.vehicle = sanitizeVehicle(vehicle); persist(state); },
  getProfile: () => ({ ...state.profile })
};
function sidebar(active: string): string {
  const nav = (id: string, name: string, symbol: string) => `<a class="nav-button ${active === id ? 'active' : ''}" href="#${id}" aria-label="${name}" ${active === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span></a>`;
  return `<aside class="sidebar"><a class="brand-mark" href="#home" aria-label="城市未来车厂首页">未</a><nav class="side-nav">${nav('home', '体验大厅', 'home')}${GAME_IDS.map(id => nav(id, metadata[id].short, metadata[id].icon)).join('')}${nav('report', '我的作品', 'report')}</nav><div class="sidebar-bottom"><button class="nav-button" data-action="sound" aria-label="${state.muted ? '开启音效' : '关闭音效'}">${icon(state.muted ? 'muted' : 'sound', 20)}<span>${state.muted ? '音效关闭' : '音效开启'}</span></button><button class="nav-button" data-action="profile">${icon('settings', 20)}<span>我的工位</span></button></div></aside>`;
}
function header(page: string): string {
  const title = page === 'home' ? '体验大厅' : page === 'report' ? '我的作品' : metadata[page as GameId].short;
  return `<header class="topbar"><div class="breadcrumb"><b>城市未来车厂</b><span>/</span><span>${title}</span></div><div class="topbar-actions"><div class="score-pill">${icon('star', 14)}<b data-total-score>${totalScore(state)}</b><span>/ 400 成就积分</span></div><button class="profile-button" data-action="profile"><span class="avatar">${icon('person', 17)}</span><span class="profile-copy"><strong data-profile-name>${escapeHTML(state.profile.nickname)}</strong><span>工位 <span data-workstation>${escapeHTML(state.profile.workstation)}</span></span></span></button></div></header>`;
}
function footer() { return `<footer class="site-footer"><span class="footer-label">城市未来车厂 · 智驾小工程师</span><span>四款独立体验 · 积分鼓励探索 · 教学仿真</span></footer>`; }
function cardArt(id: GameId): string {
  const common = 'viewBox="0 0 320 170" role="img"';
  if (id === 'perception') return `<svg ${common} aria-label="感知扫描道路插画"><rect width="320" height="170" fill="#dce5dc"/><rect x="142" width="80" height="170" fill="#2f4853"/><path d="M182 0v170" stroke="#a2d2c1" stroke-width="2" stroke-dasharray="8 8"/><g fill="#aac0b3"><rect x="26" y="56" width="71" height="103" rx="4"/><rect x="102" y="90" width="28" height="67" rx="3"/><rect x="243" y="29" width="49" height="128" rx="4"/></g><rect x="149" y="84" width="26" height="42" rx="7" fill="#80cca2"/><rect x="199" y="39" width="20" height="35" rx="6" fill="#e8d590"/><path d="M13 129h294" stroke="#c3d2c6" stroke-width="18"/><g fill="none" stroke="#2e9673" stroke-width="1.5"><rect x="144" y="79" width="37" height="54" rx="3"/><rect x="193" y="34" width="32" height="46" rx="3"/><path d="m148 96 39-33m-33 12 40-33" opacity=".45"/></g><circle cx="171" cy="98" r="46" stroke="#2e9673" fill="#64d7a414" stroke-dasharray="3 4"/><path d="M171 46v104" stroke="#fbffeb" stroke-width="2"/><circle cx="171" cy="98" r="10" fill="#eff9eb"/><path d="m168 94 7 4-7 4" stroke="#619173" fill="none"/></svg>`;
  if (id === 'factory') return `<svg ${common} aria-label="新能源车工厂插画"><rect width="320" height="170" fill="#eee6d6"/><path d="M22 138h276" stroke="#cdbd9d" stroke-width="2"/><path d="M37 52h50v75m168-75h28v75" fill="none" stroke="#d7c8aa" stroke-width="2"/><g fill="#faf7ed" stroke="#cbbc9b"><rect x="33" y="39" width="45" height="28" rx="5"/><rect x="248" y="30" width="40" height="36" rx="5"/></g><svg x="40" y="30" width="244" height="129">${premiumCarSVG('#dfa158', 'touring')}</svg><path d="M103 20v21m113-21v21" stroke="#b59a6b" stroke-width="1.5" stroke-dasharray="3 4"/><circle cx="103" cy="19" r="5" fill="#c4a96e"/><circle cx="216" cy="19" r="5" fill="#c4a96e"/></svg>`;
  if (id === 'ai') return `<svg ${common} aria-label="AI小司机插画"><rect width="320" height="170" fill="#e1e3ed"/><path d="M0 132c95-80 175 20 320-71" stroke="#aeb6d0" stroke-width="44" fill="none"/><path d="M0 132c95-80 175 20 320-71" stroke="#f1f0f7" stroke-width="2" stroke-dasharray="8 9" fill="none"/><g transform="translate(88 32)"><rect x="26" y="17" width="91" height="66" rx="24" fill="#f9f8f3" stroke="#9ba1c5" stroke-width="2"/><path d="M71 6v12" stroke="#868dac" stroke-width="2"/><circle cx="71" cy="5" r="5" fill="#a1a8d6"/><rect x="40" y="35" width="64" height="29" rx="14" fill="#69729b"/><circle cx="55" cy="48" r="5" fill="#d7f0da"/><circle cx="89" cy="48" r="5" fill="#d7f0da"/><path d="M66 65q6 6 12 0" stroke="#8695ad" fill="none"/><rect x="15" y="41" width="11" height="24" rx="5" fill="#bcc1db"/><rect x="117" y="41" width="11" height="24" rx="5" fill="#bcc1db"/></g><rect x="217" y="25" width="72" height="33" rx="10" fill="#faf9f3"/><text x="235" y="46" font-size="12" fill="#8186a3" font-family="sans-serif">我学会啦!</text><path d="m232 58-8 9 19-9" fill="#faf9f3"/></svg>`;
  return `<svg ${common} aria-label="能量回收插画"><rect width="320" height="170" fill="#e3ead2"/><path d="M22 139h281" stroke="#a4b785" stroke-width="2"/><svg x="18" y="35" width="228" height="120">${premiumCarSVG('#88a955', 'sport')}</svg><rect x="252" y="62" width="31" height="63" rx="6" fill="#f9fbed" stroke="#8da262" stroke-width="1.4"/><rect x="261" y="57" width="13" height="4" rx="2" fill="#8da262"/><rect x="257" y="89" width="21" height="30" rx="3" fill="#afc875"/><path d="m268 72-9 12h8l-3 11 11-15h-8z" fill="#7d9a45"/><path d="M171 32q50-22 79 8m-2-12 7 15-17-3" stroke="#90ab5c" stroke-width="2" fill="none" stroke-dasharray="5 4"/></svg>`;
}
function renderHome() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">FUTURE CITY GARAGE · 城市科普体验</div><h1>把未来，<br>开进<span>你的城市。</span></h1><p>看见汽车眼中的世界，造车、教 AI、探索能量。<br>今天，你就是城市里的小工程师。</p><div class="hero-actions"><a href="#perception" class="btn btn-primary">开始我的体验 ${icon('arrow', 17)}</a><span class="hero-footnote">四个世界，随时出发</span></div></div>${heroIllustration(state.vehicle.color)}</section><div class="section-heading"><div><h2>选一个世界，开始探索</h2><p>不需要编程基础 · 不设通关分数 · 每次尝试都有收获</p></div><span class="section-note"><span data-stamp-count>${GAME_IDS.filter(id => state.progress[id].completed).length}</span> / 4 枚体验章</span></div><div class="games-grid">${GAME_IDS.map((id, i) => `<a href="#${id}" class="game-card" data-game-card="${id}"><div class="card-art">${cardArt(id)}<span class="card-number">0${i + 1}</span><span class="card-badge">独立体验</span></div><div class="card-content"><span class="card-tag">${metadata[id].tag}</span><h3>${metadata[id].title}</h3><p>${metadata[id].description}</p><div class="card-bottom"><span>进入体验 <span class="card-score">· <span data-score="${id}">${score(state.progress[id])}</span> 分</span></span><span class="card-go">${icon('arrow', 14)}</span></div></div></a>`).join('')}</div><div class="class-banner"><div class="class-banner-main"><span class="class-banner-icon">${icon('report', 23)}</span><div><strong>今天的工程师作品，记得带回家。</strong><p>你的车辆、AI 司机、体验章和发现，会变成专属电子报告。</p></div></div><a href="#report" class="btn btn-small">查看我的作品 ${icon('arrow', 14)}</a></div>`;
}
function reportCard(id: GameId): string {
  const p = state.progress[id], data = p.data;
  const entries = Array.isArray(data.report) ? (data.report as {label: unknown; value: unknown}[]).filter(item => item && 'label' in item && 'value' in item).slice(0, 12) : [];
  return `<article class="report-card"><div class="report-card-heading"><h2>${metadata[id].title}</h2><span class="stamp-chip ${p.completed ? 'complete' : ''}">${p.completed ? '已体验' : '还没体验'} · ${score(p)} 分</span></div>${p.image ? `<img src="${p.image}" alt="${metadata[id].title}的个人作品"/>` : `<div class="report-placeholder">${icon(metadata[id].icon, 34)}<span>${p.completed ? '体验已记录，可以回去保存一张作品图' : '这个世界等你来探索'}</span></div>`}<div class="report-card-content"><p>${escapeHTML(data.summary || (p.completed ? '一次尝试，一个新发现。' : '随时可以进入体验，之后再更新报告。'))}</p>${entries.map(item => `<div class="report-record"><span>${escapeHTML(item.label)}</span><b>${escapeHTML(item.value)}</b></div>`).join('')}${!entries.length ? `<div class="report-record"><span>我的记录</span><b>${p.completed ? '体验章已收集' : '还没体验'}</b></div>` : ''}</div></article>`;
}
function renderReport() {
  return `<section class="report-hero"><div><div class="eyebrow">MY ENGINEERING JOURNEY</div><h1>${escapeHTML(state.profile.nickname)}的未来车档案</h1><p>工位 ${escapeHTML(state.profile.workstation)} · 车辆「${escapeHTML(state.vehicle.name)}」<br>收集了 ${GAME_IDS.filter(id => state.progress[id].completed).length} 枚体验章，获得 ${totalScore(state)} / 400 成就积分。</p><div class="report-actions"><button class="btn btn-primary" data-action="download-report">${icon('download', 16)} 下载电子报告</button><button class="btn" data-action="print-report">打印 / 保存 PDF</button><button class="btn" data-action="vehicle-png">下载车辆作品</button></div></div><div class="report-cover-art">${heroIllustration(state.vehicle.color)}</div></section><div class="report-grid">${GAME_IDS.map(reportCard).join('')}</div><p class="report-disclaimer">成就积分记录参与与探索；科学记录来自教学仿真，不代表真实车辆测评。感知照片：Kakidai / Wikimedia Commons，CC BY-SA 4.0；人工标注与教学叠层。报告可以随时下载，未体验项目会保留真实状态。</p>`;
}
function saveReport() {
  const printable = `<style>body{margin:0;background:#eef1e9;color:#283c2d;font-family:"Microsoft YaHei",sans-serif}.document{max-width:1080px;margin:auto;padding:36px}.report-hero{background:#e4ecd9;border-radius:20px;padding:26px;display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}.report-hero h1{font-size:26px}.report-hero p{font-size:13px;line-height:1.8}.eyebrow{font-size:10px;color:#789365;letter-spacing:2px}.report-cover-art{width:210px}.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.report-card{background:#fffef9;border:1px solid #dce5d4;border-radius:18px;overflow:hidden;break-inside:avoid}.report-card-heading{display:flex;justify-content:space-between;padding:16px 20px;gap:10px;align-items:center}.report-card-heading h2{font-size:16px;margin:0}.stamp-chip{font-size:10px;color:#799164}.report-card img{width:100%;display:block}.report-card-content{padding:17px 20px}.report-card-content p{font-size:12px;line-height:1.8;color:#718567}.report-record{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #e3eadd;padding:9px 0;font-size:11px}.report-record span{color:#839277}.report-record b{font-weight:500}.report-placeholder{min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#879e74;background:#f3f7eb;font-size:12px}.report-actions{display:none}.report-disclaimer{font-size:10px;color:#8a9d7a;line-height:1.8}.print-button{padding:10px 17px;border:0;border-radius:9px;background:#345d3b;color:#fff;cursor:pointer;margin-bottom:16px}@media(max-width:650px){.document{padding:15px}.report-grid{grid-template-columns:1fr}.report-cover-art{display:none}}@media print{.print-button{display:none}.document{padding:0}.report-card img{max-height:160px;object-fit:contain}.report-hero{padding:15px}.report-card-content{padding:12px}}</style>`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHTML(state.profile.nickname)}的未来车报告</title>${printable}</head><body><main class="document"><button class="print-button" onclick="window.print()">打印 / 保存 PDF</button>${renderReport()}</main></body></html>`;
  downloadFile(`${state.profile.nickname}-未来车报告.html`, html); notify('电子报告已生成，带上今天的作品吧！');
}
async function saveVehiclePNG() {
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1200;
  const ctx = canvas.getContext('2d')!; ctx.scale(1.5, 1.5); ctx.fillStyle = '#edf2e4'; ctx.fillRect(0, 0, 1280, 800);
  ctx.fillStyle = '#344f38'; ctx.font = '700 45px "Microsoft YaHei",sans-serif'; ctx.fillText(state.vehicle.name, 70, 96);
  ctx.font = '20px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#7e906f'; ctx.fillText(`${state.profile.nickname} · 城市未来车厂 · 我的新能源车作品`, 72, 139);
  const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heroIllustration(state.vehicle.color))}`;
  await img.decode(); ctx.drawImage(img, 200, 170, 890, 540);
  ctx.font = '17px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#748b61'; ctx.fillText('智驾小工程师 / 我的设计，开向未来。', 72, 750);
  canvas.toBlob(blob => { if (blob) { downloadFile(`${state.vehicle.name}-车辆作品.png`, blob); notify('车辆作品已下载'); } });
}
function showProfile() {
  const dialog = document.createElement('dialog'); dialog.className = 'profile-dialog';
  dialog.innerHTML = `<h2>为你的作品签名</h2><p>用昵称和工位号，让今天的车辆和报告属于你。</p><form method="dialog"><div class="control-group"><label for="nickname">工程师昵称</label><input id="nickname" name="nickname" type="text" maxlength="20" required value="${escapeHTML(state.profile.nickname)}"></div><div class="control-group"><label for="workstation">我的工位</label><input id="workstation" name="workstation" type="text" maxlength="8" required value="${escapeHTML(state.profile.workstation)}"></div><div class="dialog-actions"><button class="btn" type="button" data-cancel>稍后再改</button><button class="btn btn-primary" type="submit">保存签名</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('form')!.addEventListener('submit', () => {
    state.profile.nickname = (dialog.querySelector<HTMLInputElement>('#nickname')!.value.trim() || '小工程师').slice(0,20);
    state.profile.workstation = dialog.querySelector<HTMLInputElement>('#workstation')!.value.trim().slice(0,8) || '01';
    persist(state); updateProgressUI(); if (location.hash === '#report') render(); notify('作品签名已保存');
  });
  dialog.querySelector('[data-cancel]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
}
function render() {
  mounted?.destroy(); mounted = undefined;
  const raw = location.hash.slice(1) || 'home';
  const page = raw === 'report' || GAME_IDS.includes(raw as GameId) ? raw : 'home';
  app.innerHTML = `<div class="layout">${sidebar(page)}<main class="main">${header(page)}<div id="page-content"></div>${footer()}</main></div>`;
  const content = app.querySelector<HTMLDivElement>('#page-content')!;
  if (page === 'home') content.innerHTML = renderHome();
  else if (page === 'report') content.innerHTML = renderReport();
  else {
    const id = page as GameId, m = metadata[id];
    content.innerHTML = `<div class="game-page-heading"><div class="game-title-group"><a href="#home" class="btn btn-icon" aria-label="回到体验大厅">${icon('back', 18)}</a><div><h1>${m.title}</h1><p>${m.subtitle}</p></div></div><div class="game-heading-actions"><span class="stamp-chip" data-stamp="${id}">随时可玩</span><span class="score-pill"><b data-score="${id}">${score(state.progress[id])}</b> / 100 分</span></div></div><div id="game-host"></div><div class="game-bottom-nav"><span>尽管尝试，积分不影响体验完成。</span><a href="#report" class="btn btn-small">查看我的作品 ${icon('arrow', 14)}</a></div>`;
    mounted = mounts[id](content.querySelector<HTMLElement>('#game-host')!, api);
  }
  updateProgressUI(); window.scrollTo({top:0, behavior:'instant'});
}
app.addEventListener('click', event => {
  const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'profile') showProfile();
  if (action === 'sound') { state.muted = !state.muted; persist(state); const button = app.querySelector('[data-action="sound"]')!; button.innerHTML = `${icon(state.muted ? 'muted' : 'sound',20)}<span>${state.muted ? '音效关闭' : '音效开启'}</span>`; button.setAttribute('aria-label', state.muted ? '开启音效' : '关闭音效'); notify(state.muted ? '音效已关闭' : '音效已开启'); }
  if (action === 'download-report') saveReport();
  if (action === 'print-report') window.print();
  if (action === 'vehicle-png') void saveVehiclePNG();
});
window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', () => { persist(state); mounted?.destroy(); });
render();
