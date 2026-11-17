export type Action = 'go' | 'slow' | 'wait' | 'yield' | 'detour' | 'stop';
export type Category = 'clear' | 'signal' | 'school' | 'pedestrian' | 'fog' | 'rain' | 'night' | 'cyclist' | 'construction' | 'parked' | 'emergency' | 'blocked';
export type District = 'a' | 'b' | 'c' | 'd';
export interface Features {
  signal:'green'|'red'|'yellow'; pedestrian:'none'|'crossing'; visibility:'clear'|'limited';
  road:'normal'|'school'|'wet'|'curve'; hazard:'none'|'works'|'parked'|'blocked';
  lane:'open'|'closed'; priority:'none'|'cyclist'|'emergency';
}
export type Feature = keyof Features;
export interface Example { id:string; category:Category; title:string; features:Features; expected:Action; explanation:string }
export interface Sample extends Example { action:Action }
export interface DecisionNode { feature?:Feature; branches?:Record<string,DecisionNode>; action:Action; counts:Record<Action,number>; size:number }
export interface Prediction { action:Action; path:string[]; unfamiliar:string[] }
export const ACTIONS:Action[] = ['go','slow','wait','yield','detour','stop'];
export const ACTION_TEXT:Record<Action,string> = {go:'走',slow:'慢',wait:'等',yield:'让',detour:'绕',stop:'停'};
export const ACTION_DESCRIPTION:Record<Action,string> = {go:'正常前进',slow:'慢行观察',wait:'原地等待',yield:'礼让通行',detour:'借道绕行',stop:'安全停车'};
export const FEATURE_NAMES:Record<Feature,string> = {pedestrian:'行人',signal:'信号灯',visibility:'视线',road:'道路类型',hazard:'道路障碍',lane:'相邻车道',priority:'优先通行者'};
export const VALUE_NAMES:Record<string,string> = {none:'无',crossing:'行人横穿',green:'绿灯',red:'红灯',yellow:'黄灯（可安全停车）',clear:'清晰',limited:'受限',normal:'普通路段',school:'校园路段',wet:'湿滑路面',curve:'弯道路段',works:'前方施工',parked:'停放车辆占道',blocked:'道路封闭',open:'可安全借道',closed:'不可借道',cyclist:'骑行者汇入',emergency:'急救车接近'};
export const CATEGORIES:{id:Category;title:string;icon:string}[] = [
  {id:'clear',title:'畅通路口',icon:'🟢'},{id:'signal',title:'信号灯',icon:'🚦'},
  {id:'school',title:'校园慢行',icon:'🏫'},{id:'pedestrian',title:'行人横穿',icon:'🚶'},
  {id:'fog',title:'雨雾视线',icon:'🌫️'},{id:'rain',title:'湿滑路面',icon:'🌧️'},
  {id:'night',title:'夜间弯道',icon:'🌙'},{id:'cyclist',title:'骑行者汇入',icon:'🚲'},
  {id:'construction',title:'施工绕行',icon:'🚧'},{id:'parked',title:'车辆占道',icon:'🚙'},
  {id:'emergency',title:'急救车礼让',icon:'🚑'},{id:'blocked',title:'道路封闭',icon:'⛔'}
];
export const DISTRICTS:{id:District;title:string;description:string}[] = [
  {id:'a',title:'A · 城市街区',description:'路口、学校与行人'},
  {id:'b',title:'B · 天气山路',description:'雨雾、夜间与弯道'},
  {id:'c',title:'C · 施工街区',description:'绕行、占道与封路'},
  {id:'d',title:'D · 综合挑战',description:'多条线索同时出现'}
];
export const BASE:Features = {signal:'green',pedestrian:'none',visibility:'clear',road:'normal',hazard:'none',lane:'closed',priority:'none'};
const FEATURES = Object.keys(FEATURE_NAMES) as Feature[];
const VALUES: {[K in Feature]: readonly Features[K][]} = {
  signal:['green','red','yellow'],pedestrian:['none','crossing'],visibility:['clear','limited'],
  road:['normal','school','wet','curve'],hazard:['none','works','parked','blocked'],lane:['open','closed'],priority:['none','cyclist','emergency']
};
// All scenes and the safety coach use the same explicit, simplified teaching rules.
export function teachingAction(f:Features):Action {
  if(f.signal!=='green'||f.pedestrian==='crossing') return 'wait';
  if(f.hazard==='blocked'||(f.hazard!=='none'&&f.lane==='closed')) return 'stop';
  if(f.priority!=='none') return 'yield';
  if(f.hazard!=='none') return 'detour';
  if(f.road!=='normal'||f.visibility==='limited') return 'slow';
  return 'go';
}
export function teachingExplanation(f:Features):string {
  if(f.signal!=='green') return f.signal==='yellow'?'本情境可安全停下，应在停止线前等待，不抢黄灯。':'红灯时在停止线前等待。';
  if(f.pedestrian==='crossing') return '先等横穿行人离开通行区域，再继续前进。';
  if(teachingAction(f)==='stop') return '道路被封闭或没有安全绕行通道，提前停在障碍前，等待重新规划路线。';
  if(f.priority!=='none') return f.priority==='emergency'?'在确保安全的前提下避让急救车，给它留出通道。':'先礼让正在汇入的骑行者，留出安全距离。';
  if(f.hazard!=='none') return '本情境已确认相邻车道允许借道、没有来车；慢速绕过障碍，再回到原车道。';
  if(teachingAction(f)==='slow') return '校园、雨雾、湿滑或弯道路况需要降低速度并观察。';
  return '绿灯、视线清晰且道路畅通，可以正常前进。';
}
const example = (id:string,category:Category,title:string,changes:Partial<Features>={}):Example => {
  const features={...BASE,...changes};return {id,category,title,features,expected:teachingAction(features),explanation:teachingExplanation(features)};
};
export const EXAMPLES:Example[] = [
  example('demo-clear-0','clear','阳光街的绿灯'),example('demo-clear-1','clear','公园口的绿灯'),example('demo-clear-2','clear','钱江新城畅通路口'),
  example('demo-signal-0','signal','图书馆前的红灯',{signal:'red'}),example('demo-signal-1','signal','校园口的红灯',{signal:'red',road:'school'}),example('demo-signal-2','signal','可以安全停车的黄灯',{signal:'yellow'}),
  example('demo-school-0','school','新芽学校门口',{road:'school'}),example('demo-school-1','school','雾里的普通路口',{visibility:'limited'}),example('demo-school-2','school','放学时的校门',{road:'school'}),
  example('demo-pedestrian-0','pedestrian','过街的小朋友',{pedestrian:'crossing'}),example('demo-pedestrian-1','pedestrian','学校门前过街',{pedestrian:'crossing',road:'school'}),example('demo-pedestrian-2','pedestrian','白马湖广场过街',{pedestrian:'crossing'}),
  example('demo-fog-0','fog','钱塘江边的团雾',{visibility:'limited'}),example('demo-fog-1','fog','雨雾里的校门',{visibility:'limited',road:'school'}),example('demo-fog-2','fog','雾中横穿行人',{visibility:'limited',pedestrian:'crossing'}),
  example('demo-rain-0','rain','雨后的湿滑路面',{road:'wet'}),example('demo-rain-1','rain','暴雨后的弯道',{road:'wet',visibility:'limited'}),example('demo-rain-2','rain','雨中红灯',{road:'wet',signal:'red'}),
  example('demo-night-0','night','夜间视线受限',{visibility:'limited'}),example('demo-night-1','night','西湖边的弯道',{road:'curve'}),example('demo-night-2','night','夜间连续弯道',{road:'curve',visibility:'limited'}),
  example('demo-cyclist-0','cyclist','自行车从右侧汇入',{priority:'cyclist'}),example('demo-cyclist-1','cyclist','校园口骑行者汇入',{priority:'cyclist',road:'school'}),example('demo-cyclist-2','cyclist','雨中骑行者汇入',{priority:'cyclist',road:'wet'}),
  example('demo-construction-0','construction','施工区旁可安全借道',{hazard:'works',lane:'open'}),example('demo-construction-1','construction','施工区旁禁止借道',{hazard:'works'}),example('demo-construction-2','construction','施工路口遇到红灯',{hazard:'works',lane:'open',signal:'red'}),
  example('demo-parked-0','parked','货车占道，旁边车道畅通',{hazard:'parked',lane:'open'}),example('demo-parked-1','parked','停放汽车挡住单行道',{hazard:'parked'}),example('demo-parked-2','parked','占道汽车旁有人过街',{hazard:'parked',lane:'open',pedestrian:'crossing'}),
  example('demo-emergency-0','emergency','后方急救车接近',{priority:'emergency'}),example('demo-emergency-1','emergency','湿滑路面礼让急救车',{priority:'emergency',road:'wet'}),example('demo-emergency-2','emergency','红灯时急救车接近',{priority:'emergency',signal:'red'}),
  example('demo-blocked-0','blocked','前方道路完全封闭',{hazard:'blocked'}),example('demo-blocked-1','blocked','弯道后的封路围挡',{hazard:'blocked',road:'curve'}),example('demo-blocked-2','blocked','雾中封闭路段',{hazard:'blocked',visibility:'limited'})
];
export const TESTS:Example[] = [
  example('a-0','clear','薄荷公园'),example('a-1','pedestrian','面包店斑马线',{pedestrian:'crossing'}),example('a-2','school','青禾学校',{road:'school'}),example('a-3','signal','校园红灯',{signal:'red',road:'school'}),example('a-4','signal','新路口黄灯',{signal:'yellow'}),example('a-5','cyclist','桥边骑行者汇入',{priority:'cyclist'}),
  example('b-0','fog','雾里的小街',{visibility:'limited'}),example('b-1','pedestrian','雾中行人',{pedestrian:'crossing',visibility:'limited'}),example('b-2','signal','雾中红灯',{signal:'red',visibility:'limited'}),example('b-3','school','雾里的校门',{road:'school',visibility:'limited'}),example('b-4','rain','雨后湿滑街道',{road:'wet'}),example('b-5','night','夜里的湖畔弯道',{road:'curve',visibility:'limited'}),
  example('c-0','construction','施工区安全绕行',{hazard:'works',lane:'open'}),example('c-1','construction','施工区无法借道',{hazard:'works'}),example('c-2','parked','配送车占道',{hazard:'parked',lane:'open'}),example('c-3','parked','占道车旁行人过街',{hazard:'parked',lane:'open',pedestrian:'crossing'}),example('c-4','blocked','桥梁维修封路',{hazard:'blocked'}),example('c-5','emergency','急救车通道',{priority:'emergency'}),
  example('d-0','emergency','雨中急救车接近',{priority:'emergency',road:'wet',visibility:'limited'}),example('d-1','construction','骑行者经过施工借道口',{hazard:'works',lane:'open',priority:'cyclist'}),example('d-2','parked','绕行前先等行人',{hazard:'parked',lane:'open',pedestrian:'crossing',visibility:'limited'}),example('d-3','signal','急救车接近时的红灯',{priority:'emergency',signal:'red'}),example('d-4','blocked','雨夜封闭道路',{hazard:'blocked',road:'wet',visibility:'limited'}),example('d-5','construction','施工完成后可借道',{hazard:'works',lane:'open',road:'curve'})
];
export const districtTests = (id:District) => TESTS.filter(e=>e.id.startsWith(id+'-'));
function countActions(samples:Sample[]):Record<Action,number> {
  const counts=Object.fromEntries(ACTIONS.map(a=>[a,0])) as Record<Action,number>;
  for(const sample of samples) counts[sample.action]++;return counts;
}
function entropy(samples:Sample[]) {const counts=countActions(samples);return ACTIONS.reduce((h,a)=>{const p=counts[a]/samples.length;return p>0?h-p*Math.log2(p):h;},0);}
export function buildTree(samples:Sample[],features:Feature[]=FEATURES):DecisionNode {
  const counts=countActions(samples),priority:Action[]=['stop','wait','yield','slow','detour','go'];
  const action=priority.reduce((best,next)=>counts[next]>counts[best]?next:best,'wait' as Action);
  const node:DecisionNode={action,counts,size:samples.length};
  if(!samples.length||ACTIONS.filter(a=>counts[a]>0).length===1||!features.length) return node;
  let selected:Feature|undefined,gain=0,selectedGroups:Record<string,Sample[]>={};
  for(const feature of features) {
    const groups:Record<string,Sample[]>={};for(const sample of samples) (groups[sample.features[feature]]??=[]).push(sample);
    const nextGain=entropy(samples)-Object.values(groups).reduce((sum,g)=>sum+g.length/samples.length*entropy(g),0);
    if(nextGain>gain+1e-9) {gain=nextGain;selected=feature;selectedGroups=groups;}
  }
  if(!selected) return node;node.feature=selected;node.branches={};
  for(const [value,group] of Object.entries(selectedGroups)) node.branches[value]=buildTree(group,features.filter(f=>f!==selected));
  return node;
}
export function predict(tree:DecisionNode,features:Features,samples:Sample[]):Prediction {
  const path:string[]=[],unfamiliar:string[]=[];let node=tree;
  for(const feature of FEATURES) if(!samples.some(s=>s.features[feature]===features[feature])) unfamiliar.push(`${FEATURE_NAMES[feature]}：${VALUE_NAMES[features[feature]]}`);
  while(node.feature&&node.branches) {
    const feature=node.feature,value=features[feature];path.push(`${FEATURE_NAMES[feature]}＝${VALUE_NAMES[value]}`);
    if(!node.branches[value]) {path.push('这个分支还没有示范，采用已有示范中的多数动作');break;}
    node=node.branches[value];
  }
  path.push(`已学示范支持“${ACTION_TEXT[node.action]}”`);return {action:node.action,path,unfamiliar};
}
export function normalizeFeatures(value:unknown):Features|null {
  if(!value||typeof value!=='object') return null;
  const original=value as Partial<Features>,features={...BASE,...original};
  if(!['signal','pedestrian','visibility','road'].every(key=>key in original)) return null;
  if(!FEATURES.every(key=>(VALUES[key] as readonly unknown[]).includes(features[key]))) return null;
  return features;
}
export function sanitizeSamples(value:unknown):Sample[] {
  if(!Array.isArray(value)) return [];const samples=new Map<string,Sample>();
  for(const item of value) {
    if(!item||typeof item!=='object') continue;const s=item as Sample,features=normalizeFeatures(s.features);
    if(!features||typeof s.id!=='string'||typeof s.title!=='string'||!CATEGORIES.some(c=>c.id===s.category)||!ACTIONS.includes(s.action)) continue;
    samples.set(s.id,{id:s.id,category:s.category,title:s.title,features,action:s.action,expected:teachingAction(features),explanation:teachingExplanation(features)});
  }
  return [...samples.values()].slice(-96);
}
export function needsCoach(expected:Action,predicted:Action):boolean {
  if(expected===predicted) return false;
  if(expected==='stop') return predicted!=='wait';
  if(expected==='wait') return predicted!=='stop';
  if(expected==='yield') return !['wait','stop'].includes(predicted);
  if(expected==='slow') return ['go','detour','yield'].includes(predicted);
  if(expected==='detour') return ['go','slow','yield'].includes(predicted);
  return ['detour','yield'].includes(predicted);
}
export function featureSentence(f:Features):string {
  const parts=[VALUE_NAMES[f.signal],f.pedestrian==='crossing'?'行人横穿':'无横穿行人',VALUE_NAMES[f.road],`视线${VALUE_NAMES[f.visibility]}`];
  if(f.hazard!=='none') parts.push(VALUE_NAMES[f.hazard],VALUE_NAMES[f.lane]);
  if(f.priority!=='none') parts.push(VALUE_NAMES[f.priority]);return parts.join(' · ');
}
export function actionPose(action:Action,elapsed:number) {
  const t=Math.max(0,elapsed),approach=155+340*Math.min(1,t/1.7);
  if(action==='stop'||action==='wait') return {x:approach,y:235,moving:t<1.7};
  if(action==='yield') return {x:approach,y:235+67*Math.min(1,Math.max(0,t-.6)/1.1),moving:t<1.7};
  if(action==='detour') {
    const x=155+Math.min(750,t*155);
    const lane=Math.min(1,Math.max(0,(x-375)/125))*Math.min(1,Math.max(0,(895-x)/125));
    return {x,y:235+72*lane,moving:x<905};
  }
  return {x:155+Math.min(750,t*(action==='slow'?128:206)),y:235,moving:t* (action==='slow'?128:206)<750};
}
