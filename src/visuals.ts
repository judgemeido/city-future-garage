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
let illustrationSequence = 0;
function normalizePaint(color:string):string {
  const value=color.trim();
  if(/^#[0-9a-f]{3}$/i.test(value)) return '#'+value.slice(1).split('').map(channel=>channel+channel).join('');
  return /^#[0-9a-f]{6}$/i.test(value)?value:'#8ad3a5';
}
function blendPaint(color:string,target:string,amount:number):string {
  const base=/^#[0-9a-f]{6}$/i.test(color)?color:'#75d1a0';
  const channels=[1,3,5].map(offset=>Math.round(parseInt(base.slice(offset,offset+2),16)*(1-amount)+parseInt(target.slice(offset,offset+2),16)*amount));
  return '#'+channels.map(channel=>channel.toString(16).padStart(2,'0')).join('');
}
export function heroIllustration(color = '#8ad3a5'): string {
  const paint=normalizePaint(color);
  const light=blendPaint(paint,'#ffffff',.5), pearl=blendPaint(paint,'#ffffff',.78), deep=blendPaint(paint,'#142b25',.42), lower=blendPaint(paint,'#263c33',.22);
  const id=`future-hero-${++illustrationSequence}`, ref=(name:string)=>`url(#${id}-${name})`;
  const wheel=(x:number,y:number,scale:number)=>`<g transform="translate(${x} ${y}) rotate(-13) scale(${scale})">
    <ellipse cx="-4" cy="-1" rx="29" ry="38" fill="#17251f"/>
    <ellipse rx="25.5" ry="37" fill="${ref('tyre')}" stroke="#10231b" stroke-width="1.2"/>
    <ellipse rx="20" ry="30.5" fill="${ref('rim')}" stroke="#9caaa1" stroke-width="1"/>
    <ellipse rx="16.7" ry="26" fill="#273b32"/>
    <g fill="${ref('spoke')}" stroke="#b8c4ba" stroke-width=".45">
      ${[0,72,144,216,288].map(angle=>`<path d="M-2-3 2-23 9-18 5-2 13 11 8 19 0 5Z" transform="scale(.63 1) rotate(${angle})"/>`).join('')}
    </g>
    <ellipse rx="4.7" ry="7" fill="#d6e1d8" stroke="#566e60" stroke-width="1"/>
    <ellipse rx="2.3" ry="3.5" fill="#657c6c"/>
    <path d="M-18-14C-22 0-19 18-11 26" fill="none" stroke="#5c6f62" stroke-width=".8"/>
    <path d="M10-28C19-19 22-5 21 6" fill="none" stroke="#8c9b90" stroke-width=".75" opacity=".65"/>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="400" viewBox="0 0 680 400" class="hero-illustration" aria-label="精细的纯电轿跑汽车：全景玻璃、LED灯带、空气动力轮毂和未来城市展示台" role="img">
  <defs>
    <linearGradient id="${id}-paint" x1="0%" y1="0%" x2="18%" y2="100%"><stop stop-color="${pearl}"/><stop offset=".22" stop-color="${light}"/><stop offset=".47" stop-color="${paint}"/><stop offset=".72" stop-color="${lower}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <linearGradient id="${id}-bonnet" x1="10%" y1="0%" x2="85%" y2="100%"><stop stop-color="${pearl}"/><stop offset=".4" stop-color="${light}"/><stop offset=".72" stop-color="${paint}"/><stop offset="1" stop-color="${lower}"/></linearGradient>
    <linearGradient id="${id}-front" x1="5%" y1="0%" x2="60%" y2="100%"><stop stop-color="${paint}"/><stop offset=".4" stop-color="${lower}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <linearGradient id="${id}-glass" x1="0%" y1="0%" x2="65%" y2="100%"><stop stop-color="#728c86"/><stop offset=".38" stop-color="#344f4b"/><stop offset=".76" stop-color="#18332e"/><stop offset="1" stop-color="#102822"/></linearGradient>
    <linearGradient id="${id}-glass-reflect" x1="0%" y1="0%" x2="70%" y2="100%"><stop stop-color="#edf8ed" stop-opacity=".72"/><stop offset=".48" stop-color="#daeadd" stop-opacity=".12"/><stop offset="1" stop-color="#dbece0" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-tyre" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#34483b"/><stop offset=".48" stop-color="#16291f"/><stop offset="1" stop-color="#0e1e17"/></linearGradient>
    <linearGradient id="${id}-rim" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#eef3e9"/><stop offset=".42" stop-color="#9baea0"/><stop offset=".69" stop-color="#d5e0d4"/><stop offset="1" stop-color="#687e6f"/></linearGradient>
    <linearGradient id="${id}-spoke" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#eff5ed"/><stop offset=".55" stop-color="#acbeb0"/><stop offset="1" stop-color="#637d6c"/></linearGradient>
    <radialGradient id="${id}-floor"><stop stop-color="#fffef4"/><stop offset=".65" stop-color="#edf2e5"/><stop offset="1" stop-color="#e2ead8" stop-opacity="0"/></radialGradient>
    <filter id="${id}-shadow" x="-30%" y="-70%" width="160%" height="240%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="${id}-light" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <ellipse cx="409" cy="248" rx="304" ry="147" fill="${ref('floor')}"/>
  <g fill="none" stroke="#b6c8ae" stroke-width="1.15" opacity=".6">
    <path d="M491 157V63L536 40 576 59V165M536 40V139M491 63 536 82 576 59M536 82V168"/>
    <path d="M580 151V94L611 80 642 93V157M611 80V147M580 94 611 109 642 93"/>
    <path d="m502 80 24 11m-24 6 24 11m-24 6 24 11m-24 6 24 11m22-52 18-8m-18 23 18-8m-18 23 18-8"/>
    <path d="M480 170 633 174" opacity=".5"/>
  </g>
  <g opacity=".48"><path d="M140 223V151" stroke="#9bb18d" stroke-width="3"/><ellipse cx="140" cy="142" rx="17" ry="30" fill="#c0d1b1"/><path d="M630 201V148" stroke="#93ab84" stroke-width="3"/><ellipse cx="630" cy="139" rx="16" ry="25" fill="#b8ceaa"/></g>
  <path d="M111 282C223 242 426 253 648 320" fill="none" stroke="#c9d7bd" stroke-width="1.2" opacity=".7"/>
  <path d="M115 298C286 253 472 288 648 347" fill="none" stroke="#fbfdf5" stroke-width="2" opacity=".9"/>
  <ellipse cx="407" cy="321" rx="227" ry="35" transform="rotate(12 407 321)" fill="#7b9579" opacity=".2" filter="${ref('shadow')}"/>
  <ellipse cx="476" cy="335" rx="133" ry="12" transform="rotate(12 476 335)" fill="#617d64" opacity=".14"/>
  <g stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="595" cy="248" rx="22" ry="35" transform="rotate(-13 595 248)" fill="#1b3025"/>
    <ellipse cx="599" cy="249" rx="13" ry="27" transform="rotate(-13 599 249)" fill="#607b65"/>
    <path d="M162 228 206 260 507 319 603 270 614 243 561 209 296 151Z" fill="#243c2d" opacity=".94"/>
    ${wheel(246,272,.94)}
    ${wheel(484,313,1.08)}
    <path d="M159 213C167 203 185 195 211 183L248 149C262 138 286 129 309 124L361 111C390 107 439 120 473 137L540 176C566 185 597 196 614 211L616 242 538 291 516 300C516 280 507 264 490 260 470 254 449 268 451 298L277 266C276 247 265 232 248 230 228 228 217 242 220 260L176 248C163 244 156 231 159 213Z" fill="${ref('paint')}" stroke="#365d43" stroke-opacity=".48" stroke-width="1.2"/>
    <path d="M164 211C216 173 247 160 273 146L366 118C397 117 438 129 469 141L538 179 606 204 533 247C446 222 330 192 164 211Z" fill="${ref('bonnet')}"/>
    <path d="M248 149C267 137 293 129 310 125L359 114C388 111 433 123 467 137L424 157 309 135Z" fill="${light}"/>
    <path d="M280 142 312 129 361 117C382 114 418 123 449 136L418 151 316 131Z" fill="${ref('glass')}" stroke="#244136" stroke-width="1.1"/>
    <path d="M302 134 359 120C383 118 408 124 435 135L414 143 316 134Z" fill="${ref('glass-reflect')}"/>
    <path d="M242 158 309 132 419 159 481 201 433 209 305 183 239 174Z" fill="${ref('glass')}" stroke="#244136" stroke-width="1.5"/>
    <path d="M251 158 306 138 371 155 303 176 248 168Z" fill="${ref('glass-reflect')}"/>
    <path d="M317 137 315 184" fill="none" stroke="#19362b" stroke-width="7"/>
    <path d="M397 154 390 199" fill="none" stroke="#18352b" stroke-width="5"/>
    <path d="M241 175C307 190 371 202 432 214" fill="none" stroke="#e6f1df" stroke-width="1.5" opacity=".7"/>
    <path d="M426 157 471 139C493 149 518 162 541 178L481 201Z" fill="${ref('glass')}" stroke="#214134" stroke-width="1.4"/>
    <path d="M434 160 473 145 515 168 480 187Z" fill="${ref('glass-reflect')}"/>
    <path d="M449 159 471 150 505 168" fill="none" stroke="#d5e7dc" stroke-width="1" opacity=".5"/>
    <path d="M481 201 541 178C565 185 590 195 608 206L536 248C516 229 500 215 481 201Z" fill="${ref('bonnet')}" stroke="${lower}" stroke-width=".7"/>
    <path d="M497 202 543 185C564 191 583 199 593 205L538 236C523 221 510 211 497 202Z" fill="${pearl}" opacity=".3"/>
    <path d="M520 209 565 190M536 226 587 199" fill="none" stroke="${deep}" stroke-width=".9" opacity=".24"/>
    <path d="M535 248 610 206C623 212 629 223 624 237L616 257C597 274 567 289 539 299L529 287Z" fill="${ref('front')}" stroke="${deep}" stroke-width="1.1"/>
    <path d="M542 250C568 235 591 223 613 213" fill="none" stroke="#edfff1" stroke-width="3.5"/>
    <path d="M542 250C568 235 591 223 613 213" fill="none" stroke="#e4f6dd" stroke-width="7" opacity=".4" filter="${ref('light')}"/>
    <path d="m544 253 13-4 2 6-15 7m65-43 9-2-2 10-9 5" fill="#effee7"/>
    <path d="M545 266C565 256 595 241 614 229L611 243C591 258 566 273 544 281Z" fill="#1d352b" stroke="#43694c" stroke-width="1"/>
    <path d="m553 269 9-5m6-3 9-5m6-3 9-5m6-3 8-5" fill="none" stroke="#57745b" stroke-width="1.5"/>
    <path d="M538 289 548 285 610 248 617 248 613 259C591 276 564 290 541 299Z" fill="#263e31"/>
    <path d="M550 289 605 258" fill="none" stroke="#a6baa0" stroke-width="1.1" opacity=".8"/>
    <path d="m568 265 29-16 0 11-28 15Z" fill="#d7e4d3" stroke="#6b886a" stroke-width=".7"/>
    <text x="575" y="267" transform="rotate(-29 575 267)" font-size="6.2" letter-spacing=".7" fill="#496a4e" font-family="Arial,sans-serif" font-weight="700">FUTURE</text>
    <path d="m569 214 6-3 3 1-5 5Z" fill="#3f6850"/><path d="m570 214 4 0 2-2" fill="none" stroke="#e2efe0" stroke-width=".7"/>
    <path d="M174 223C277 215 416 248 513 266" fill="none" stroke="${pearl}" stroke-width="2.2" opacity=".7"/>
    <path d="M170 237 215 248M282 260 445 291" fill="none" stroke="${deep}" stroke-width="1.5" opacity=".55"/>
    <path d="M282 266 447 297 447 288 285 257Z" fill="${deep}" opacity=".6"/>
    <path d="M287 257 440 287" fill="none" stroke="${light}" stroke-width="1" opacity=".45"/>
    <path d="M318 189 314 248 317 267M401 210 397 279M233 177 227 214" fill="none" stroke="${deep}" stroke-width="1.1" opacity=".58"/>
    <path d="m333 215 17 4m65 12 15 4" fill="none" stroke="${deep}" stroke-width="3.4"/>
    <path d="m333 214 17 4m65 12 15 4" fill="none" stroke="${pearl}" stroke-width="1.1" opacity=".88"/>
    <path d="M414 204 432 196 449 201 453 211 437 217 419 212Z" fill="${lower}" stroke="${deep}" stroke-width="1"/>
    <path d="M414 204 432 198 447 202 448 207 430 211Z" fill="${light}"/>
    <path d="m421 210 18 4" fill="none" stroke="#eef8e7" stroke-width="1.1"/>
    <path d="m538 171 17-5 7 4-14 7Z" fill="${light}" stroke="${deep}" stroke-width=".7"/>
    <path d="M172 211 190 205 200 210 183 218Z" fill="#e6927e"/><path d="m175 213 18-5" fill="none" stroke="#ffe7d3" stroke-width="1.5"/>
    <path d="M221 260C217 242 228 226 246 226 266 226 281 244 280 266M449 298C447 275 464 255 484 256 505 257 519 277 518 300" fill="none" stroke="${light}" stroke-width="3.5"/>
    <path d="M222 259C221 243 230 232 243 231M451 296C450 279 462 263 477 261" fill="none" stroke="#1e3b2a" stroke-width="1.3" opacity=".65"/>
    <path d="m198 230 7 1 3 7-8-1Z" fill="${paint}" stroke="${deep}" stroke-width=".7"/>
    <path d="M213 180 226 163 245 151" fill="none" stroke="${pearl}" stroke-width="1.6" opacity=".7"/>
  </g>
  <g transform="translate(109 82)" font-family="Microsoft YaHei,PingFang SC,sans-serif">
    <rect width="152" height="43" rx="14" fill="#fffef6" fill-opacity=".92" stroke="#d7e2cb"/>
    <circle cx="22" cy="22" r="11" fill="#e2edda"/><path d="m23 13-6 10h6l-1 7 7-11h-6z" fill="#618f56"/>
    <text x="41" y="19" font-size="9" fill="#819075" letter-spacing=".5">FUTURE CITY GARAGE</text><text x="41" y="33" font-size="11.5" fill="#44623e" font-weight="700">把好奇心，开向未来。</text>
  </g>
  <g transform="translate(491 340)" font-family="Microsoft YaHei,PingFang SC,sans-serif"><circle cx="6" cy="7" r="3" fill="#71975f"/><text x="17" y="11" font-size="10.5" fill="#819274">纯电 · 智能 · 探索</text></g>
  </svg>`;
}
