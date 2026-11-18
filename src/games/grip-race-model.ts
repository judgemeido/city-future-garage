// A road-relative teaching model: longitudinal braking and lateral support share µg.
export const GRIP_RACE_DT=1/60, ROAD_HALF_WIDTH=4.8;
export type RaceTire='rain'|'standard'|'worn';
export const RACE_TIRES:Record<RaceTire,{name:string;factor:number}>={rain:{name:'雨天胎',factor:1},standard:{name:'日常胎',factor:.84},worn:{name:'磨损胎',factor:.65}};
export const RAIN_COURSES=[
  {name:'雨巷初航',copy:'绕开积水，带着护航星稳稳穿过三个弯。',length:320,amplitude:18,wave:145,wet:.46,cruise:8.2,limit:100,color:'#8bdcff'},
  {name:'暴雨山路',copy:'雨更大、弯更急。先减速，再转向。',length:400,amplitude:23,wave:140,wet:.69,cruise:9,limit:135,color:'#b1a0ff'},
  {name:'午夜连环弯',copy:'收集护航星，保持连击，解开最后的湿滑连环弯。',length:490,amplitude:25,wave:132,wet:.76,cruise:9.5,limit:155,color:'#ffc783'}
];
export interface RainItem {id:number;at:number;offset:number;kind:'star'|'puddle';resolved:boolean;collected?:boolean}
export interface RainCorner {at:number;resolved:boolean;worstSlip:number;outside:boolean}
export interface RainNotice {title:string;copy:string;tone:'blue'|'gold'|'red';until:number}
export type RainStrategy='comfort'|'balanced'|'mission';
export const RAIN_STRATEGIES:Record<RainStrategy,{name:string;speed:number;copy:string}>={comfort:{name:'舒适优先',speed:4.5,copy:'更早减速，留出更多抓地余量'},balanced:{name:'平衡领航',speed:5.7,copy:'绕开风险，兼顾平稳与进度'},mission:{name:'任务优先',speed:6.4,copy:'安全前提下，更多靠近护航信标'}};
export interface RainDecision {id:number;at:number;offset:number;kind:'works'|'fog'|'car';title:string;copy:string;options:{action:string;label:string}[];answer:string;resolved:boolean;attempts:number;passed:boolean}
export interface RainDetection {at:number;offset:number;kind:'puddle'|'works'|'fog'|'car';name:string;confidence:number}
export interface RainAutonomy {control:'auto'|'manual';strategy:RainStrategy;confidence:number;targetSpeed:number;acceleration:number;reason:string;detected:RainDetection[];path:{at:number;offset:number}[];events:RainDecision[];pending:number;correct:number;firstCorrect:number;mistakes:number;avoided:number;takeovers:number;emergency:boolean;emergencyStops:number;wasEmergency:boolean;feedback:string;log:{event:string;action:string;correct:boolean;progress:number}[]}
export interface GripRace {
  course:number;seed:number;tire:RaceTire;phase:'ready'|'running'|'complete'|'failed';paused:boolean;tick:number;
  progress:number;speed:number;offset:number;targetOffset:number;lateralVelocity:number;steer:number;braking:boolean;accelerating:boolean;
  mu:number;gripUse:number;slip:number;slipTime:number;outsideTime:number;damage:number;rescues:number;score:number;
  starsCollected:number;cornersPassed:number;perfectCorners:number;combo:number;bestCombo:number;
  items:RainItem[];corners:RainCorner[];notice:RainNotice;trail:{at:number;offset:number}[];
  autonomy?:RainAutonomy;
}
function rng(seed:number){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function rainRoad(course:number,s:number){
  const config=RAIN_COURSES[course],z=Math.max(0,s-35),k=2*Math.PI/config.wave;
  const x=config.amplitude*(1-Math.cos(z*k)),dx=s<=35?0:config.amplitude*k*Math.sin(z*k),ddx=s<35?0:config.amplitude*k*k*Math.cos(z*k);
  return {x,dx,curvature:ddx/(1+dx*dx)**1.5,normalX:1/Math.sqrt(1+dx*dx),normalY:dx/Math.sqrt(1+dx*dx)};
}
export function createGripRace(course=0,seed=1,tire:RaceTire='rain'):GripRace {
  const config=RAIN_COURSES[course],random=rng(seed),items:RainItem[]=[],corners:RainCorner[]=[];let id=0;
  for(let at=62;at<config.length-15;at+=37){const side=id===0?0:Math.floor(random()*3)-1;items.push({id:id++,at,offset:side*2.6,kind:'star',resolved:false});}
  for(let at=90;at<config.length-20;at+=74){items.push({id:id++,at,offset:(Math.floor(random()*3)-1)*2.7,kind:'puddle',resolved:false});}
  for(let at=35+config.wave/2;at<config.length-20;at+=config.wave/2)corners.push({at,resolved:false,worstSlip:0,outside:false});
  items.sort((a,b)=>a.at-b.at);
  return {course,seed,tire,phase:'ready',paused:false,tick:0,progress:0,speed:0,offset:0,targetOffset:0,lateralVelocity:0,steer:0,braking:false,accelerating:false,mu:0,gripUse:0,slip:0,slipTime:0,outsideTime:0,damage:0,rescues:0,score:0,starsCollected:0,cornersPassed:0,perfectCorners:0,combo:0,bestCombo:0,items,corners,notice:{title:'出发，雨夜护航员！',copy:'巡航自动前进 · 左右轻拨 · 弯前按住刹车',tone:'blue',until:3},trail:[{at:0,offset:0}]};
}
export function rainFriction(s:GripRace){
  const config=RAIN_COURSES[s.course],puddle=s.items.some(e=>e.kind==='puddle'&&Math.abs(e.at-s.progress)<8&&Math.abs(e.offset-s.offset)<1.55);
  return Math.max(.1,(.91-.69*config.wet)*(puddle?.52:1)*RACE_TIRES[s.tire].factor);
}
export function rainAdvice(s:GripRace){
  let maximum=0;for(let d=0;d<=45;d+=3)maximum=Math.max(maximum,Math.abs(rainRoad(s.course,s.progress+d).curvature));
  return Math.max(3.5,Math.min(RAIN_COURSES[s.course].cruise,Math.sqrt(rainFriction(s)*9.81/Math.max(.008,maximum))*.76));
}
export function rainTimeLimit(s:GripRace){return RAIN_COURSES[s.course].limit+(s.autonomy?70:0);}
export function rainStars(s:GripRace){if(s.phase!=='complete')return 0;if(s.autonomy)return 1+Number(s.autonomy.correct===3)+Number(s.autonomy.correct===3&&s.autonomy.firstCorrect>=2&&s.rescues===0&&s.outsideTime<1.2);const total=s.items.filter(e=>e.kind==='star').length;return 1+Number(s.rescues===0&&s.outsideTime<1.2)+Number(s.starsCollected>=Math.ceil(total*.6)&&s.perfectCorners>=2&&s.rescues===0&&s.outsideTime<1.2);}
export function rainNotify(s:GripRace,title:string,copy:string,tone:RainNotice['tone']='blue'){s.notice={title,copy,tone,until:s.tick*GRIP_RACE_DT+2.1};}
export function rescueGripRace(s:GripRace){
  if(s.phase!=='running')return;s.rescues++;s.damage=Math.min(s.damage,1);s.offset=0;s.targetOffset=0;s.lateralVelocity=0;s.speed=Math.min(s.speed,3);s.combo=0;s.score=Math.max(0,s.score-100);s.braking=false;s.accelerating=false;rainNotify(s,'教练把你带回赛道','-100 分 · 这趟继续，下一弯提前减速。');
}
export function stepGripRace(s:GripRace){
  if(s.phase!=='running'||s.paused)return;
  if(s.autonomy){updateRainAutonomy(s);if(s.autonomy.pending>=0)return;}
  const dt=GRIP_RACE_DT,config=RAIN_COURSES[s.course],road=rainRoad(s.course,s.progress);s.mu=rainFriction(s);
  s.targetOffset=Math.max(-3.1,Math.min(3.1,s.targetOffset+s.steer*3.6*dt));
  const longitudinal=s.autonomy&&(s.autonomy.control==='auto'||s.autonomy.emergency||s.autonomy.events.some(e=>!e.resolved&&e.at-s.progress<40))?s.autonomy.acceleration:s.braking?-Math.min(4.6,s.mu*9.81*.78):Math.max(-.5,Math.min(s.mu*9.81*.78,s.accelerating?3:1.8,((s.accelerating?14:config.cruise)-s.speed)*1.1));
  const before=s.speed;s.speed=Math.max(0,s.speed+longitudinal*dt);const v=(before+s.speed)/2;
  const total=s.mu*9.81,lateralLimit=Math.sqrt(Math.max(0,total*total-longitudinal*longitudinal));
  // Cruise assistance changes lateral position only with the grip left after following the bend.
  const curve=v*v*road.curvature,correctionBudget=Math.max(0,lateralLimit-Math.abs(curve));
  const correction=Math.max(-correctionBudget,Math.min(correctionBudget,(s.targetOffset-s.offset)*4.8-s.lateralVelocity*4.3));
  const requested=curve+correction,actual=Math.max(-lateralLimit,Math.min(lateralLimit,requested));
  s.gripUse=Math.min(2,Math.hypot(requested,longitudinal)/Math.max(.01,total));s.slip=Math.max(0,Math.abs(requested)-lateralLimit);
  s.lateralVelocity+=(actual-curve)*dt;s.offset+=s.lateralVelocity*dt;s.progress+=v/Math.sqrt(1+road.dx*road.dx)*dt;s.tick++;
  if(s.slip>.25)s.slipTime+=dt;
  const outside=Math.abs(s.offset)>ROAD_HALF_WIDTH-1;
  if(outside){s.outsideTime+=dt;s.damage+=dt*.65;s.combo=0;s.speed=Math.max(0,s.speed-.7*dt);}
  if(s.autonomy)for(const e of s.autonomy.events){if(e.kind!=='fog'&&Math.abs(e.at-s.progress)<3&&Math.abs(e.offset-s.offset)<1.65&&!e.passed){e.passed=true;s.damage+=1.5;s.score=Math.max(0,s.score-100);rainNotify(s,'车辆接近占道路障','降低速度，接管后绕开标记区域。','red');}}
  for(const corner of s.corners){if(corner.resolved)continue;if(Math.abs(corner.at-s.progress)<18){corner.worstSlip=Math.max(corner.worstSlip,s.slip);corner.outside ||= outside;}
    if(s.progress>corner.at+18){corner.resolved=true;s.cornersPassed++;if(!corner.outside&&corner.worstSlip<.35){s.perfectCorners++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);const points=160+40*s.combo;s.score+=points;rainNotify(s,`稳稳过弯！ ×${s.combo}`,`+${points} 分 · 平稳控制，抓地力还有余量`,'gold');}else{rainNotify(s,'这一弯有点滑','下一弯先减速，再轻拨方向盘。');s.combo=0;}}}
  for(const item of s.items){if(item.resolved)continue;if(item.kind==='star'&&Math.abs(item.at-s.progress)<2.5&&Math.abs(item.offset-s.offset)<1.05&&!outside){item.resolved=true;item.collected=true;s.starsCollected++;s.score+=50;}else if(s.progress>item.at+(item.kind==='puddle'?9:3)){item.resolved=true;}}
  if(s.tick%6===0){s.trail.push({at:s.progress,offset:s.offset});if(s.trail.length>1300)s.trail.shift();}
  if(s.progress>=config.length){s.phase='complete';s.braking=false;s.accelerating=false;rainNotify(s,'护航到站！',`${s.starsCollected} 颗护航星 · 完美过弯 ${s.perfectCorners} 次`,'gold');}
  else if(s.tick*dt>=rainTimeLimit(s)||s.damage>=3.2||Math.abs(s.offset)>18){s.phase='failed';s.braking=false;s.accelerating=false;rainNotify(s,s.damage>=3.2?'滑出赛道了':'这趟先休息一下','调整速度或轮胎，再来一趟。','red');}
}

export function enableRainAutonomy(s:GripRace,strategy:RainStrategy='balanced'){
 const random=rng(s.seed+117),side=random()<.5?-2.5:2.5,config=RAIN_COURSES[s.course];
 const events:RainDecision[]=[
  {id:0,at:config.length*.22,offset:side,kind:'works',title:`${side>0?'右侧':'左侧'}施工占道`,copy:`感知框已标出施工区，${side>0?'左侧':'右侧'}通道可用。批准哪条路径？`,options:[{action:'left',label:'批准左侧绕行'},{action:'right',label:'批准右侧绕行'},{action:'straight',label:'沿原车道通过'}],answer:side>0?'left':'right',resolved:false,attempts:0,passed:false},
  {id:1,at:config.length*.5,offset:0,kind:'fog',title:'雨雾遮挡，感知可信度不足',copy:'地图仍有道路，但传感器暂时看不清。AI 已减速停车，等待你确认。',options:[{action:'verify',label:'停车复核，再继续'},{action:'map',label:'只按地图继续'},{action:'speed',label:'加速穿过雨雾'}],answer:'verify',resolved:false,attempts:0,passed:false},
  {id:2,at:config.length*.79,offset:-side,kind:'car',title:`${side<0?'右侧':'左侧'}故障车占道`,copy:`融合感知发现静止车辆，${side<0?'左侧':'右侧'}路径没有占道目标。选择领航方案。`,options:[{action:'left',label:'批准左侧绕行'},{action:'right',label:'批准右侧绕行'},{action:'follow',label:'继续跟随故障车'}],answer:side<0?'left':'right',resolved:false,attempts:0,passed:false}
 ];
 for(const e of events){const rotation=Math.floor(random()*3);e.options=e.options.slice(rotation).concat(e.options.slice(0,rotation));}
 s.autonomy={control:'auto',strategy,confidence:.94,targetSpeed:RAIN_STRATEGIES[strategy].speed,acceleration:0,reason:'融合路面与弯道信息，准备自动领航',detected:[],path:[],events,pending:-1,correct:0,firstCorrect:0,mistakes:0,avoided:0,takeovers:0,emergency:false,emergencyStops:0,wasEmergency:false,feedback:'',log:[]};
 s.notice={title:'AI 已接管方向与速度',copy:'你负责选择策略、批准绕行、处理低可信度事件。',tone:'blue',until:4};updateRainAutonomy(s);
}
export function answerRainDecision(s:GripRace,action:string){
 const ai=s.autonomy;if(!ai||s.phase!=='running'||s.paused||ai.pending<0)return false;const e=ai.events[ai.pending],correct=action===e.answer;e.attempts++;ai.log.push({event:e.title,action,correct,progress:s.progress});
 if(!correct){ai.mistakes++;ai.feedback=e.kind==='fog'?'地图不能替代当前感知。保持停车，先复核再继续。':'该路径会进入占道区域。安全检查已拒绝执行，请重新选择。';s.score=Math.max(0,s.score-40);return false;}
 e.resolved=true;ai.correct++;if(e.attempts===1)ai.firstCorrect++;s.score+=e.attempts===1?150:90;ai.pending=-1;ai.feedback='';rainNotify(s,e.kind==='fog'?'复核完成，感知恢复':'路径已批准，AI 开始绕行',e.kind==='fog'?'降低速度穿过雾区，保留抓地余量。':'规划轨迹与方向控制同步更新。','gold');return true;
}
export function setRainControl(s:GripRace,control:'auto'|'manual'){const ai=s.autonomy;if(!ai||ai.control===control)return;ai.control=control;s.steer=0;s.braking=false;s.accelerating=false;if(control==='manual')ai.takeovers++;rainNotify(s,control==='manual'?'你已接管车辆':'AI 恢复领航',control==='manual'?'A/D 控制方向，空格减速；随时交回 AI。':'自动规划方向和速度，紧急制动仍由你控制。');}
function plannedOffset(s:GripRace,at:number){
 const ai=s.autonomy!;let best=0,cost=Infinity;
 for(const offset of [-2.6,0,2.6]){let value=Math.abs(offset-s.offset)*.35+Math.abs(offset)*.08;
  for(const e of ai.events)if(e.kind!=='fog'&&(Math.abs(e.at-at)<25||Math.abs(e.at-s.progress)<12)){if(Math.abs(e.offset-offset)<1.85)value+=100;if(e.resolved)value+=Math.abs(offset-(e.answer==='left'?-2.6:2.6))*8;}
  for(const e of s.items){if(e.kind==='puddle'&&Math.abs(e.at-at)<15&&Math.abs(e.offset-offset)<1.85)value+=12;if(e.kind==='star'&&!e.resolved&&Math.abs(e.at-at)<12)value+=Math.abs(e.offset-offset)*(ai.strategy==='mission'?1.3:.1);}
  if(value<cost){cost=value;best=offset;}}
 return best;
}
function updateRainAutonomy(s:GripRace){
 const ai=s.autonomy!,fog=ai.events.find(e=>e.kind==='fog'&&Math.abs(e.at-s.progress)<45),range=fog&&!fog.resolved?28:70;
 ai.confidence=fog&&!fog.resolved?.46:fog?.78:.94;
 ai.detected=[...s.items.filter(e=>e.kind==='puddle'&&e.at-s.progress>-8&&e.at-s.progress<range).map(e=>({at:e.at,offset:e.offset,kind:'puddle' as const,name:'积水区域',confidence:ai.confidence})),...ai.events.filter(e=>e.at-s.progress>-12&&e.at-s.progress<range).map(e=>({at:e.at,offset:e.offset,kind:e.kind,name:e.kind==='works'?'施工区':e.kind==='car'?'静止车辆':'雨雾区',confidence:e.kind==='fog'&&!e.resolved?.46:ai.confidence}))];
 ai.path=[];for(let d=0;d<=55;d+=5){const target=plannedOffset(s,s.progress+d+12),mix=Math.min(1,d/22);ai.path.push({at:s.progress+d,offset:s.offset+(target-s.offset)*mix});}
 for(const e of ai.events)if(!e.passed&&e.at-s.progress<-12){e.passed=true;if(e.kind!=='fog')ai.avoided++;}
 if(ai.pending>=0){ai.targetSpeed=0;ai.acceleration=0;s.braking=true;ai.reason='已停车，等待你的领航决策';return;}
 const gate=ai.events.find(e=>!e.resolved&&e.at-s.progress<40);
 let target=Math.min(RAIN_STRATEGIES[ai.strategy].speed,rainAdvice(s)-.35),offset=plannedOffset(s,s.progress+24);
 const upcoming=ai.detected.some(e=>e.kind!=='fog'&&e.at-s.progress<40);if(upcoming)target=Math.min(target,4.3);if(Math.abs(offset-s.offset)>.9)target=Math.min(target,4.1);
 ai.reason=upcoming?'识别占道与积水，生成绕行路径':target<RAIN_STRATEGIES[ai.strategy].speed-.2?'根据弯道和抓地上限提前减速':'车道保持中，按所选策略前进';
 if(fog)target=Math.min(target,4);
 if(gate){target=0;ai.reason=gate.kind==='fog'?'可信度下降，先停车请求复核':'发现需要确认的绕行，减速等待批准';if(s.speed<.12){ai.pending=gate.id;s.speed=0;ai.feedback='';s.braking=true;ai.targetSpeed=0;ai.acceleration=0;return;}}
 if(ai.emergency){target=0;ai.reason='人工紧急制动，AI 暂停前进';if(!ai.wasEmergency)ai.emergencyStops++;}ai.wasEmergency=ai.emergency;
 ai.targetSpeed=Math.max(0,target);const limit=rainFriction(s)*9.81;
 ai.acceleration=Math.max(-limit*(gate||ai.emergency?.72:.4),Math.min(1.3,limit*.4,(ai.targetSpeed-s.speed)*1.5));
 if(ai.control==='auto'||gate||ai.emergency){s.targetOffset=offset;s.steer=0;s.braking=ai.acceleration<-.05;s.accelerating=false;}
}
