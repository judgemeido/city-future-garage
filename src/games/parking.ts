import { createStage, escapeHTML } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import { mountLabMedia } from './lab-media';
import { PARKING_LEVELS } from './parking-levels';
import { createRun, advanceRun, continueRun, simulate, parkingQuality, starsFor, frameOf, nearestContact, integrateBicycle, normalize, clamp, RULE_VERSION, SCALE, MAX_SEGMENTS, MAX_STEER, type Command, type Frame, type Pose, type ParkingRun } from './parking-model';
import { commandStart, commandEnd, commandMid, dragCommand } from './parking-planner';
import { measureEcho, compareEcho, type Echo, type Evidence } from './parking-science';
import { drawParking } from './parking-view';
import './lab.css';
import './parking.css';

interface Attempt { id:string; levelId:string; success:boolean; assisted:boolean; stars:number; distance:number; shifts:number; corrections:number; offset:number; heading:number; contact:string; trace:Frame[]; batches:{start:Pose;commands:Command[]}[] }
interface ParkingSave { version:number; best:Record<string,number>; attempts:Attempt[]; evidence:Evidence[] }
const scienceNames=['声波探尺','车身足迹','动作放大镜'];
const stars=(n:number)=>'★'.repeat(n)+'☆'.repeat(3-n);
const degrees=(n:number)=>n*180/Math.PI;
export function mountParking(host:HTMLElement,api:GameAPI):MountedGame {
  const raw=api.getRecord('parking').parkingV2 as ParkingSave|undefined;
  const saved:ParkingSave=raw?.version===RULE_VERSION?{version:RULE_VERSION,best:raw.best||{},attempts:(raw.attempts||[]).slice(-6),evidence:(raw.evidence||[]).slice(-12)}:{version:RULE_VERSION,best:{},attempts:[],evidence:[]};
  let theme=0,tight=false,level=PARKING_LEVELS[0],commands:Command[]=[],selected=-1,start={...level.start},preview=simulate(start,[]),run:ParkingRun|null=null;
  let phase:'planning'|'running'|'paused'|'result'='planning',correction=false,assisted=false,round='',batches:Attempt['batches']=[],science=0,footprint=false,compare=false,showHistory=false;
  let echo:Echo|null=null,echoes:Echo[]=[],echoAge=0,observation=1000,follow=false,pendingEvidence:Evidence|null=null,drag:null|{kind:'end'|'bend';before:Command;index:number}=null,tap:'end'|'bend'|null=null;
  let lastTick=0,lastScience='',hintOpen=false,dirty=false,disposed=false;
  host.innerHTML=`<div class="lab parking" style="--lab-color:#56efe0">
    <div class="parking-missions"><div class="lab-scenes" role="group" aria-label="选择泊车任务">${['商场倒库','街边侧方','窄位挪车'].map((s,i)=>`<button data-scene="${i}">${i+1} · ${s} <small data-best="${i}"></small></button>`).join('')}</div><div class="parking-mode" role="group" aria-label="场地难度"><button data-mode="standard">标准</button><button data-mode="tight">挑战</button></div></div>
    <div class="parking-brief"><div><span class="parking-kicker">PARKING NAVIGATOR / 科普闯关</span><p data-goal></p></div><span data-target class="parking-target"></span></div>
    <section class="parking-console"><div class="parking-flow"><span><b>01</b> 测距离 <strong data-flow-echo>等待测量</strong></span><span><b>02</b> 算走法 <strong data-flow-plan>先添加一段</strong></span><span><b>03</b> 控车轮 <strong data-flow-control>等待指令</strong></span></div>
    <div class="parking-board"><div class="parking-play"><div class="parking-stage-tools"><span data-context>拖出你的第一条路线</span><button class="btn btn-small" data-zoom>放大场地</button></div><div class="parking-viewport"><div class="lab-stage"></div></div><div class="parking-replay"><label for="parking-observation" data-observation-label>预演位置</label><input id="parking-observation" data-observation type="range" min="0" max="1000" value="1000" aria-label="拖动观察车的位置"><output data-observation-value>终点</output><label><input type="checkbox" data-history>上次路线</label></div></div>
    <aside class="parking-science"><div class="parking-science-tabs" role="group" aria-label="科普工具">${scienceNames.map((s,i)=>`<button data-science="${i}">${s}</button>`).join('')}</div><div data-science-content></div><div class="parking-discovery" data-discovery>先猜一猜，再用工具验证。</div><button class="btn btn-small" data-evidence disabled>保存这条发现</button><div data-stamps class="parking-stamps"></div></aside></div>
    <div class="parking-editor"><div class="parking-segments" data-segments></div><div class="parking-edit-actions"><button class="btn btn-small" data-add="1">＋ 前进一段</button><button class="btn btn-small" data-add="-1">＋ 倒车一段</button><button class="btn btn-small" data-remove>删除选中段</button><span data-segment-limit>最多6段 · 提交前随意调整</span></div>
    <div class="parking-tuning" data-tuning><label>本段方向<select data-gear-input aria-label="本段行驶方向"><option value="1">前进</option><option value="-1">倒车</option></select></label><label class="parking-range">走多远<input data-length type="range" min="12" max="600" step="1" aria-label="本段距离"><input data-length-number type="number" min="0.6" max="30" step="0.05" aria-label="本段距离米"><span>m</span></label><label class="parking-range">车轮转角<input data-steer type="range" min="-37.242" max="37.242" step="0.1" aria-label="本段车轮转角"><input data-steer-number type="number" min="-37.24" max="37.24" step="0.1" aria-label="本段转角度"><span>°</span></label><button class="btn btn-small" data-straight>车轮回正</button><div class="parking-point-buttons"><button class="btn btn-small" data-point="end">选停止点</button><button class="btn btn-small" data-point="bend">选拖弯点</button></div></div></div>
    <div class="lab-toolbar"><button class="btn btn-primary" data-execute>执行泊车 ▶</button><button class="btn" data-retry>修改原方案</button><button class="btn" data-correct>从这里补一段</button><button class="btn btn-small" data-reset>空方案重开</button><button class="btn btn-small" data-hint>一点提示</button><button class="btn btn-small" data-save>保存作品</button><span data-stats class="parking-stats">本轮尚未出发</span></div><p class="lab-status" data-status aria-live="polite"></p><div class="parking-result" data-result hidden></div></section>
    <div class="parking-extras"><details><summary>看真实泊车 · 实物与知识</summary><div class="parking-reading"><aside class="lab-photo" data-lab-media></aside><div><h3>测距 → 规划 → 执行</h3><p>超声传感器发出脉冲并接收回波。计算机根据周围空间、车身与转向能力计算动作，再由转向机构执行。这一关由你提出路线。</p><p>距离＝声速 × 往返时间 ÷ 2。教学模型固定空气条件，声速取343 m/s；波纹为慢放示意，数值为模拟值。</p><p>路线是后轴中心走过的线，透明范围是整辆车扫过的空间。小车不能任意横移，换向前会停下。</p><p>采用低速平地、前轮转向模型。俯视图是教学观察视角；没有回波不代表一定安全。真实车辆的功能范围依车型而异。</p><p><a href="https://www.bosch-mobility.com/en/solutions/sensors/ultrasonic-sensor/" target="_blank" rel="noopener">Bosch · 超声测距</a> · <a href="https://www.ti.com/document-viewer/lit/html/SLAA907" target="_blank" rel="noopener">TI · 回波原理</a> · <a href="https://ww2.mathworks.cn/help/nav/ref/bicyclekinematics.html" target="_blank" rel="noopener">MathWorks · 转向模型</a></p></div></div></details><details><summary>星级规则与分步演示</summary><p>★ 无碰撞完整入位且对齐；★★ 中心进入小框，朝向偏差不超过5°；★★★ 满足本关换向与里程目标，执行后没有补救。规划阶段修改、测距和查看车身都不扣分。</p><p>完成演示会记录体验，但不获得自主挑战星级。空方案重开后可重新独立挑战。</p><button class="btn" data-demo>载入完整演示方案</button><p>积分：亲手操作10分，三个主题各20分，保存真实比较发现20分，保存作品10分。科普印章表示完成观察；猜错可以再试。</p></details></div></div>`;
  const q=<T extends HTMLElement=HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  // Keep editing controls beside the playfield; science stays a visible experiment strip below it.
  q('.parking-board').append(q('.parking-editor'));
  q('.parking-console').insertBefore(q('.lab-toolbar'),q('.parking-board'));
  const media=mountLabMedia(host,'parking');
  function action(){dirty=true;api.award('parking','core-action',10,'亲手规划');}
  function status(message:string){q('[data-status]').textContent=message;}
  function observeFrames(){return phase==='planning'?preview.trace:run?.trace||preview.trace;}
  function observed():Frame {if(follow&&run)return frameOf(run);const frames=observeFrames();return frames[Math.round((frames.length-1)*observation/1000)]||{...start,s:0,gear:1,steer:0,segment:0};}
  function evidence(kind:Evidence['kind'],text:string,detail:string,sample:unknown){pendingEvidence={kind,levelId:level.id,text,detail,sample,date:new Date().toISOString()};q('[data-discovery]').textContent=text+' '+detail;q<HTMLButtonElement>('[data-evidence]').disabled=false;}
  function clearEvidence(){pendingEvidence=null;q<HTMLButtonElement>('[data-evidence]').disabled=true;q('[data-discovery]').textContent='先猜一猜，再用工具验证。';}
  function report(a?:Attempt){
    const item=a||(phase==='result'?saved.attempts.find(x=>x.id===round):undefined),findings=saved.evidence.filter(e=>e.levelId===(item?.levelId||level.id));
    const changed=item?`${item.assisted?'演示体验':'自主规划'} · ${item.batches.reduce((s,b)=>s+b.commands.length,0)}段动作，${item.corrections}次补救`:`正在规划${level.name}，已添加${commands.length}段`;
    const outcome=item?item.success?`完整入位；中心偏差 ${(item.offset/SCALE).toFixed(2)} m，方向偏差 ${degrees(item.heading).toFixed(1)}°`:`尚未入位；${item.contact||'计划已走完，仍需调整'}`:'进行中，尚未完整入位';
    api.record('parking',{parkingV2:saved,summary:`${changed}。${outcome}。`,report:[media.evidence(),{label:'我改了什么',value:changed},{label:'出现了什么变化',value:outcome},{label:'我懂了什么',value:findings.length?findings.map(f=>f.text+' '+f.detail).join(' '):'尚未保存科学发现，可回到工具中验证。'},{label:'本次场地 / 状态',value:item?`${PARKING_LEVELS.find(l=>l.id===item.levelId)?.name} · ${item.levelId.endsWith('tight')?'挑战':'标准'} · ${item.assisted?'辅助演示':item.success?'完成':'待重试'}`:`${level.name} · 进行中`},{label:'新版最佳星级',value:PARKING_LEVELS.map(l=>`${l.name}${l.challenge?'挑战':'标准'} ${stars(saved.best[l.id]||0)}`).join(' / ')},{label:'实际换向 / 行程',value:item?`${item.shifts}次 / ${(item.distance/SCALE).toFixed(1)} m（教学比例）`:'尚未执行'},{label:'模型说明',value:'低速前轮转向教学模型；测距为理想化模拟，波纹慢放。'}]});
  }
  function recompute(){preview=simulate(start,commands);echo=null;compare=false;lastScience='';syncEditor();sync();}
  function reset(keep=false){phase='planning';correction=false;run=null;round='';batches=[];start={...level.start};follow=false;observation=1000;echo=null;echoes=[];compare=false;tap=null;drag=null;clearEvidence();q('[data-flow-echo]').textContent='等待测量';if(!keep){commands=[];selected=-1;assisted=false;}selected=Math.min(selected,commands.length-1);q('[data-result]').hidden=true;recompute();renderScience();status(assisted?'演示方案已载入：点击执行，观察每段动作。演示不计自主星级。':keep?'保留原方案。试着只改一处，再执行比较。':'先点“＋前进一段”或“＋倒车一段”，拖动停止点和拖弯点，再执行。');}
  function chooseLevel(){level=PARKING_LEVELS[theme*2+(tight?1:0)];science=theme;footprint=theme===1;media.scene(theme);reset();renderScience();}
  function syncEditor(){
    q('[data-segments]').innerHTML=commands.length?commands.map((c,i)=>`<button class="parking-segment ${i===selected?'active':''}" data-segment="${i}"><span>${String(i+1).padStart(2,'0')}</span> ${c.gear===1?'前进 →':'倒车 ←'} <small>${(c.distance/SCALE).toFixed(1)}m · ${c.steer===0?'直行':(c.steer>0?'右':'左')+Math.abs(degrees(c.steer)).toFixed(0)+'°'}</small></button>`).join(''):'<span class="parking-empty">你的路线还没有开始。先添加一段，再拖出弧线。</span>';
    host.querySelectorAll<HTMLButtonElement>('[data-segment]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.segment);tap=null;syncEditor();sync();});
    const c=commands[selected];q('[data-tuning]').hidden=!c;
    if(c){q<HTMLSelectElement>('[data-gear-input]').value=String(c.gear);q<HTMLInputElement>('[data-length]').value=String(c.distance);q<HTMLInputElement>('[data-length-number]').value=(c.distance/SCALE).toFixed(2);q<HTMLInputElement>('[data-steer]').value=String(degrees(c.steer));q<HTMLInputElement>('[data-steer-number]').value=degrees(c.steer).toFixed(2);}
  }
  function sync(){
    const editing=phase==='planning';host.dataset.phase=phase;host.dataset.levelId=level.id;host.dataset.running=String(phase==='running');host.dataset.finished=String(phase==='result');host.dataset.distance=(run?.distance||0).toFixed(2);host.dataset.segmentCount=String(commands.length);host.dataset.assisted=String(assisted);host.dataset.stars=String(run?starsFor(run,level):0);host.dataset.collisions=String(run?.status==='collision'?1:0);host.dataset.commandPlan=JSON.stringify(commands);
    host.querySelectorAll<HTMLElement>('[data-scene]').forEach(b=>b.classList.toggle('active',Number(b.dataset.scene)===theme));host.querySelectorAll<HTMLElement>('[data-mode]').forEach(b=>b.classList.toggle('active',(b.dataset.mode==='tight')===tight));
    host.querySelectorAll<HTMLElement>('[data-best]').forEach(b=>b.textContent=stars(saved.best[PARKING_LEVELS[Number(b.dataset.best)*2+(tight?1:0)].id]||0));
    q('[data-goal]').textContent=level.question;q('[data-target]').textContent=`三星目标：精停 · 换向≤${level.maxShifts}次 · 行程≤${(level.maxDistance/SCALE).toFixed(1)}m · 无补救`;
    q('[data-context]').textContent=assisted?'辅助演示 · 不计自主星级':correction?'从实际位置补救':phase==='running'?'自动执行中 · 随时可暂停':phase==='result'?'本轮轨迹已记录':'规划阶段 · 拖停止点，调转弯';
    q('[data-flow-plan]').textContent=commands.length?`${commands.length} 段 · ${(preview.distance/SCALE).toFixed(1)}m`:'先添加一段';
    const p=observed();q('[data-flow-control]').textContent=phase==='running'?`第${Math.min((run?.segment||0)+1,commands.length)}段 ${run?.gear===1?'前进':'倒车'} ${degrees(run?.steer||0).toFixed(0)}°`:'已暂停 / 可观察';
    q('[data-stats]').textContent=run?`已走 ${(run.distance/SCALE).toFixed(1)}m · 换向 ${run.shifts}次 · 补救 ${run.corrections}次`:'本轮尚未出发';
    q<HTMLButtonElement>('[data-execute]').disabled=(editing&&!commands.length)||phase==='result';q('[data-execute]').textContent=phase==='running'?'暂停执行 Ⅱ':phase==='paused'?'继续执行 ▶':correction?'执行补救 ▶':'执行泊车 ▶';
    q<HTMLButtonElement>('[data-correct]').disabled=!run||run.status==='collision'||phase==='running'||editing||parkingQuality(run.pose,level).parked;
    q<HTMLButtonElement>('[data-retry]').disabled=!run;
    host.querySelectorAll<HTMLButtonElement>('[data-add]').forEach(b=>b.disabled=!editing||commands.length>=MAX_SEGMENTS);q<HTMLButtonElement>('[data-remove]').disabled=!editing||selected<0;
    host.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('.parking-tuning input,.parking-tuning select,.parking-tuning button').forEach(el=>el.disabled=!editing);
    q<HTMLInputElement>('[data-observation]').disabled=observeFrames().length<2||phase==='running';q('[data-observation-label]').textContent=editing?'路线预演':'实际回放';q('[data-observation-value]').textContent=`${(p.s/SCALE).toFixed(1)}m`;
    if(follow)q<HTMLInputElement>('[data-observation]').value='1000';
    q('[data-stamps]').textContent=['echo','space','control'].map((k,i)=>`${saved.evidence.some(e=>e.kind===k)?'●':'○'} ${['测距','空间','执行'][i]}`).join('  ');
    q<HTMLButtonElement>('[data-evidence]').disabled=!pendingEvidence||phase==='running';
    if(science===2&&q('[data-wheel-reading]'))q('[data-wheel-reading]').textContent=`当前观察：${p.gear===1?'前进':'倒车'} · 车轮 ${degrees(p.steer).toFixed(1)}° · 车头 ${degrees(p.angle).toFixed(1)}°`;
    if(science===1&&q('[data-gap-reading]')){const n=nearestContact(p,level);q('[data-gap-reading]').textContent=`${n.corner}附近 → ${n.name}：${(n.gap/SCALE).toFixed(2)} m`;}
  }
  function finish(){if(!run)return;phase='result';follow=true;const quality=parkingQuality(run.pose,level),success=run.status==='ended'&&quality.parked,score=starsFor(run,level);
    const a:Attempt={id:round,levelId:level.id,success,assisted:run.assisted,stars:score,distance:run.distance,shifts:run.shifts,corrections:run.corrections,offset:quality.offset,heading:quality.heading,contact:run.contact?`${run.contact.corner}附近接触${run.contact.name}`:'',trace:run.trace.filter((_,i)=>i%Math.max(1,Math.ceil(run!.trace.length/1000))===0),batches:structuredClone(batches)};
    if(a.trace.at(-1)?.s!==run.distance)a.trace.push(frameOf(run));saved.attempts=saved.attempts.filter(x=>x.id!==round);saved.attempts.push(a);saved.attempts=saved.attempts.slice(-6);saved.best[level.id]=Math.max(saved.best[level.id]||0,score);
    if(success){api.award('parking',`scene-${theme}`,20,level.name+'体验');api.complete('parking');}
    const message=run.contact?`${a.contact}。红圈是首次接触位置，回放看看车角扫过的空间。`:success?`小车完整入位！${run.assisted?'这是演示体验；空方案重开可以挑战自主星级。':score===3?'路线和停车姿态都很漂亮。':'再试着停得更正，或减少行程与补救。'}`:quality.inside?'车头还没有对齐。可以从这里补一段，或修改原方案。':'路线走完了，车身还没有完全进入车位。可以补一段或改原方案。';
    q('[data-result]').hidden=false;q('[data-result]').innerHTML=`<div><span class="parking-result-stars">${run.assisted?'演示体验':stars(score)}</span><b>${success?'完整入位':run.contact?'找到问题了':'还差一点'}</b></div><p>${escapeHTML(message)}</p><div class="parking-result-facts"><span>中心偏差 <b>${(quality.offset/SCALE).toFixed(2)}m</b></span><span>方向偏差 <b>${degrees(quality.heading).toFixed(1)}°</b></span><span>最近间距 <b>${Number.isFinite(run.minGap)?(run.minGap/SCALE).toFixed(2):'—'}m</b></span></div>`;
    status(message);report(a);sync();
  }
  function execute(){
    if(phase==='running'){phase='paused';run!.accumulator=0;status('已暂停。继续不会增加补救次数；改写剩余方案才算补救。');sync();return;}
    if(phase==='paused'){phase='running';follow=true;sync();return;}
    if(phase!=='planning'||!commands.length)return;
    action();echo=null;compare=false;tap=null;clearEvidence();
    if(correction&&run){continueRun(run,commands);}else{run=createRun(start,commands,assisted);round=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);batches=[];}
    batches.push({start:{...start},commands:structuredClone(commands)});phase='running';follow=true;status(assisted?'演示执行中：观察路线如何变成转向动作。':'正在执行你的方案。小车按路段控制转向，换向前会停下。');sync();
  }
  function renderScience(){
    host.querySelectorAll<HTMLElement>('[data-science]').forEach(b=>b.classList.toggle('active',Number(b.dataset.science)===science));
    const content=[
      `<span class="parking-kicker">01 / 感知</span><h3>回声能告诉我们什么？</h3><p>先猜：哪次回声先回来？拖动观察位置，再点车头或车尾测量。</p><div class="parking-science-actions"><button class="btn btn-small" data-measure="front">车头测一次</button><button class="btn btn-small" data-measure="rear">车尾测一次</button></div><div data-echo-readings class="parking-readings">测两次不同的距离，比一比。</div><details><summary>为什么要除以2？</summary><p>声音走了“去＋回”两程。距离＝声速×往返时间÷2。波纹为慢放；没有回波不代表一定安全。</p></details>`,
      `<span class="parking-kicker">02 / 规划</span><h3>线能过，车也能过吗？</h3><p>先猜哪个车角最靠近障碍。拖动预演或回放，观察整辆车占用的空间。</p><label class="parking-check"><input type="checkbox" data-footprint ${footprint?'checked':''}>显示沿途车身足迹</label><p class="parking-reading-live" data-gap-reading></p><button class="btn btn-small" data-mark-space>记录当前车角与间距</button><p class="parking-science-note">彩色线是后轴中心轨迹。车角会扫过更宽的范围。</p>`,
      `<span class="parking-kicker">03 / 执行</span><h3>谁在帮小车转方向？</h3><p>你规划路段，系统把它变成前进、倒车与转向。看车轮和当前动作怎样对应。</p><p class="parking-reading-live" data-wheel-reading></p><button class="btn btn-small" data-compare-control>同样打轮，比前进 / 倒车</button><p class="parking-science-note">副本实验：起点与转角相同，只改变前进或倒车，不改变本轮成绩。</p>`
    ];q('[data-science-content]').innerHTML=content[science];
    host.querySelectorAll<HTMLButtonElement>('[data-measure]').forEach(b=>b.onclick=()=>{if(phase==='running')return;action();echo=measureEcho(observed(),level,b.dataset.measure as 'front'|'rear');echoAge=0;echoes.push(echo);echoes=echoes.slice(-2);q('[data-flow-echo]').textContent=echo.distance===null?'未检测到回波':`${echo.distance.toFixed(2)}m / ${echo.milliseconds!.toFixed(1)}ms`;q('[data-echo-readings]').innerHTML=echoes.map((e,i)=>`<div><span>测量 ${i+1}</span><b>${e.distance===null?'本次未检测到':`${e.distance.toFixed(2)}m · ${e.milliseconds!.toFixed(1)}ms`}</b></div>`).join('');const comparison=echoes.length===2?compareEcho(echoes[0],echoes[1]):null;if(comparison)evidence('echo','我比较了两次回声。',comparison,structuredClone(echoes));else{clearEvidence();q('[data-discovery]').textContent=echo.distance===null?'试着换一个观察位置或传感器；未收到回波不表示安全。':'保留这次读数，再换一个位置测量。';}sync();});
    if(q('[data-footprint]'))q<HTMLInputElement>('[data-footprint]').onchange=e=>{footprint=(e.target as HTMLInputElement).checked;};
    if(q('[data-mark-space]'))q<HTMLButtonElement>('[data-mark-space]').onclick=()=>{if(phase==='running'||!commands.length&&!run)return;const p=observed(),n=nearestContact(p,level);action();evidence('space','路线旁边还要留出车身的空间。',`${phase==='planning'?'规划预演':'实际回放'}中，${n.corner}附近到${n.name}为 ${(n.gap/SCALE).toFixed(2)} m。`,{pose:p,contact:n,source:phase==='planning'?'preview':'run',round});sync();};
    if(q('[data-compare-control]'))q<HTMLButtonElement>('[data-compare-control]').onclick=()=>{if(phase==='running')return;const p=observed(),steer=Math.abs(p.steer)>.03?p.steer:.35,a=integrateBicycle(p,65,steer,1),b=integrateBicycle(p,-65,steer,1);compare=true;action();evidence('control','同样打轮，前进和倒车改变车头朝向的方向相反。',`固定车轮 ${degrees(steer).toFixed(1)}°，前进后车头改变 ${degrees(normalize(a.angle-p.angle)).toFixed(1)}°，倒车后改变 ${degrees(normalize(b.angle-p.angle)).toFixed(1)}°。`,{start:p,steer,forward:a,reverse:b});sync();};sync();
  }
  q<HTMLButtonElement>('[data-evidence]').onclick=()=>{if(!pendingEvidence||phase==='running')return;const e=structuredClone(pendingEvidence);saved.evidence=saved.evidence.filter(f=>!(f.kind===e.kind&&f.levelId===e.levelId));saved.evidence.push(e);saved.evidence=saved.evidence.slice(-12);if(e.kind!=='space')api.award('parking','finding',20,'记录真实比较发现');report();api.notify('这条观察证据已写进作品报告');clearEvidence();q('[data-discovery]').textContent='已保存：'+e.text;sync();};
  host.querySelectorAll<HTMLElement>('[data-scene]').forEach(b=>b.onclick=()=>{theme=Number(b.dataset.scene);chooseLevel();});host.querySelectorAll<HTMLElement>('[data-mode]').forEach(b=>b.onclick=()=>{tight=b.dataset.mode==='tight';chooseLevel();});
  host.querySelectorAll<HTMLElement>('[data-science]').forEach(b=>b.onclick=()=>{science=Number(b.dataset.science);echo=null;compare=false;renderScience();});
  host.querySelectorAll<HTMLElement>('[data-add]').forEach(b=>b.onclick=()=>{if(phase!=='planning'||commands.length>=MAX_SEGMENTS)return;commands.push({gear:Number(b.dataset.add)===-1?-1:1,distance:100,steer:0});selected=commands.length-1;action();recompute();status('拖动停止点决定走多远；拖弯点改变弧线。也可以用下面的距离与转角控件。');});
  q<HTMLButtonElement>('[data-remove]').onclick=()=>{if(phase!=='planning'||selected<0)return;commands.splice(selected,1);selected=Math.min(selected,commands.length-1);action();recompute();};
  const edit=(change:Partial<Command>)=>{if(phase!=='planning'||selected<0)return;commands[selected]={...commands[selected],...change};action();recompute();};
  q<HTMLInputElement>('[data-length]').oninput=e=>edit({distance:Number((e.target as HTMLInputElement).value)});q<HTMLInputElement>('[data-steer]').oninput=e=>edit({steer:Number((e.target as HTMLInputElement).value)*Math.PI/180});q<HTMLSelectElement>('[data-gear-input]').onchange=e=>edit({gear:Number((e.target as HTMLSelectElement).value)===1?1:-1});q<HTMLButtonElement>('[data-straight]').onclick=()=>edit({steer:0});
  q<HTMLInputElement>('[data-length-number]').onchange=e=>edit({distance:clamp(Number((e.target as HTMLInputElement).value)*SCALE,12,600)});q<HTMLInputElement>('[data-steer-number]').onchange=e=>edit({steer:clamp(Number((e.target as HTMLInputElement).value)*Math.PI/180,-MAX_STEER,MAX_STEER)});
  host.querySelectorAll<HTMLElement>('[data-point]').forEach(b=>{b.onclick=()=>{tap=b.dataset.point as 'end'|'bend';status('已选择'+(tap==='end'?'停止点':'拖弯点')+'：在场地点击新位置，或聚焦此按钮用方向键微调。');};b.onkeydown=e=>{if(!e.key.startsWith('Arrow')||phase!=='planning'||selected<0)return;e.preventDefault();const kind=b.dataset.point as 'end'|'bend',s=commandStart(start,commands,selected),p=kind==='end'?commandEnd(s,commands[selected]):commandMid(s,commands[selected]);p.x+=(e.key==='ArrowRight'?4:e.key==='ArrowLeft'?-4:0);p.y+=(e.key==='ArrowDown'?4:e.key==='ArrowUp'?-4:0);commands[selected]=dragCommand(s,commands[selected],p,kind);action();recompute();};});
  q('[data-execute]').onclick=execute;q('[data-reset]').onclick=()=>reset();q('[data-retry]').onclick=()=>reset(true);
  q('[data-correct]').onclick=()=>{if(!run||phase==='running'||run.status==='collision')return;start={...run.pose};commands=[];selected=-1;phase='planning';correction=true;follow=false;observation=1000;clearEvidence();q('[data-result]').hidden=true;recompute();status('从当前真实位置规划补救，之前的行程与换向仍会计入本轮。');};
  q('[data-hint]').onclick=()=>{hintOpen=!hintOpen;status(hintOpen?level.hint:'先猜一猜起转位置，试跑后用科普工具找证据。');};
  q('[data-demo]').onclick=()=>{reset();commands=structuredClone(level.reference);selected=0;assisted=true;recompute();status('完整演示方案已载入。点击执行观察，演示不计自主挑战星级。');};
  q<HTMLInputElement>('[data-observation]').oninput=e=>{follow=false;observation=Number((e.target as HTMLInputElement).value);echo=null;compare=false;sync();};q<HTMLInputElement>('[data-history]').onchange=e=>{showHistory=(e.target as HTMLInputElement).checked;};
  q('[data-zoom]').onclick=()=>{q('.parking-viewport').classList.toggle('zoomed');q('[data-zoom]').textContent=q('.parking-viewport').classList.contains('zoomed')?'适应场地':'放大场地';};
  q('[data-save]').onclick=()=>{if(!dirty&&!saved.attempts.length){api.notify('先亲手规划或测量，再保存作品');return;}report(run&&phase==='result'?saved.attempts.find(a=>a.id===round):undefined);api.saveImage('parking',media.capture(stage.capture()));api.award('parking','save',10,'保存作品');api.notify('停车画面与科学发现已保存');};
  function pause(){if(phase==='running'){phase='paused';if(run)run.accumulator=0;status('已暂停，点击继续执行。');sync();}if(drag){commands[drag.index]=drag.before;drag=null;recompute();}tap=null;}
  const visibility=()=>{if(document.hidden)pause();};const key=(e:KeyboardEvent)=>{if(e.code==='Space'&&!e.repeat&&!['INPUT','SELECT','TEXTAREA','BUTTON','SUMMARY','A'].includes((e.target as HTMLElement)?.tagName)){e.preventDefault();execute();}};
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',key);
  const stage=createStage(q('.lab-stage'),{width:1000,height:560,label:'泊车领航员：拖动分段弧线、观察测距与车身空间',
    pointer(kind,x,y){if(phase!=='planning'||selected<0)return;const s=commandStart(start,commands,selected),c=commands[selected];if(kind==='down'){
      const threshold=Math.max(23,18*1000/q('.lab-stage').getBoundingClientRect().width),end=commandEnd(s,c),bend=commandMid(s,c);const handle=Math.hypot(x-end.x,y-end.y)<threshold?'end':Math.hypot(x-bend.x,y-bend.y)<threshold?'bend':tap;
      if(handle){drag={kind:handle,before:{...c},index:selected};if(tap){commands[selected]=dragCommand(s,c,{x,y},handle);action();recompute();tap=null;}}
    }else if(kind==='move'&&drag){commands[selected]=dragCommand(s,drag.before,{x,y},drag.kind);action();recompute();}else if(kind==='up'&&drag){if(x<0||y<0||x>1000||y>560)commands[drag.index]=drag.before;drag=null;recompute();}}
    ,update(dt){if(disposed)return;echoAge+=dt;if(phase==='running'&&run){advanceRun(run,level,dt);if(run.status!=='moving')finish();}lastTick+=dt;if(lastTick>.09){lastTick=0;sync();const p=observed(),signal=`${science}/${Math.round(p.s)}/${phase}`;if(signal!==lastScience){lastScience=signal;media.signal({position:clamp(p.s/1000,0,1),text:`${scienceNames[science]} · ${phase==='running'?'执行中':'观察中'}`});}}},
    draw(ctx){const p=observed(),s=selected>=0?commandStart(start,commands,selected):start,c=commands[selected];const previous=saved.attempts.filter(a=>a.levelId===level.id&&a.id!==round).at(-1);drawParking(ctx,{level,actual:run?.pose||start,observed:p,preview:preview.trace,history:showHistory?previous?.trace||[]:[],run,planning:phase==='planning',selected,handles:c?{end:commandEnd(s,c),bend:commandMid(s,c)}:null,footprint,science,echo,echoAge,compare,color:api.getVehicle().color,body:api.getVehicle().body,reduced:api.reducedMotion()});}
  });
  reset();renderScience();
  return {destroy(){disposed=true;window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',key);media.destroy();stage.destroy();}};
}
