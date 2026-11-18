import type { Vehicle } from '../types';
import { premiumCarSVG } from '../car-art.ts';
import { batteryOf, inverterOf, motorOf, reducerOf, wheelsOf, bodyOf, configurationStats, PART_NAMES, round, type Part } from './factory-model.ts';
import { adRating, chipOf, sensorOf, type ChipTierId, type ExtendedPart, type SensorPackId } from './factory-cyber.ts';

const xml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

export interface ParameterGroup { part: Part; title: string; rows: [string, string][]; lesson: string }

export function parameterGroups(v: Vehicle): ParameterGroup[] {
  const b = batteryOf(v), i = inverterOf(v), m = motorOf(v), r = reducerOf(v), w = wheelsOf(v), c = bodyOf(v);
  return [
    { part: 'battery', title: b.title, rows: [['容量 / 供电', `${b.value} kWh / ${b.power} kW`], ['质量 / 预算', `${b.mass} kg / ${b.coins} 币`]], lesson: '容量决定带多少电，功率决定送电多快。' },
    { part: 'inverter', title: i.title, rows: [['输入上限 / 效率', `${i.value} kW / ${round(i.efficiency * 100)}%`], ['质量 / 预算', `${i.mass} kg / ${i.coins} 币`]], lesson: '把电池直流电转为电机三相交流电。' },
    { part: 'motor', title: m.title, rows: [['功率 / 峰值扭矩', `${m.value} kW / ${m.torque} N·m`], ['质量 / 预算', `${m.mass} kg / ${m.coins} 币`]], lesson: '把电能变成驱动车轮的机械动力。' },
    { part: 'reducer', title: r.title, rows: [['固定传动比 / 效率', `${r.value}∶1 / ${round(r.efficiency * 100)}%`], ['质量 / 预算', `${r.mass} kg / ${r.coins} 币`]], lesson: `电机转 ${r.value} 圈，车轮转 1 圈。` },
    { part: 'wheels', title: w.title, rows: [['轮胎尺寸', w.size], ['滚阻 / 抓地', `${w.rolling.toFixed(3)} / ${w.grip.toFixed(2)}`]], lesson: '影响抓地稳健度与行驶滚阻能耗。' },
    { part: 'body', title: c.title, rows: [['基础质量 / 风阻', `${c.mass} kg / CdA ${c.drag.toFixed(2)}`], ['预算', `${c.coins} 币`]], lesson: '风阻越小，高速巡航越省电。' },
  ];
}

export interface BlueprintAdOptions {
  sensorPack?: SensorPackId;
  chipTier?: ChipTierId;
}

/** Simplified, clean engineering blueprint SVG shared by on-page display and PNG/SVG export. */
export function parameterDiagram(v: Vehicle, interactive = false, ad: BlueprintAdOptions = {}): string {
  const s = configurationStats(v);
  const b = batteryOf(v), i = inverterOf(v), m = motorOf(v), r = reducerOf(v), w = wheelsOf(v), c = bodyOf(v);
  const sensor = sensorOf(ad.sensorPack);
  const chip = chipOf(ad.chipTier);
  const rating = adRating(sensor.value, chip.value);
  const totalCoins = s.cost + sensor.coins + chip.coins;

  const text = (value: string, x: number, y: number, size = 15, color = '#b4c8de', weight = 400) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${xml(value)}</text>`;

  const adChain: { part: ExtendedPart; title: string; main: string; sub: string; color: string }[] = [
    { part: 'sensor', title: '智驾感知', main: sensor.title, sub: `${sensor.range} m · ${sensor.fov}° 视野`, color: '#47eaff' },
    { part: 'chip', title: '超算芯片', main: `${chip.tops} TOPS`, sub: `${chip.title} · 延迟 ${chip.latencyMs}ms`, color: '#bc98ff' },
    { part: 'body', title: '智驾车身', main: c.title, sub: `风阻 CdA ${c.drag.toFixed(2)} m²`, color: '#75f1bb' },
  ];

  const evChain: { part: Part; main: string; sub: string; color: string }[] = [
    { part: 'battery', main: `${b.value} kWh`, sub: `供电 ${b.power} kW`, color: '#75f1bb' },
    { part: 'inverter', main: `≤ ${i.value} kW`, sub: `效率 ${round(i.efficiency * 100)}%`, color: '#f5bc65' },
    { part: 'motor', main: `${m.value} kW`, sub: `${m.torque} N·m`, color: '#79bbff' },
    { part: 'reducer', main: `${r.value}∶1`, sub: `放大扭矩`, color: '#bd9cff' },
    { part: 'wheels', main: w.size, sub: `抓地 ${w.grip.toFixed(2)}`, color: '#71e4eb' },
  ];

  const kpis = [
    ['智驾等级', `${rating.level} · ${chip.tops} TOPS`, `${sensor.title}（${sensor.range}m）`, rating.color],
    ['轮端功率', `${round(s.wheelPower)} kW`, `受「${s.limiting}」制约`, '#47eaff'],
    ['轮端扭矩', `${round(s.wheelTorque)} N·m`, `${r.value}∶1 减速器放大输出`, '#f5bc65'],
    ['整备质量 / 预算', `${s.emptyMass} kg`, `总工程预算 ${totalCoins} 币`, '#75f1bb'],
  ] as const;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="580" viewBox="0 0 1200 580" role="${interactive ? 'group' : 'img'}" aria-label="${xml(v.name)}精简参数图" style="font-family:'Microsoft YaHei','PingFang SC',sans-serif">
    <title>${xml(v.name)} · 整车核心参数图</title>
    <desc>当前智驾座驾的核心参数、智驾大脑链与三电动力链。</desc>
    <defs>
      <pattern id="factory-blueprint-grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M24 0H0V24" fill="none" stroke="#223852" stroke-width=".6"/>
      </pattern>
      <marker id="factory-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10Z" fill="#7fa4c8"/>
      </marker>
    </defs>
    <rect width="1200" height="580" rx="18" fill="#0a1426"/>
    <rect x="18" y="18" width="1164" height="544" rx="12" fill="url(#factory-blueprint-grid)" stroke="#314b69"/>

    ${text('CYBER EV BLUEPRINT · 精简整车参数图', 44, 54, 13, '#47eaff', 700)}
    ${text(v.name || '我的未来号', 44, 92, 30, '#edf6ff', 700)}
    <rect x="330" y="64" width="122" height="30" rx="8" fill="#132640" stroke="${rating.color}"/>
    ${text(`${rating.level} · 智驾座驾`, 345, 84, 13, rating.color, 700)}

    <g transform="translate(56 109)">${premiumCarSVG(v.color, v.body).replace('<svg ', '<svg x="0" y="0" width="380" height="175" ')}</g>
    <path d="M90 272H416" stroke="#47eaff" stroke-opacity=".65" stroke-width="2"/>

    <rect x="474" y="42" width="682" height="232" rx="12" fill="#112036" stroke="#355070"/>
    ${kpis.map(([name, val, note, col], idx) => {
      const x = 502 + (idx % 2) * 334;
      const y = 76 + Math.floor(idx / 2) * 104;
      return text(name, x, y, 13, '#95b2ce', 600) + text(val, x, y + 34, 26, col, 700) + text(note, x, y + 58, 13, '#b8cde0');
    }).join('')}

    ${text('01 / 智驾大脑链（点击卡片可直达选装）', 44, 314, 15, '#d8c7ff', 700)}
    ${adChain.map((item, idx) => {
      const x = 44 + idx * 380;
      const wBox = 352;
      return `<g ${interactive ? `data-diagram-part="${item.part}" tabindex="0" role="button" aria-label="选择${item.title}配置"` : ''}>
        <rect x="${x}" y="328" width="${wBox}" height="82" rx="10" fill="#122138" stroke="${item.color}"/>
        ${text(item.title, x + 16, 353, 13, item.color, 700)}
        ${text(item.main, x + 16, 381, 19, '#edf6ff', 700)}
        ${text(item.sub, x + 16, 401, 12, '#a3bdd6')}
      </g>${idx < 2 ? `<path d="M${x + wBox + 4} 369H${x + 375}" stroke="#8d99c7" stroke-width="2" marker-end="url(#factory-flow-arrow)"/>` : ''}`;
    }).join('')}

    ${text('02 / 三电动力链（能量从电池传到地面）', 44, 444, 15, '#75f1bb', 700)}
    ${evChain.map((item, idx) => {
      const x = 44 + idx * 227;
      const wBox = 204;
      return `<g ${interactive ? `data-diagram-part="${item.part}" tabindex="0" role="button" aria-label="选择${PART_NAMES[item.part]}配置"` : ''}>
        <rect x="${x}" y="458" width="${wBox}" height="82" rx="10" fill="#122138" stroke="${item.color}"/>
        ${text(PART_NAMES[item.part], x + 14, 483, 13, item.color, 700)}
        ${text(item.main, x + 14, 511, 18, '#edf6ff', 700)}
        ${text(item.sub, x + 14, 531, 12, '#a3bdd6')}
      </g>${idx < 4 ? `<path d="M${x + wBox + 3} 499H${x + 222}" stroke="#7898b8" stroke-width="2" marker-end="url(#factory-flow-arrow)"/>` : ''}`;
    }).join('')}
  </svg>`;
}
