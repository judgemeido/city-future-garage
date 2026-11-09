import { premiumCarSVG } from './car-art';
export const icons: Record<string, string> = {
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="400" viewBox="0 0 680 400" class="hero-illustration" role="img" aria-label="我的新能源车与城市充电站">
    <ellipse cx="368" cy="327" rx="275" ry="39" fill="#d6e3ce"/>
    <g fill="#dbe6d5"><path d="M116 234V121Q116 112 125 112H168Q177 112 177 121V234Z"/><path d="M189 234V75Q189 67 198 67H251Q260 67 260 75V234Z"/><path d="M275 234V141Q275 132 284 132H326Q335 132 335 141V234Z"/></g>
    <g fill="#f5f8ee"><path d="M128 128h36v12h-36zM128 151h36v12h-36zM128 174h36v12h-36zM201 83h46v12h-46zM201 106h46v12h-46zM201 129h46v12h-46zM201 152h46v12h-46zM287 149h36v12h-36zM287 173h36v12h-36z"/></g>
    <path d="M93 309H629" stroke="#a8c0a0" stroke-width="3" stroke-linecap="round"/>
    <g transform="translate(534 119)"><rect width="68" height="174" rx="16" fill="#f8fcf1" stroke="#a1bb9f" stroke-width="2"/><rect x="12" y="16" width="44" height="46" rx="9" fill="#d4e7cd"/><path d="M35 23 22 42h11l-3 14 16-22H35Z" fill="#5c8868"/><rect x="14" y="77" width="40" height="6" rx="3" fill="#b6ceb0"/><path d="M68 54q29 0 29 30v52q0 23-21 23" stroke="#607f6c" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="66" y="145" width="15" height="26" rx="4" fill="#607f6c"/></g>
    <svg x="103" y="66" width="445" height="280">${premiumCarSVG(color, body)}</svg>
    <g transform="translate(119 38)" font-family="Microsoft YaHei,PingFang SC,sans-serif"><rect width="200" height="40" rx="20" fill="#fffdf6" stroke="#c6d7bc"/><circle cx="23" cy="20" r="10" fill="#dcebcf"/><path d="m18 20 4 4 7-8" fill="none" stroke="#5b8762" stroke-width="2"/><text x="44" y="25" font-size="13" fill="#456c4e">把你的想法，开上路。</text></g>
    <g fill="#aac89e"><ellipse cx="95" cy="225" rx="23" ry="36"/><ellipse cx="638" cy="246" rx="19" ry="31"/></g><path d="M95 241v66m543-47v47" stroke="#8aaa80" stroke-width="4" stroke-linecap="round"/>
    <text x="340" y="379" text-anchor="middle" font-size="13" font-family="Microsoft YaHei,PingFang SC,sans-serif" fill="#67855e">我的小车，出发去探索。</text>
  </svg>`;
}
