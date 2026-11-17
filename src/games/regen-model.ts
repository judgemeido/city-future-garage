import { REGEN_ROUTES, terrainAt } from './regen-route.ts';

export type RegenMode = 'normal'|'cold'|'full';
export type RegenAction = 'drive'|'coast'|'light'|'hard';
export type RegenPhase = 'ready'|'running'|'delivery'|'complete'|'failed';
export const MODES: Record<RegenMode,{name:string;soc:number;temp:number;power:number}> = {
  normal:{name:'常温电池',soc:65,temp:25,power:20000}, cold:{name:'低温电池',soc:65,temp:-5,power:3500}, full:{name:'满电出发',soc:100,temp:25,power:20000}
};
export const ACTIONS: RegenAction[]=['drive','coast','light','hard'];
export const DT=1/120, MASS=1300, GRAVITY=9.81, CAPACITY=45*3600000, MODEL_VERSION=3;
const DRIVE_EFF=.88, REGEN_EFF=.76;
export const kinetic=(v:number)=>.5*MASS*v*v;
export interface RegenInput { tick:number; action:RegenAction|'depart' }
// Frames are bounded 10 Hz snapshots; exact reproduction uses integer input ticks.
export interface RegenFrame { t:number;x:number;v:number;recovered:number;drawn:number;friction:number;losses:number;height:number }
export interface RegenState {
  version:number;route:number;mode:RegenMode;phase:RegenPhase;paused:boolean;action:RegenAction;tick:number;x:number;v:number;
  brake:number;acceleration:number;power:number;drivePower:number;frictionPower:number;
  initialBattery:number;drawn:number;recovered:number;friction:number;losses:number;
  stopIndex:number;deliveries:{x:number;precision:number}[];dwell:number;
  cargo:number;cargoVelocity:number;maxSway:number;overspeed:number;assisted:boolean;practice:boolean;emergency:string;
  inputs:RegenInput[];frames:RegenFrame[];
}
export function createRegen(route=0, mode:RegenMode='normal'):RegenState {
  return {version:MODEL_VERSION,route,mode,phase:'ready',paused:false,action:'coast',tick:0,x:0,v:0,brake:0,acceleration:0,power:0,drivePower:0,frictionPower:0,
    initialBattery:CAPACITY*MODES[mode].soc/100,drawn:0,recovered:0,friction:0,losses:0,stopIndex:0,deliveries:[],dwell:0,
    cargo:0,cargoVelocity:0,maxSway:0,overspeed:0,assisted:false,practice:false,emergency:'',inputs:[],frames:[{t:0,x:0,v:0,recovered:0,drawn:0,friction:0,losses:0,height:terrainAt(REGEN_ROUTES[route],0).height}]};
}
export const batteryEnergy=(s:RegenState)=>s.initialBattery-s.drawn+s.recovered;
export const soc=(s:RegenState)=>batteryEnergy(s)/CAPACITY*100;
export const netEnergy=(s:RegenState)=>s.drawn-s.recovered;
export function acceptance(s:RegenState) {
  // Smooth taper over the last 2% of this teaching battery's capacity.
  return MODES[s.mode].power*Math.min(1,Math.max(0,(CAPACITY-batteryEnergy(s))/(CAPACITY*.02)));
}
export function energyError(s:RegenState) {
  const route=REGEN_ROUTES[s.route];
  return s.drawn+MASS*GRAVITY*(terrainAt(route,0).height-terrainAt(route,s.x).height)-s.recovered-kinetic(s.v)-s.friction-s.losses;
}
export function startRegen(s:RegenState) {
  if(s.phase!=='ready'&&s.phase!=='delivery')return;
  if(s.phase==='delivery')s.inputs.push({tick:s.tick,action:'depart'});
  s.phase='running';s.paused=false;s.dwell=0;setRegenAction(s,'drive');
}
export function setRegenAction(s:RegenState,action:RegenAction) {
  if(!ACTIONS.includes(action)||s.action===action||s.phase!=='running')return;
  s.action=action;
  // Only the final action before the next physics tick affects motion. Keep departure events.
  const last=s.inputs.at(-1);
  if(last?.tick===s.tick&&last.action!=='depart')last.action=action;
  else s.inputs.push({tick:s.tick,action});
}
export function frame(s:RegenState):RegenFrame {
  const r=(n:number)=>Math.round(n*1000)/1000;
  return {t:r(s.tick*DT),x:r(s.x),v:r(s.v),recovered:r(s.recovered),drawn:r(s.drawn),friction:r(s.friction),losses:r(s.losses),height:r(terrainAt(REGEN_ROUTES[s.route],s.x).height)};
}
export function suggestedAction(s:RegenState):RegenAction {
  const route=REGEN_ROUTES[s.route],d=route.stops[s.stopIndex].x-s.x;
  const gravity=-GRAVITY*terrainAt(route,s.x).slope, light=Math.max(.2,1.35+.12-gravity), hard=4.2+.12-gravity;
  if(d<0 || s.v*s.v/(2*hard)+s.v*.35>d)return 'hard';
  if(s.v*s.v/(2*light)+s.v*.5>d)return 'light';
  if(s.v>Math.min(route.cruise,Math.sqrt(Math.max(0,d)*1.6)))return 'coast';
  if(s.v<.08&&Math.abs(d)<=route.tolerance*.6)return 'light';
  return 'drive';
}
export function stepRegen(s:RegenState, regeneration=true, record=true) {
  if(s.phase!=='running'||s.paused)return;
  const route=REGEN_ROUTES[s.route],target=route.stops[s.stopIndex];
  if(!s.emergency && (s.x>target.x+route.tolerance+5 || s.tick*DT>route.timeLimit || (batteryEnergy(s)<=0&&s.v<.01)))
    s.emergency=s.x>target.x+route.tolerance+5?'错过站点，教练正在制动收尾':s.tick*DT>route.timeLimit?'本趟用时已到，教练正在制动收尾':'电池能量已用完';
  const demand=s.emergency?5:s.action==='hard'?4.2:s.action==='light'?1.35:0;
  s.brake+=Math.max(-5*DT,Math.min(5*DT,demand-s.brake));
  const beforeV=s.v;let remaining=DT,regenStep=0,drawStep=0,heatStep=0;
  // Split at terrain corners and at zero speed. Work and motion use the same force and distance.
  for(let sub=0;remaining>1e-10&&sub<8;sub++) {
    const ground=terrainAt(route,s.x),road=MASS*.12+.4*s.v*s.v,gravity=-MASS*GRAVITY*ground.slope;
    const braking=MASS*s.brake;
    // Release braking before the same motor changes back to driving.
    let drive=s.action==='drive'&&!s.emergency&&s.brake<1e-9?Math.max(0,Math.min(MASS*1.7,40000/Math.max(2,s.v),MASS*(route.cruise-s.v)*1.4+road-gravity)):0;
    // At a virtually empty pack, coast rather than creating energy for an unaffordable drive step.
    if(batteryEnergy(s)<drive*(s.v+3*remaining)*remaining/DRIVE_EFF+120*remaining)drive=0;
    const a=(drive+gravity-braking-road)/MASS;
    if(s.v===0&&a<=0)break;
    let dt=remaining;
    if(a<0&&s.v+a*dt<0)dt=s.v/-a;
    let dx=s.v*dt+.5*a*dt*dt;
    const toCorner=ground.next-s.x;
    if(dx>toCorner&&toCorner>1e-9) {
      dt=Math.abs(a)<1e-10?toCorner/s.v:2*toCorner/(s.v+Math.sqrt(Math.max(0,s.v*s.v+2*a*toCorner)));
      dx=toCorner;
    }
    const nextV=Math.max(0,s.v+a*dt),driveWork=drive*dx,roadWork=road*dx,brakeWork=braking*dx;
    const electricalDraw=driveWork/DRIVE_EFF;
    const speedFade=Math.min(1,(s.v+nextV)/2/1.5);
    const mechanical=regeneration?Math.max(0,Math.min(brakeWork,MASS*1.3*speedFade*dx,acceptance(s)*dt/REGEN_EFF,
      (CAPACITY-batteryEnergy(s)+electricalDraw)/REGEN_EFF)):0;
    const recovered=mechanical*REGEN_EFF,heat=brakeWork-mechanical;
    s.x+=dx;s.v=nextV<1e-9?0:nextV;s.drawn+=electricalDraw;s.recovered+=recovered;s.friction+=heat;
    s.losses+=roadWork+electricalDraw-driveWork+mechanical-recovered;
    regenStep+=recovered;drawStep+=electricalDraw;heatStep+=heat;remaining-=dt;
  }
  const auxiliary=Math.min(Math.max(0,batteryEnergy(s)),120*DT);s.drawn+=auxiliary;s.losses+=auxiliary;
  s.power=regenStep/DT;s.drivePower=drawStep/DT;s.frictionPower=heatStep/DT;s.acceleration=(s.v-beforeV)/DT;
  s.cargoVelocity+=(-s.acceleration*.07-s.cargo)*18*DT-s.cargoVelocity*7*DT;
  s.cargo+=s.cargoVelocity*DT;s.maxSway=Math.max(s.maxSway,Math.abs(s.cargo));
  if(s.v>route.speedLimit)s.overspeed+=DT;
  s.tick++;
  if(s.v===0&&Math.abs(s.x-target.x)<=route.tolerance&&!s.emergency) s.dwell+=DT;else s.dwell=0;
  if(s.emergency&&s.v===0)s.phase='failed';
  else if(s.dwell>=.45){s.deliveries.push({x:s.x,precision:Math.max(0,1-Math.abs(s.x-target.x)/route.tolerance)});s.stopIndex++;s.phase=s.stopIndex===route.stops.length?'complete':'delivery';s.action='coast';s.power=0;s.drivePower=0;s.frictionPower=0;}
  if(record&&(s.tick%12===0||s.phase!=='running'))s.frames.push(frame(s));
}
export interface RegenAttempt {
  id:string;version:number;route:number;mode:RegenMode;initialBattery:number;ticks:number;inputs:RegenInput[];frames:RegenFrame[];
  success:boolean;assisted:boolean;practice:boolean;deliveries:RegenState['deliveries'];x:number;recovered:number;drawn:number;friction:number;losses:number;remaining:number;stars:number;maxSway:number;overspeed:number;
}
export function replayRegen(attempt:RegenAttempt,mode:RegenMode=attempt.mode,regeneration=true):RegenState {
  const s=createRegen(attempt.route,mode);s.phase='running';if(mode===attempt.mode)s.initialBattery=attempt.initialBattery;
  let event=0;
  for(let tick=0;tick<attempt.ticks;tick++) {
    while(event<attempt.inputs.length&&attempt.inputs[event].tick===tick){const input=attempt.inputs[event++];if(input.action==='depart'){s.phase='running';s.dwell=0;}else s.action=input.action;}
    stepRegen(s,regeneration);
  }
  return s;
}
const references=new Map<string,number>();
export function referenceEnergy(route:number,mode:RegenMode):number {
  const key=`${route}-${mode}`;if(references.has(key))return references.get(key)!;
  const s=createRegen(route,mode);startRegen(s);
  for(let i=0;i<18000&&s.phase!=='complete'&&s.phase!=='failed';i++) {
    if(s.phase==='delivery')startRegen(s);
    if(s.tick%12===0)setRegenAction(s,suggestedAction(s));
    stepRegen(s,true,false);
  }
  if(s.phase!=='complete')throw new Error(`Reference route ${key} is not reachable`);
  const limit=netEnergy(s)+Math.max(20000,Math.abs(netEnergy(s))*.35);references.set(key,limit);return limit;
}
export function regenStars(s:RegenState) {
  if(s.phase!=='complete'||s.assisted||s.practice||s.emergency||s.overspeed>.6)return 0;
  return 1+Number(s.maxSway<=.28)+Number(netEnergy(s)<=referenceEnergy(s.route,s.mode));
}
export function makeAttempt(s:RegenState,id:string):RegenAttempt {
  return {id,version:MODEL_VERSION,route:s.route,mode:s.mode,initialBattery:s.initialBattery,ticks:s.tick,inputs:structuredClone(s.inputs),frames:structuredClone(s.frames),success:s.phase==='complete',assisted:s.assisted,practice:s.practice,deliveries:structuredClone(s.deliveries),x:s.x,recovered:s.recovered,drawn:s.drawn,friction:s.friction,losses:s.losses,remaining:kinetic(s.v),stars:regenStars(s),maxSway:s.maxSway,overspeed:s.overspeed};
}
export function comparable(a:RegenAttempt,b:RegenAttempt) {
  return a.id!==b.id&&a.success&&b.success&&!a.assisted&&!b.assisted&&!a.practice&&!b.practice&&a.overspeed<=.6&&b.overspeed<=.6&&a.version===b.version&&a.route===b.route&&a.mode===b.mode&&a.initialBattery===b.initialBattery&&a.deliveries.length===b.deliveries.length&&a.deliveries.every((d,i)=>Math.abs(d.x-b.deliveries[i].x)<=1);
}
export function readAttempts(raw:unknown):RegenAttempt[] {
  if(!Array.isArray(raw))return [];
  const nonnegative=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  return raw.filter((v):v is RegenAttempt=>{
    if(!v||v.version!==MODEL_VERSION||typeof v.id!=='string'||v.id.length>100||!Number.isInteger(v.route)||v.route<0||v.route>=3||typeof v.mode!=='string'||!Object.hasOwn(MODES,v.mode))return false;
    if(!Number.isInteger(v.ticks)||v.ticks<=0||v.ticks>18000||!nonnegative(v.initialBattery)||v.initialBattery>CAPACITY||![v.success,v.assisted,v.practice].every(x=>typeof x==='boolean'))return false;
    if(!Number.isInteger(v.stars)||v.stars<0||v.stars>3||![v.recovered,v.drawn,v.friction,v.losses,v.remaining,v.x,v.maxSway,v.overspeed].every(nonnegative))return false;
    if(!Array.isArray(v.inputs)||v.inputs.length>18004||!v.inputs.every((i:RegenInput,n:number)=>i&&Number.isInteger(i.tick)&&i.tick>=0&&i.tick<=v.ticks&&(n===0||i.tick>=v.inputs[n-1].tick)&&[...ACTIONS,'depart'].includes(i.action)))return false;
    if(!Array.isArray(v.frames)||v.frames.length>1505||!v.frames.every((f:RegenFrame,n:number)=>f&&[f.t,f.x,f.v,f.recovered,f.drawn,f.friction,f.losses,f.height].every(nonnegative)&&f.t<=v.ticks*DT+.001&&(n===0||f.t>=v.frames[n-1].t)))return false;
    const route=REGEN_ROUTES[v.route];
    return Array.isArray(v.deliveries)&&v.deliveries.length<=route.stops.length&&(!v.success||v.deliveries.length===route.stops.length)&&v.deliveries.every((d:RegenState['deliveries'][number],i:number)=>d&&nonnegative(d.x)&&Math.abs(d.x-route.stops[i].x)<=route.tolerance&&nonnegative(d.precision)&&d.precision<=1);
  }).slice(-6);
}
