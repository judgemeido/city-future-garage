import { premiumCarSVG, vehicleSVG } from './car-art';
import { GAME_COLORS } from './theme';
import type { GameId } from './types';
export const icons: Record<string, string> = {
  parking: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  plug: '<path d="M8 3v5m8-5v5M5 8h14v4a7 7 0 0 1-14 0zM12 19v3"/>',
  repair: '<path d="M14 4a6 6 0 0 0-7 7l-4 7a2 2 0 0 0 3 3l7-5a6 6 0 0 0 7-7l-4 3-4-4z"/>',
  rain: '<path d="M5 13a4 4 0 0 1 0-8 6 6 0 0 1 11-1 5 5 0 0 1 2 9M7 16l-2 4m8-4-2 4m8-4-2 4"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  car: '<path d="m4 8 2-4h12l2 4 2 3v7H2v-7zM4 8h16M6 13h2m8 0h2M4 18v2m16-2v2"/>',
  ai: '<rect x="4" y="6" width="16" height="14" rx="5"/><path d="M12 2v4m-10 6h2m16 0h2M8 15h8"/><circle cx="8" cy="11" r=".8"/><circle cx="16" cy="11" r=".8"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
  report: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/>',
  sound: '<path d="m3 9 4 0 5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m3 9 4 0 5-4v14l-5-4H3zM17 9l5 6m0-6-5 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
};
export function icon(name: string, size = 22): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.star}</svg>`;
}
export function heroIllustration(color = '#62bd95', body = 'city'): string {
  const buildings = Array.from({length:11},(_,i) => {
    const x=31+i*57,h=70+(i*47)%137,y=285-h;
    return `<g><path d="M${x} 285V${y+8}l8-8h${35+i%3*5}v${h}Z" fill="${i%2?'#1a2943':'#14243b'}" stroke="#3d5475" stroke-width=".8"/>${Array.from({length:Math.floor(h/24)-1},(_,r)=>`<path d="M${x+10} ${y+15+r*24}h12m6 0h10" stroke="${i%3?'#47eaff':'#ed71bd'}" stroke-width="3" opacity="${r%3===0?.8:.27}"/>`).join('')}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="430" viewBox="0 0 680 430" class="hero-illustration" role="img" aria-label="霓虹夜城里的新能源车与充电站">
    <defs><radialGradient id="cityHalo"><stop stop-color="#623a91" stop-opacity=".45"/><stop offset="1" stop-color="#10172b" stop-opacity="0"/></radialGradient><linearGradient id="cityRoad" x2="0" y2="1"><stop stop-color="#172943"/><stop offset="1" stop-color="#0b1527"/></linearGradient></defs>
    <ellipse cx="402" cy="179" rx="245" ry="179" fill="url(#cityHalo)"/><circle cx="466" cy="113" r="67" fill="none" stroke="#ed71bd" stroke-opacity=".18" stroke-width="16"/><circle cx="466" cy="113" r="50" fill="none" stroke="#ed71bd" stroke-opacity=".42"/>
    ${buildings}<path d="M0 290h680v116H0z" fill="url(#cityRoad)"/><g fill="none" stroke="#47eaff" stroke-opacity=".18"><path d="M0 310h680M0 340h680M0 388h680"/>${[10,120,230,450,560,670].map(x=>`<path d="M340 277 ${x} 416"/>`).join('')}</g><path d="M20 292h640" stroke="#47eaff" stroke-opacity=".65" stroke-width="2"/>
    <g transform="translate(543 162)"><path d="M0 6 7 0h48l10 10v147H0z" fill="#182a42" stroke="#47eaff" stroke-width="1.5"/><rect x="11" y="17" width="43" height="43" rx="4" fill="#47eaff15" stroke="#47eaff80"/><path d="M35 22 23 40h11l-3 13 15-20H35Z" fill="#75f1bb"/><path d="M12 75h41M12 84h27" stroke="#75f1bb" stroke-width="3"/><text x="12" y="121" font-size="10" fill="#9db8cf" font-family="monospace">CHARGE</text><path d="M65 48q25 0 25 31v31q0 31-26 31" stroke="#ed71bd" stroke-width="4" fill="none"/><rect x="57" y="132" width="13" height="21" rx="3" fill="#ed71bd"/></g>
    <ellipse cx="336" cy="337" rx="204" ry="11" fill="#47eaff" opacity=".1"/><svg x="81" y="107" width="474" height="267">${premiumCarSVG(color, body)}</svg>
    <path d="M82 355h390" stroke="#47eaff" stroke-width="2" opacity=".65"/><path d="M390 365h150" stroke="#ed71bd" stroke-width="2" opacity=".7"/>
    <g font-family="monospace" fill="#8ca7c3" font-size="10"><text x="29" y="70">NEON CITY / 2088</text><text x="502" y="389">DRIVE THE FUTURE</text><text x="83" y="390" fill="#47eaff">● SYSTEM READY</text></g><path d="M21 38v-17h44M659 38V21h-44M21 387v18h44" stroke="#47eaff" fill="none" opacity=".5"/>
  </svg>`;
}

export function cardIllustration(id: GameId): string {
  const c = GAME_COLORS[id];
  const road = '<path d="M0 133 320 61" stroke="#213752" stroke-width="46"/><path d="M0 133 320 61" stroke="#7a9ab6" stroke-width="1.5" stroke-dasharray="9 8"/>';
  const car = (color=c, x=78, y=46, w=172) => `<svg x="${x}" y="${y}" width="${w}" height="${w*.6}">${premiumCarSVG(color, 'sport')}</svg>`;
  const drawings: Record<GameId,string> = {
    perception: `${road}<svg x="103" y="55" width="94" height="60">${vehicleSVG(c,'city','top')}</svg><g fill="none" stroke="${c}"><circle cx="157" cy="91" r="55" opacity=".25"/><circle cx="157" cy="91" r="38" stroke-dasharray="3 4"/><path d="m157 91 96-38m-96 38 107 16" opacity=".6"/><rect x="207" y="38" width="38" height="30" rx="3"/><rect x="52" y="97" width="27" height="39" rx="3"/></g><text x="211" y="34" fill="${c}" font-size="8">SCAN / 01</text>`,
    factory: `<path d="M32 40v62m255-62v62M43 142h232" stroke="#526381" stroke-width="3"/><path d="M44 54 65 75 48 97m227-43-21 21 17 22" fill="none" stroke="${c}" stroke-width="5"/>${car(c,52,39,219)}<path d="M84 152h152" stroke="${c}" stroke-width="2"/>`,
    ai: `${road}<g transform="translate(109 38)"><path d="M50 5V-8" stroke="${c}" stroke-width="2"/><circle cx="50" cy="-9" r="4" fill="${c}"/><rect x="3" y="9" width="94" height="73" rx="23" fill="#203552" stroke="${c}"/><rect x="15" y="29" width="70" height="30" rx="12" fill="#0c172b"/><g fill="${c}"><circle cx="32" cy="43" r="5"/><circle cx="68" cy="43" r="5"/></g><path d="M42 65q8 7 16 0" stroke="${c}" fill="none"/><path d="M-8 33v26m116-26v26" stroke="#647d9d" stroke-width="9"/></g><path d="M223 46h57v27h-46l-11 10z" fill="#bc98ff16" stroke="${c}"/><text x="233" y="64" fill="${c}" font-size="10">LEARN</text>`,
    regen: `${car(c,25,50,214)}<rect x="245" y="68" width="32" height="57" rx="5" fill="#192f40" stroke="${c}"/><path d="M253 61h15v5" stroke="${c}"/><path d="m264 79-10 17h9l-3 14 12-18h-10" fill="${c}"/><path d="M160 48q61-20 93 8m-8-10 11 12-17-1" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="5 4"/>`,
    parking: `<path d="M23 136C97 20 179 153 250 73" fill="none" stroke="${c}" stroke-width="3"/><path d="M25 146C95 30 179 163 252 83" fill="none" stroke="${c}" stroke-width="12" opacity=".08"/><rect x="234" y="37" width="57" height="59" rx="3" fill="#47eaff0c" stroke="${c}"/><text x="250" y="68" fill="${c}" font-size="23">P</text>${car(c,70,41,147)}<circle cx="116" cy="73" r="6" fill="#081321" stroke="#47eaff" stroke-width="2"/>`,
    repair: `<path d="M53 94h211" stroke="${c}" opacity=".2" stroke-width="20"/>${car(c,70,40,181)}<path d="M154 32v108" stroke="${c}" stroke-width="2"/><path d="M140 32h29M140 139h29" stroke="${c}"/><circle cx="152" cy="105" r="18" fill="#0b182bbb" stroke="${c}"/><path d="M144 105h7l3-7 4 14 3-7h6" fill="none" stroke="${c}"/>`,
    charging: `<path d="M46 32h43v96H46z" fill="#193147" stroke="${c}"/><path d="m71 45-13 21h11l-3 13 13-22H69" fill="${c}"/><path d="M88 72C128 13 108 151 218 120" fill="none" stroke="${c}" stroke-width="3"/>${car(c,133,51,151)}<circle cx="216" cy="119" r="5" fill="${c}"/>`,
    grip: `<path d="M24 117C126 137 134 52 296 72" fill="none" stroke="${c}" stroke-width="3"/><path d="M24 135C164 161 114 81 296 95" fill="none" stroke="#ed71bd" stroke-width="3"/>${car(c,110,37,164)}<g stroke="${c}" opacity=".45">${Array.from({length:13},(_,i)=>`<path d="M${24+i*23} ${35+(i%3)*22}l-4 11"/>`).join('')}</g>`
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 170" role="img" aria-label="${id === 'perception' ? '汽车感知扫描' : id === 'factory' ? '新能源造车工坊' : id === 'ai' ? 'AI机器人训练' : id === 'regen' ? '刹车能量回收' : id === 'parking' ? '拖动泊车光轨' : id === 'repair' ? '车辆故障扫描' : id === 'charging' ? '拖动电缆充电' : '雨天双轨实验'}的霓虹插画"><rect width="320" height="170" fill="#0d192d"/><g stroke="${c}" opacity=".07">${Array.from({length:9},(_,i)=>`<path d="M${i*40} 0v170M0 ${i*25}h320"/>`).join('')}</g><ellipse cx="166" cy="117" rx="111" ry="50" fill="${c}" opacity=".035"/><g font-family="monospace">${drawings[id]}</g><path d="M10 38v-7h11M310 132v8h-11" fill="none" stroke="${c}" opacity=".45"/></svg>`;
}
