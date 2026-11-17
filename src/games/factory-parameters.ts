import type { Vehicle } from '../types';
import { premiumCarSVG } from '../car-art.ts';
import { batteryOf, inverterOf, motorOf, reducerOf, wheelsOf, bodyOf, configurationStats, PART_NAMES, round, type Part } from './factory-model.ts';

const xml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export interface ParameterGroup { part: Part; title: string; rows: [string, string][]; lesson: string }
export function parameterGroups(v: Vehicle): ParameterGroup[] {
  const b = batteryOf(v), i = inverterOf(v), m = motorOf(v), r = reducerOf(v), w = wheelsOf(v), c = bodyOf(v);
  return [
    { part: 'battery', title: b.title, rows: [['容量 / 试跑可用电量', `${b.value} / ${round(b.value * .65, 2)} kWh`], ['最大供电 / 标称电压', `${b.power} kW / ${b.voltage} V DC`], ['供电上限对应电流', `${round(b.power * 1000 / b.voltage)} A`], ['部件质量 / 工程币', `${b.mass} kg / ${b.coins} 币`]], lesson: '容量决定带多少电，功率决定送电多快。' },
    { part: 'inverter', title: i.title, rows: [['直流输入功率上限', `${i.value} kW`], ['输入 / 输出形式', '400 V DC / 三相 AC'], ['转换效率 / 损耗比例', `${round(i.efficiency * 100)}% / ${round((1 - i.efficiency) * 100)}%`], ['部件质量 / 工程币', `${i.mass} kg / ${i.coins} 币`]], lesson: '直流变交流；高功率型号还要电池供得上。' },
    { part: 'motor', title: m.title, rows: [['机械输出功率上限', `${m.value} kW`], ['峰值扭矩', `${m.torque} N·m`], ['转速上限', `${m.rpm} r/min`], ['教学效率 / 驱动形式', '84–90% / 前轴单电机'], ['部件质量 / 工程币', `${m.mass} kg / ${m.coins} 币`]], lesson: '功率、扭矩、转速是三个不同的限制。' },
    { part: 'reducer', title: r.title, rows: [['固定传动比', `${r.value}∶1`], ['传动效率', `${round(r.efficiency * 100)}%`], ['输出扭矩承受上限', `${r.torque} N·m`], ['部件质量 / 工程币', `${r.mass} kg / ${r.coins} 币`]], lesson: `电机转 ${r.value} 圈，车轮转 1 圈。` },
    { part: 'wheels', title: w.title, rows: [['标称轮胎尺寸', w.size], ['教学有效半径', `${w.radius.toFixed(2)} m`], ['滚阻系数 / 抓地系数', `${w.rolling.toFixed(3)} / ${w.grip.toFixed(2)}`], ['四轮总质量 / 工程币', `${w.mass} kg / ${w.coins} 币`]], lesson: '有效半径用于计算，标称尺寸用于认识轮胎。' },
    { part: 'body', title: c.title, rows: [['车身基础质量', `${c.mass} kg`], ['风阻面积 CdA', `${c.drag.toFixed(2)} m²`], ['固定设备 / 驾驶员', '45 kg / 75 kg'], ['车身工程币', `${c.coins} 币`]], lesson: '整备质量还要加上电池、电驱和四轮。' },
  ];
}

/** One source supplies both the on-page schematic and downloadable SVG/PNG. */
export function parameterDiagram(v: Vehicle, interactive = false): string {
  const s = configurationStats(v), b = batteryOf(v), i = inverterOf(v), m = motorOf(v), r = reducerOf(v), w = wheelsOf(v);
  const text = (value: string, x: number, y: number, size = 16, color = '#b4c8de', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${xml(value)}</text>`;
  const chain: { part: Part; top: string; bottom: string; color: string }[] = [
    { part: 'battery', top: `${b.value} kWh`, bottom: `供电 ${b.power} kW`, color: '#75f1bb' },
    { part: 'inverter', top: `输入 ≤ ${i.value} kW`, bottom: `效率 ${round(i.efficiency * 100)}%`, color: '#f5bc65' },
    { part: 'motor', top: `${m.value} kW`, bottom: `${m.torque} N·m`, color: '#79bbff' },
    { part: 'reducer', top: `${r.value}∶1`, bottom: `效率 ${round(r.efficiency * 100)}%`, color: '#bd9cff' },
    { part: 'wheels', top: `r = ${w.radius.toFixed(2)} m`, bottom: w.size, color: '#71e4eb' },
  ];
  const groups = parameterGroups(v);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1050" viewBox="0 0 1200 1050" role="${interactive ? 'group' : 'img'}" aria-label="${xml(v.name)}完整参数图" style="font-family:'Microsoft YaHei','PingFang SC',sans-serif">
    <title>${xml(v.name)} · 六大部件完整参数图</title><desc>当前装配参数、能量链与计算关系。合成教学数据，实际试跑受供电、抓地、负载和阻力共同限制。</desc>
    <defs><pattern id="factory-blueprint-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#263c55" stroke-width=".6"/></pattern><marker id="factory-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#7898b8"/></marker></defs>
    <rect width="1200" height="1050" rx="18" fill="#0c1729"/><rect x="20" y="20" width="1160" height="1010" rx="12" fill="url(#factory-blueprint-grid)" stroke="#38516f"/>
    ${text('EV ENGINEERING / 我的整车参数图', 48, 59, 15, '#f5bc65', 600)}
    ${text(v.name || '我的小电车', 48, 106, 32, '#edf6ff', 700)}
    ${text('六大部件 · 所选配置实时更新 · 合成教学参数', 48, 137, 16)}
    <g transform="translate(55 148)">${premiumCarSVG(v.color, v.body).replace('<svg ', '<svg x="0" y="0" width="385" height="185" ')}</g>
    <path d="M98 338H415" stroke="#71e4eb" stroke-width="2"/>
    ${text(bodyOf(v).title, 66, 361, 18, '#edf6ff', 600)}
    <rect x="488" y="166" width="664" height="214" rx="12" fill="#14233a" stroke="#3e5877"/>
    ${[
      ['整备质量', `${s.emptyMass} kg`, '含固定设备，不含驾驶员 / 载荷'],
      ['低速扭矩上限', `${round(s.wheelTorque)} N·m`, '减速器输出；抓地还会限制驱动力'],
      ['保守轮端功率上限', `${round(s.wheelPower)} kW`, `按电机效率84% · ${s.limiting}`],
      ['工程预算', `${s.cost} 币`, '六大部件总和 · 可自由选装'],
    ].map(([name, value, note], index) => { const x = 511 + (index % 2) * 322, y = 195 + Math.floor(index / 2) * 99; return text(name, x, y, 15) + text(value, x, y + 34, 28, '#f5bc65', 700) + text(note, x, y + 59, 13); }).join('')}
    ${text('01 / 能量怎么到达车轮', 48, 416, 18, '#edf6ff', 600)}
    ${chain.map((p, index) => { const x = 48 + index * 225; return `<g ${interactive ? `data-diagram-part="${p.part}" tabindex="0" role="button" aria-label="选择${PART_NAMES[p.part]}配置"` : ''}><rect x="${x}" y="435" width="202" height="107" rx="10" fill="#14233a" stroke="${p.color}"/>${text(PART_NAMES[p.part], x + 16, 461, 18, p.color, 700)}${text(p.top, x + 16, 493, 21, '#edf6ff', 600)}${text(p.bottom, x + 16, 518, 14)}</g>${index < 4 ? `<path d="M${x + 205} 487H${x + 221}" stroke="#7898b8" stroke-width="2" marker-end="url(#factory-flow-arrow)"/>` : ''}`; }).join('')}
    ${text('直流电', 245, 566, 13, '#75f1bb')}${text('三相交流电', 454, 566, 13, '#f5bc65')}${text('机械转动', 690, 566, 13, '#79bbff')}${text('扭矩传到地面', 906, 566, 13, '#71e4eb')}
    ${text('02 / 部件规格清单', 48, 602, 18, '#edf6ff', 600)}
    ${groups.map((g, index) => { const x = 48 + (index % 3) * 376, y = 619 + Math.floor(index / 3) * 165, rowHeight = g.rows.length > 4 ? 21 : 22; return `<g ${interactive ? `data-diagram-part="${g.part}" tabindex="0" role="button" aria-label="选择${PART_NAMES[g.part]}配置"` : ''}><rect x="${x}" y="${y}" width="352" height="153" rx="9" fill="#122138" stroke="#3a526e"/>${text(`${PART_NAMES[g.part]} / ${g.title}`, x + 13, y + 26, 17, '#edf6ff', 600)}${g.rows.map(([label, value], row) => text(label, x + 13, y + 52 + row * rowHeight, 13) + `<text x="${x + 339}" y="${y + 52 + row * rowHeight}" text-anchor="end" font-size="13" fill="#f5d4a3">${xml(value)}</text>`).join('')}</g>`; }).join('')}
    ${text('03 / 读懂参数关系', 48, 977, 17, '#edf6ff', 600)}
    ${text('车轮转速 = 电机转速 ÷ 传动比     轮端扭矩 ≤ 电机扭矩 × 传动比 × 传动效率     驱动力 = 轮端扭矩 ÷ 有效半径', 48, 1002, 14)}
    ${text('教学边界：电机转速上限推导车速为 ' + round(s.speedCeiling) + ' km/h，不是实测极速；试跑起始65%电量，附件700 W，驾驶员75 kg。', 48, 1025, 13, '#9eb4cd')}
  </svg>`;
}
