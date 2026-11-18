// Future Autonomous EV vector geometry for side profiles (viewBox "-100 -88 200 126",
// nose facing +X, wheels resting at y=34) and top profiles (viewBox "-50 -32 100 64", nose +X).
export interface VectorPath {
  d: string;
  fill: string;
  pivot?: [number, number];
  opacity?: number;
}

function makeWheel(cx: number, cy: number, r = 20): VectorPath[] {
  const ir = r - 5.5;
  const cr = 3.8;
  // 5-spoke turbine alloy star path centered at (cx, cy)
  const spokes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const a1 = a - 0.17;
    const a2 = a + 0.17;
    const x1 = (cx + Math.cos(a1) * (cr + 0.8)).toFixed(1);
    const y1 = (cy + Math.sin(a1) * (cr + 0.8)).toFixed(1);
    const x2 = (cx + Math.cos(a - 0.08) * (ir - 0.8)).toFixed(1);
    const y2 = (cy + Math.sin(a - 0.08) * (ir - 0.8)).toFixed(1);
    const x3 = (cx + Math.cos(a + 0.12) * (ir - 0.8)).toFixed(1);
    const y3 = (cy + Math.sin(a + 0.12) * (ir - 0.8)).toFixed(1);
    const x4 = (cx + Math.cos(a2) * (cr + 0.8)).toFixed(1);
    const y4 = (cy + Math.sin(a2) * (cr + 0.8)).toFixed(1);
    spokes.push(`M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}L${x4} ${y4}Z`);
  }
  const circle = (x: number, y: number, rad: number) =>
    `M${(x - rad).toFixed(1)} ${y.toFixed(1)}a${rad} ${rad} 0 1 0 ${(rad * 2).toFixed(1)} 0a${rad} ${rad} 0 1 0 ${(-rad * 2).toFixed(1)} 0Z`;

  return [
    // Low-profile performance tire
    { d: circle(cx, cy, r), fill: 'tire' },
    // Subtle cyan tire sidewall ring
    { d: `${circle(cx, cy, ir + 1.5)} ${circle(cx, cy, ir + 0.4)}`, fill: 'rim', opacity: 0.45 },
    // Dark brake drum interior
    { d: circle(cx, cy, ir), fill: 'dark' },
    // Performance brake caliper (stationary on rear side of hub)
    { d: `M${(cx - ir + 2).toFixed(1)} ${(cy - 6).toFixed(1)}q-3 6 0 12h4.5q-2-6 0-12Z`, fill: 'caliper' },
    // Rotating 5-spoke turbine alloy rim
    { d: spokes.join(''), fill: 'rim', pivot: [cx, cy] },
    // Rotating center cap with cyan accent
    { d: circle(cx, cy, cr), fill: 'spoke', pivot: [cx, cy] },
    { d: circle(cx, cy, 1.8), fill: 'cyan', pivot: [cx, cy] },
  ];
}

export const SIDE_PATHS: Record<'city' | 'touring' | 'sport', VectorPath[]> = {
  // 星驰 · 未来智驾轿跑 (Sleek Fastback EV Coupe-Sedan)
  city: [
    // Carbon lower aero splitter, side skirt & rear diffuser
    { d: 'M-88 15L-84 22H84L90 15L88 10H-86Z', fill: 'dark' },
    // Underbody cyan ambient light strip
    { d: 'M-30 19.5H30V22H-30Z', fill: 'cyan', opacity: 0.88 },
    // Subtle integrated rear ducktail spoiler
    { d: 'M-88-16L-78-20L-74-15L-86-12Z', fill: 'dark' },
    // Main sculpted fastback EV coupe body silhouette
    { d: 'M-88 12C-89-1-86-11-77-17L-56-25L-34-43C-20-47 0-47 16-44C30-41 42-30 53-19L78-14C87-11 90-4 90 5L88 14H-86Z', fill: 'paint' },
    // Lower sculpted door shadow & dynamic coupe crease
    { d: 'M-86 14L-82-1C-52 3 34 2 70-4L90 2L88 14Z', fill: 'shade' },
    // Sharp upper shoulder metallic highlight
    { d: 'M-78-14C-52-18 28-19 80-12L78-9C28-15-50-14-76-11Z', fill: 'hi', opacity: 0.8 },
    // Sculpted aero side-sill undercut
    { d: 'M-34 10L36 7L32 13H-30Z', fill: 'deep' },
    // Panoramic dark glasshouse canopy (fastback teardrop)
    { d: 'M-62-18L-33-40C-20-44-1-44 15-41C28-38 39-29 48-18L41-15H-54Z', fill: 'glass' },
    // Glossy frameless side windows
    { d: 'M-46-18L-30-37C-19-41-7-41 2-40L-2-17Z', fill: 'glassMid' },
    { d: 'M6-40C20-38 31-30 41-18L4-17Z', fill: 'glassMid' },
    // Diagonal cyber glass specular streak
    { d: 'M-21-39L-10-39L-23-18L-31-18Z M13-37L22-34L9-18L2-18Z', fill: 'glassHi', opacity: 0.44 },
    // Ultra-slim blacked-out B-pillar
    { d: 'M-1-41H4L1-16H-3Z', fill: 'dark' },
    // Flush digital side mirror & hidden door handles
    { d: 'M29-18L39-20L41-15L30-13Z', fill: 'dark' },
    { d: 'M31-17.5L38-18.8L39-16.5L32-15.5Z', fill: 'cyan' },
    { d: 'M-22-10H-10V-8H-22Z M8-10.5H20V-8.5H8Z', fill: 'hi', opacity: 0.9 },
    // Roof integrated low-profile solid-state LiDAR brow
    { d: 'M-4-46C2-50 13-50 18-45L15-43H-2Z', fill: 'dark' },
    { d: 'M1-47.5H13V-45.5H1Z', fill: 'cyan' },
    // Razor-sharp LED matrix headlight + cyan DRL blade
    { d: 'M66-12L88-8L89-2L70-5Z', fill: 'headlight' },
    { d: 'M62-11L88-7L87-5L63-9Z', fill: 'cyan' },
    // Front lower dark aero intake grille
    { d: 'M75 3L90 1L88 12H73Z', fill: 'dark' },
    // Full-width cyber crimson taillight blade
    { d: 'M-87-10L-71-12L-73-6L-88-4Z', fill: 'taillight' },
    { d: 'M-87-8.5L-74-10L-75-8L-87-6.5Z', fill: '#ffb3c4' },
    // Dark wheel arch cutouts
    { d: 'M-76 14A23 23 0 0 1-30 14Z M30 14A23 23 0 0 1 76 14Z', fill: 'dark' },
    ...makeWheel(-53, 14, 20),
    ...makeWheel(53, 14, 20),
  ],

  // 星舰 · 未来智驾 SUV (Futuristic Aero Cyber SUV)
  touring: [
    // Rugged carbon skid plates & lower cladding
    { d: 'M-88 14L-84 22H84L89 14L87 8H-87Z', fill: 'dark' },
    { d: 'M-28 19H28V21.5H-28Z', fill: 'cyan', opacity: 0.85 },
    // Commanding futuristic SUV body
    { d: 'M-88 10L-86-16L-78-46C-74-53-64-56-48-56H16C30-56 41-46 51-28L78-23C87-21 90-12 90 2L88 13H-86Z', fill: 'paint' },
    // Sculpted lower body shade
    { d: 'M-86 13L-84-2C-40 2 35 1 72-4L89 0L88 13Z', fill: 'shade' },
    // Strong horizontal shoulder crease highlight
    { d: 'M-83-20H78L76-16H-82Z', fill: 'hi', opacity: 0.72 },
    // Roof aero rails & rear spoiler
    { d: 'M-74-56L-88-52L-85-47L-72-50Z', fill: 'dark' },
    { d: 'M-62-58H16V-55H-62Z', fill: 'rim' },
    // Integrated roof LiDAR sensor bar
    { d: 'M6-58C11-62 21-62 26-56H8Z', fill: 'dark' },
    { d: 'M11-59.5H21V-57.5H11Z', fill: 'cyan' },
    // Floating blacked-out panoramic greenhouse
    { d: 'M-76-22L-70-48C-66-52-56-53-42-53H14C26-53 36-44 45-25L39-21H-74Z', fill: 'glass' },
    // Side windows with glossy reflection
    { d: 'M-69-24L-64-46H-38V-24Z M-33-46H-2V-24H-33Z M4-46H14C23-46 31-38 38-24H4Z', fill: 'glassMid' },
    { d: 'M-56-46L-47-46L-58-24L-65-24Z M-18-46L-9-46L-20-24L-27-24Z M14-44L22-41L10-24L4-24Z', fill: 'glassHi', opacity: 0.42 },
    // Digital mirror & flush handles
    { d: 'M24-24L35-26L37-20L25-18Z', fill: 'dark' },
    { d: 'M26-23L34-24.5L35-22L27-21Z', fill: 'cyan' },
    { d: 'M-30-13H-18V-10.5H-30Z M4-13H16V-10.5H4Z', fill: 'hi', opacity: 0.88 },
    // Futuristic matrix LED headlight strip
    { d: 'M68-19L88-16L89-9L70-12Z', fill: 'headlight' },
    { d: 'M66-18L88-15L88-12.5L66-15.5Z', fill: 'cyan' },
    // Front lower aero grille
    { d: 'M76 0L90-2L88 11H74Z', fill: 'dark' },
    // Vertical + horizontal blade taillight
    { d: 'M-87-19L-74-20L-75-9L-87-8Z', fill: 'taillight' },
    { d: 'M-86-16H-76V-13H-86Z', fill: '#ffb3c4' },
    // Squared off-road cyber wheel arches
    { d: 'M-77 14L-70-6H-36L-29 14Z M29 14L36-6H70L77 14Z', fill: 'dark' },
    ...makeWheel(-53, 14, 20),
    ...makeWheel(53, 14, 20),
  ],

  // 极光 · 电动超跑 (Low-Slung Hyper EV Coupe)
  sport: [
    // Aggressive carbon fiber front splitter, diffuser & side aero blades
    { d: 'M-90 15L-86 23H88L94 16L90 11H-88Z', fill: 'dark' },
    { d: 'M-32 20H32V22.5H-32Z', fill: 'cyan', opacity: 0.9 },
    // Elevated carbon fiber rear GT wing
    { d: 'M-88-26L-68-24L-66-18L-89-20Z', fill: 'dark' },
    { d: 'M-78-22L-72-8H-67L-72-21Z', fill: 'deep' },
    { d: 'M-88-25L-68-23.5L-68-22L-88-23.5Z', fill: 'cyan', opacity: 0.85 },
    // Ultra-low wedge hypercar body
    { d: 'M-89 12L-86-8C-80-16-66-20-48-24L-24-39C-10-44 10-43 26-34L48-19L78-14C88-11 93-3 92 8L89 15H-87Z', fill: 'paint' },
    // Dramatic aerodynamic side air-curtain channel
    { d: 'M-86 14L-76-2L-26-4L22-8L72-4L91 4L89 15Z', fill: 'shade' },
    { d: 'M-32-10L18-13L8 10L-40 11Z', fill: 'deep' },
    // Razor-sharp metallic ridge highlight
    { d: 'M-82-10C-54-16 20-18 82-10L80-7C20-14-52-13-80-7Z', fill: 'hi', opacity: 0.85 },
    // Teardrop fighter-jet cockpit canopy
    { d: 'M-44-21L-22-37C-9-41 9-40 23-32L42-18L34-15H-38Z', fill: 'glass' },
    { d: 'M-32-20L-17-34C-6-38 7-37 19-30L33-18Z', fill: 'glassMid' },
    { d: 'M-12-36L-2-36L-15-19L-23-19Z M8-34L16-30L4-19L-3-19Z', fill: 'glassHi', opacity: 0.48 },
    // Low-profile roof LiDAR micro-pod
    { d: 'M-6-42C0-45 10-45 15-40L12-38H-4Z', fill: 'dark' },
    { d: 'M0-43H10V-41H0Z', fill: 'cyan' },
    // Side mirror blade
    { d: 'M20-18L31-20L32-16L21-14Z', fill: 'dark' },
    // Aggressive laser blade headlight
    { d: 'M68-10L90-5L90 1L70-3Z', fill: 'headlight' },
    { d: 'M65-9L90-4L89-2L66-7Z', fill: 'cyan' },
    // Wide front splitter intake
    { d: 'M76 5L92 3L90 13H74Z', fill: 'dark' },
    // Sleek crimson diffuser taillight bar
    { d: 'M-88-5L-71-8L-72-2L-88 1Z', fill: 'taillight' },
    { d: 'M-88-3.5L-73-6L-73-4L-88-1.5Z', fill: '#ffb3c4' },
    // Deep wheel arch cutouts
    { d: 'M-77 14A23.5 23.5 0 0 1-30 14Z M30 14A23.5 23.5 0 0 1 77 14Z', fill: 'dark' },
    ...makeWheel(-53, 14, 20),
    ...makeWheel(53, 14, 20),
  ],
};

export const TOP_PATHS: Record<'city' | 'touring' | 'sport', VectorPath[]> = {
  // 星驰 · 智驾轿跑俯视图 (viewBox "-50 -32 100 64", nose +X)
  city: [
    // Wheels peeking slightly at fenders
    { d: 'M-33-24h14v5h-14zM-33 19h14v5h-14zM19-24h14v5H19zM19 19h14v5H19z', fill: 'tire' },
    // Outer body contour & wide fenders
    { d: 'M-45-13Q-45-22-32-22H24Q44-21 46-10V10Q44 21 24 22H-32Q-45 22-45 13Z', fill: 'shade' },
    // Sculpted upper paintwork
    { d: 'M-42-11Q-42-19-30-19H24Q40-18 42-9V9Q40 18 24 19H-30Q-42 19-42 11Z', fill: 'paint' },
    // Hood aero power lines
    { d: 'M20-12L38-9L37-7L19-10ZM20 12L38 9L37 7L19 10Z', fill: 'hi', opacity: 0.65 },
    // Full-length blacked-out panoramic glass canopy
    { d: 'M-32-13Q-35-15-26-16H6L24-12V12L6 16H-26Q-35 15-32 13Z', fill: 'glass' },
    // Windshield & panoramic roof reflection
    { d: 'M7-13L21-10V10L7 13Z', fill: 'glassMid' },
    { d: 'M-27-12H4V12H-27Z', fill: 'glassMid', opacity: 0.72 },
    { d: 'M10-11L18-8L11 11L4 12Z M-18-11L-8-11L-18 11L-24 11Z', fill: 'glassHi', opacity: 0.34 },
    // Roof integrated LiDAR module (cyan glow bar)
    { d: 'M5-7H10V7H5Z', fill: 'dark' },
    { d: 'M6.5-5H8.5V5H6.5Z', fill: 'cyan' },
    // Sharp LED headlights + cyan DRL
    { d: 'M32-16L43-12L44-8L34-11ZM34 11L44 8L43 12L32 16Z', fill: 'headlight' },
    { d: 'M34-15L43-11.5L43-10L34-13.5ZM34 15L43 11.5L43 10L34 13.5Z', fill: 'cyan' },
    // Full-width cyber taillight bar
    { d: 'M-44-14H-41V14H-44Z', fill: 'taillight' },
    // Digital side mirrors
    { d: 'M11-20L15-26L20-25L18-20ZM11 20L15 26L20 25L18 20Z', fill: 'dark' },
  ],

  // 星舰 · 智驾 SUV 俯视图
  touring: [
    { d: 'M-35-26h16v6h-16zM-35 20h16v6h-16zM20-26h15v6H20zM20 20h15v6H20z', fill: 'tire' },
    { d: 'M-47-16Q-47-24-36-24H28Q46-23 47-12V12Q46 23 28 24H-36Q-47 24-47 16Z', fill: 'shade' },
    { d: 'M-44-15Q-44-21-35-21H28Q42-20 44-10V10Q42 20 28 21H-35Q-44 21-44 15Z', fill: 'paint' },
    // Hood sculptural creases
    { d: 'M22-14H39V-11.5H22ZM22 11.5H39V14H22Z', fill: 'hi', opacity: 0.6 },
    // Panoramic SUV roof glass
    { d: 'M-37-16H10L25-12V12L10 16H-37Z', fill: 'glass' },
    { d: 'M11-13L22-10V10L11 13Z M-32-13H8V13H-32Z', fill: 'glassMid' },
    { d: 'M-22-12H-12L-22 12H-30Z M13-11L19-9L13 11L9 12Z', fill: 'glassHi', opacity: 0.32 },
    // Twin brushed silver roof rails
    { d: 'M-36-18.5H9V-16.5H-36ZM-36 16.5H9V18.5H-36Z', fill: 'rim' },
    // Roof dual LiDAR sensor pod
    { d: 'M7-9H13V9H7Z', fill: 'dark' },
    { d: 'M9-7H11V7H9Z', fill: 'cyan' },
    // Matrix LED headlights & full-width taillight
    { d: 'M35-18L44-15L45-9L37-11ZM37 11L45 9L44 15L35 18Z', fill: 'headlight' },
    { d: 'M-46-16H-43V16H-46Z', fill: 'taillight' },
    { d: 'M13-21L18-27H23L21-21ZM13 21L18 27H23L21 21Z', fill: 'dark' },
  ],

  // 极光 · 电动超跑俯视图
  sport: [
    { d: 'M-34-26h17v8h-17zM-34 18h17v8h-17zM20-25h16v7H20zM20 18h16v7H20z', fill: 'tire' },
    // Widebody aerodynamic fuselage
    { d: 'M-45-21L-20-22L-4-18L16-20L36-17L48-8V8L36 17L16 20L-4 18L-20 22L-45 21Z', fill: 'shade' },
    { d: 'M-42-18L-20-19L-4-15L16-17L35-14L45-6V6L35 14L16 17L-4 15L-20 19L-42 18Z', fill: 'paint' },
    // Side aero intakes
    { d: 'M-18-17H4L-2-13H-14ZM-18 17H4L-2 13H-14Z', fill: 'dark' },
    // Carbon GT rear wing
    { d: 'M-47-24H-40V24H-47Z', fill: 'dark' },
    { d: 'M-45.5-22H-43.5V22H-45.5Z', fill: 'cyan', opacity: 0.78 },
    // Teardrop fighter cockpit canopy
    { d: 'M-26-10Q-8-14 14-10L24-6V6L14 10Q-8 14-26 10Z', fill: 'glass' },
    { d: 'M-18-7Q-4-11 12-7L20-4V4L12 7Q-4 11-18 7Z', fill: 'glassMid' },
    { d: 'M2-8L12-6L2 7L-6 8Z', fill: 'glassHi', opacity: 0.42 },
    // Central cyber energy spine & roof LiDAR
    { d: 'M-38-1.5H-24V1.5H-38Z M4-5H9V5H4Z', fill: 'cyan', opacity: 0.85 },
    // Razor laser headlights & crimson rear bar
    { d: 'M32-14L44-8L45-5L34-10ZM34 10L45 5L44 8L32 14Z', fill: 'headlight' },
    { d: 'M-42-15H-39V15H-42Z', fill: 'taillight' },
  ],
};
