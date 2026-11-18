// Arcade objectives sit on top of a work/energy model. Tokens award points, never electricity.
export const RALLY_DT = 1 / 60, RALLY_MASS = 1300, RALLY_G = 9.81;
export const RALLY_PACK = 45 * 3600000, BOOST_CAP = 160000;
export type RallyAction = 'drive' | 'coast' | 'regen' | 'brake';
export type RallyBattery = 'normal' | 'cold' | 'full';
export interface RallyCourse { name: string; district: string; copy: string; length: number; cruise: number; limit: number; terrain: { x: number; h: number }[]; gates: number[]; color: string }
export const RALLY_COURSES: RallyCourse[] = [
  {name:'夜市闪送',district:'NEON MARKET',copy:'四份热布丁，穿过夜市送到客人手里。',length:690,cruise:18,limit:85,terrain:[{x:0,h:0},{x:690,h:0}],gates:[145,305,470,630],color:'#65f5ca'},
  {name:'山城追风',district:'HILLSIDE EXPRESS',copy:'下坡别只顾加速，把高度变成下一次冲刺的能量。',length:850,cruise:19,limit:105,terrain:[{x:0,h:18},{x:90,h:18},{x:460,h:2},{x:610,h:2},{x:790,h:0},{x:850,h:0}],gates:[175,345,540,770],color:'#c4a1ff'},
  {name:'午夜接力',district:'MIDNIGHT RELAY',copy:'五站连送，路更长。把回收与冲刺接成自己的节奏。',length:1060,cruise:20,limit:125,terrain:[{x:0,h:8},{x:320,h:8},{x:530,h:0},{x:1060,h:0}],gates:[165,355,560,760,990],color:'#ffce77'}
];
export interface RallyEvent { id: number; x: number; lane: number; kind: 'gate' | 'barrier' | 'token'; name: string; resolved: boolean; outcome?: 'perfect' | 'good' | 'miss' | 'hit' | 'collected' }
export interface RallyNotice { title: string; copy: string; tone: 'mint' | 'gold' | 'red'; until: number }
export interface RallyState {
  course: number; seed: number; battery: RallyBattery; phase: 'ready' | 'running' | 'complete' | 'failed'; paused: boolean;
  tick: number; x: number; v: number; lane: number; targetLane: number; action: RallyAction; boosting: boolean;
  drawn: number; recovered: number; friction: number; losses: number; boostSpent: number; initialBattery: number;
  power: number; drivePower: number; frictionPower: number; score: number; combo: number; bestCombo: number;
  deliveries: number; perfect: number; hits: number; tokens: number; events: RallyEvent[]; notice: RallyNotice; invulnerableUntil: number;
}
function random(seed: number) { let n=seed>>>0; return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}; }
export function rallyTerrain(course: RallyCourse,x: number) {
  for(let i=1;i<course.terrain.length;i++){const a=course.terrain[i-1],b=course.terrain[i];if(x<b.x-1e-8){const slope=(b.h-a.h)/(b.x-a.x);return {height:a.h+(x-a.x)*slope,slope,next:b.x};}}
  return {height:course.terrain.at(-1)!.h,slope:0,next:Infinity};
}
export function createRally(course=0,seed=1,battery:RallyBattery='normal'):RallyState {
  const config=RALLY_COURSES[course],rng=random(seed),events:RallyEvent[]=[];let id=0;
  config.gates.forEach((x,i)=>{
    const lane=i===0?1:Math.floor(rng()*3),prior=i===0?0:config.gates[i-1],barrierX=prior+Math.min(70,(x-prior)*.38);
    events.push({id:id++,x,lane,kind:'gate',name:['布丁摊','灯塔咖啡','小苗花店','星光书屋','终点驿站'][i],resolved:false});
    const barrierLane=(lane+1+Math.floor(rng()*2))%3;
    events.push({id:id++,x:barrierX,lane:barrierLane,kind:'barrier',name:'施工路障',resolved:false});
    for(let j=0;j<3;j++)events.push({id:id++,x:barrierX+18+j*12,lane,kind:'token',name:'快递徽章',resolved:false});
  });
  events.sort((a,b)=>a.x-b.x);
  return {course,seed,battery,phase:'ready',paused:false,tick:0,x:0,v:0,lane:1,targetLane:1,action:'drive',boosting:false,
    drawn:0,recovered:0,friction:0,losses:0,boostSpent:0,initialBattery:RALLY_PACK*(battery==='full'?1:.65),power:0,drivePower:0,frictionPower:0,
    score:0,combo:0,bestCombo:0,deliveries:0,perfect:0,hits:0,tokens:0,events,notice:{title:'准备好，快递员！',copy:'自动前进 · 左右换道 · 按住轻刹回收',tone:'mint',until:4},invulnerableUntil:0};
}
export const rallyKinetic=(s:RallyState)=>.5*RALLY_MASS*s.v*s.v;
export const rallyReserve=(s:RallyState)=>Math.max(0,Math.min(BOOST_CAP,s.recovered-s.boostSpent));
export const rallyEnergyError=(s:RallyState)=>s.drawn+RALLY_MASS*RALLY_G*(rallyTerrain(RALLY_COURSES[s.course],0).height-rallyTerrain(RALLY_COURSES[s.course],s.x).height)-s.recovered-rallyKinetic(s)-s.friction-s.losses;
export function rallyStars(s:RallyState){if(s.phase!=='complete')return 0;return Number(s.deliveries>=Math.ceil(RALLY_COURSES[s.course].gates.length*.6))+Number(s.deliveries===RALLY_COURSES[s.course].gates.length)+Number(s.hits===0&&s.perfect>=2&&s.deliveries===RALLY_COURSES[s.course].gates.length);}
export function rallyNotice(s:RallyState,title:string,copy:string,tone:RallyNotice['tone']='mint'){s.notice={title,copy,tone,until:s.tick*RALLY_DT+2.4};}
export function changeRallyLane(s:RallyState,direction:number){if(s.phase==='running'&&!s.paused)s.targetLane=Math.max(0,Math.min(2,s.targetLane+direction));}
export function stepRally(s:RallyState,regeneration=true) {
  if(s.phase!=='running'||s.paused)return;
  const course=RALLY_COURSES[s.course],beforeX=s.x;let left=RALLY_DT,recoveredStep=0,driveStep=0,heatStep=0;
  s.lane+=Math.max(-3*RALLY_DT,Math.min(3*RALLY_DT,s.targetLane-s.lane));
  const brake=s.action==='brake'?5.2:s.action==='regen'?2.35:0;
  let actualBoost=false;
  for(let sub=0;left>1e-10&&sub<8;sub++){
    const ground=rallyTerrain(course,s.x),road=RALLY_MASS*.14+.42*s.v*s.v,gravity=-RALLY_MASS*RALLY_G*ground.slope;
    const baseForce=s.action==='drive'?Math.max(0,Math.min(RALLY_MASS*2.9,42000/Math.max(3,s.v),RALLY_MASS*(course.cruise-s.v)*1.5+road-gravity)):0;
    const boostForce=s.action==='drive'&&s.boosting&&rallyReserve(s)>10?Math.max(0,Math.min(RALLY_MASS*2,34000/Math.max(3,s.v),RALLY_MASS*(28-s.v)*1.2,rallyReserve(s)*.88/((s.v+4*left)*left))):0;
    actualBoost ||= boostForce>0;
    const drive=baseForce+boostForce,braking=RALLY_MASS*brake,a=(drive+gravity-braking-road)/RALLY_MASS;
    if(s.v===0&&a<=0)break;
    let dt=left;if(a<0&&s.v+a*dt<0)dt=s.v/-a;
    let dx=s.v*dt+.5*a*dt*dt,toCorner=ground.next-s.x;
    if(dx>toCorner&&toCorner>1e-9){dt=Math.abs(a)<1e-10?toCorner/s.v:2*toCorner/(s.v+Math.sqrt(Math.max(0,s.v*s.v+2*a*toCorner)));dx=toCorner;}
    const nextV=Math.max(0,s.v+a*dt),driveWork=drive*dx,electrical=driveWork/.88,brakeWork=braking*dx;
    const available=RALLY_PACK-s.initialBattery+s.drawn-s.recovered;
    const acceptPower=(s.battery==='cold'?5000:26000)*Math.min(1,Math.max(0,available/(RALLY_PACK*.02)));
    const mechanical=regeneration?Math.max(0,Math.min(brakeWork,RALLY_MASS*2.1*Math.min(1,(s.v+nextV)/3)*dx,acceptPower*dt/.76,(available+electrical)/.76)):0;
    const recovered=mechanical*.76,heat=brakeWork-mechanical;
    s.x+=dx;s.v=nextV<1e-9?0:nextV;s.drawn+=electrical;s.recovered+=recovered;s.friction+=heat;
    s.losses+=road*dx+electrical-driveWork+mechanical-recovered;s.boostSpent+=boostForce*dx/.88;
    recoveredStep+=recovered;driveStep+=electrical;heatStep+=heat;left-=dt;
  }
  const auxiliary=140*RALLY_DT;s.drawn+=auxiliary;s.losses+=auxiliary;s.tick++;
  s.power=recoveredStep/RALLY_DT;s.drivePower=driveStep/RALLY_DT;s.frictionPower=heatStep/RALLY_DT;
  if(s.boosting&&!actualBoost&&s.action==='drive')s.boosting=false;
  const now=s.tick*RALLY_DT;
  for(const event of s.events){
    if(event.resolved||event.x>s.x+3)continue;
    const aligned=Math.abs(s.lane-event.lane)<.43;
    if(event.kind==='gate'){
      if(s.x<event.x)continue;event.resolved=true;
      if(aligned&&s.v<=11.2){const perfect=s.v>=4&&s.v<=9;event.outcome=perfect?'perfect':'good';s.deliveries++;s.perfect+=Number(perfect);s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);const points=(perfect?300:180)+Math.min(5,s.combo)*60;s.score+=points;rallyNotice(s,perfect?`完美送达！ ×${s.combo}`:`送到了！ ×${s.combo}`,`${event.name} +${points} · 松开刹车，继续出发`,perfect?'gold':'mint');}
      else{event.outcome='miss';s.combo=0;rallyNotice(s,aligned?'太快了，客人没接住':'错过站台车道',aligned?'下次提前轻刹，把车速降到 40 km/h 以下':'看前方绿色投递门，提前换到对应车道','red');}
    }else if(event.kind==='barrier'){
      if(aligned&&s.x>=event.x-3&&s.x<=event.x+5&&now>s.invulnerableUntil){event.resolved=true;event.outcome='hit';const before=rallyKinetic(s);s.v*=.55;const collisionHeat=before-rallyKinetic(s);s.friction+=collisionHeat;s.frictionPower+=collisionHeat/RALLY_DT;s.hits++;s.combo=0;s.score=Math.max(0,s.score-80);s.invulnerableUntil=now+1.1;rallyNotice(s,'路障擦碰！','连击中断 · -80 分，左右换道避开橙色路障','red');}
      else if(s.x>event.x+5){event.resolved=true;event.outcome='miss';}
    }else{
      if(aligned&&s.x>=event.x-3){event.resolved=true;event.outcome='collected';s.tokens++;s.score+=25;}
      else if(s.x>event.x+3){event.resolved=true;event.outcome='miss';}
    }
  }
  if(s.x>=course.length){s.phase='complete';s.boosting=false;rallyNotice(s,'快递到站，收工！',`${s.deliveries}/${course.gates.length} 站送达 · 最高连击 ×${s.bestCombo}`,'gold');}
  else if(now>=course.limit){s.phase='failed';s.boosting=false;rallyNotice(s,'本趟时间到了','下一趟提早轻刹，送达后松手加速。','red');}
  // Protect against an invalid externally supplied state without changing normal simulation.
  if(!Number.isFinite(s.x)||s.x<beforeX)throw new Error('Invalid rally motion');
}
