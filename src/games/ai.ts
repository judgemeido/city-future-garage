import { nightBackdrop } from '../theme';
import { createStage, roundRect, label, drawCar, escapeHTML } from '../platform';
import { drawPremiumTopCar } from '../car-art';
import type { GameAPI, MountedGame } from '../types';
import './ai.css';

import { ACTIONS, ACTION_TEXT, ACTION_DESCRIPTION, FEATURE_NAMES, VALUE_NAMES, CATEGORIES, EXAMPLES, TESTS, DISTRICTS, BASE, buildTree, predict, sanitizeSamples, normalizeFeatures, needsCoach, districtTests, featureSentence, actionPose, type Action, type Category, type Features, type DecisionNode, type Sample, type Example, type District, type Prediction } from './ai-model';
interface TestResult { id:string; title:string; district:District; features:Features; prediction:Action; expected:Action; actualAction:Action; correct:boolean; intercepted:boolean; path:string[]; unfamiliar:string[]; modelRevision:number }
function treeMarkup(node:DecisionNode):string {
  if(!node.feature || !node.branches) return `<li class="ai-tree-leaf">→ ${ACTION_TEXT[node.action]} <span>（${node.size} 条示范）</span></li>`;
  return `<li>${FEATURE_NAMES[node.feature]}<ul>${Object.entries(node.branches).map(([value,child])=>`<li>${VALUE_NAMES[value]}<ul>${treeMarkup(child)}</ul></li>`).join('')}</ul></li>`;
}
function countNodes(tree:DecisionNode):number { return 1+Object.values(tree.branches??{}).reduce((n,b)=>n+countNodes(b),0); }


export function mountAI(host:HTMLElement,api:GameAPI):MountedGame {
  const saved=api.getRecord('ai');
  let samples=sanitizeSamples(saved.trainingSamples),modelSamples=sanitizeSamples(saved.modelSamples);
  let tree:DecisionNode|undefined=modelSamples.length?buildTree(modelSamples):undefined;
  let modelRevision=typeof saved.modelRevision==='number'?saved.modelRevision:0;
  let selectedId=typeof saved.selectedCard==='string'?saved.selectedCard:'demo-clear-0';
  if(!EXAMPLES.some(e=>e.id===selectedId)&&!TESTS.some(e=>`review-${e.id}`===selectedId)) selectedId=EXAMPLES[0].id;
  let results:TestResult[]=Array.isArray(saved.testPredictions)?(saved.testPredictions as TestResult[]).filter(r=>TESTS.some(t=>t.id===r.id) && ACTIONS.includes(r.prediction) && typeof r.correct==='boolean').slice(-TESTS.length).map(r=>({...r,features:normalizeFeatures(r.features)??{...BASE}})):[];
  let completedDistricts:string[]=Array.isArray(saved.completedDistricts)?saved.completedDistricts.filter((d):d is string=>DISTRICTS.some(item=>item.id===d)):[];
  let bestTestScore=typeof saved.bestTestScore==='number'?Math.max(0,Math.min(20,saved.bestTestScore)):0;
  let runHistory:Record<string,unknown>[]=Array.isArray(saved.runHistory)?saved.runHistory.slice(-10):[];
  let live: { district:District; index:number; elapsed:number; prediction:Prediction; result:TestResult; paused:boolean }|undefined;
  let runCompleted:TestResult[]=[], runSpeed=1, currentMode:'teach'|'running'|'finished'='teach', notice='先选路况和具体情境，再用“走、慢、等、让、绕、停”做示范。';
  let disposed=false,driverMessageUntil=0,canvasTime=0;
  const root=document.createElement('section');root.className='experience ai-experience';
  root.innerHTML=`
    <div class="ai-topline"><div><h2>教会小司机，认识新道路</h2><p>给示范 → 生成模型 → 上路检验。它会从你的选择里找规律。</p></div><div class="ai-learning-status"><span class="chip" id="ai-sample-count">0 条示范</span><span class="chip" id="ai-model-status">还没生成模型</span></div></div>
    <div class="ai-stage-wrap"><div class="playfield" id="ai-stage"></div><div class="ai-stage-caption"><span id="ai-stage-title"><strong>示范工位</strong> · 先观察道路线索</span><span id="ai-stage-status" class="ai-caption-prediction">小司机等你教</span></div></div>
    <div class="ai-control-grid">
      <div class="control-panel"><div class="ai-panel-title"><h3>① 给小司机做示范</h3><span>12 类路况 · 36 个示范</span></div><div class="ai-road-cards">${CATEGORIES.map(c=>`<button type="button" class="ai-road-card" data-category="${c.id}" aria-pressed="false"><span class="ai-card-mark"></span><span class="ai-card-icon" aria-hidden="true">${c.icon}</span><span>${c.title}</span></button>`).join('')}</div>
        <div class="ai-example-picker"><label for="ai-example-select">选择具体情境</label><select id="ai-example-select" aria-label="选择具体训练情境"></select></div><div class="ai-card-description" id="ai-card-description"></div><div class="ai-teach-header"><span>这个情境，你会让小司机怎么做？</span><button type="button" class="ai-small-button" id="ai-next-example">换一个例子</button></div>
        <div class="ai-action-choice">${ACTIONS.map(action=>`<button type="button" class="ai-action-button" data-action="${action}" aria-pressed="false"><strong>${ACTION_TEXT[action]}</strong><span>${ACTION_DESCRIPTION[action]}</span></button>`).join('')}</div>
        <div class="ai-teaching-feedback" id="ai-teaching-feedback" aria-live="polite"></div><button type="button" class="btn btn-primary ai-model-button" id="ai-train">生成小司机模型 · +20 分</button>
        <details class="ai-model-details"><summary>看看已记录的示范</summary><div class="ai-sample-list" id="ai-sample-list"></div></details>
      </div>
      <div class="control-panel"><div class="ai-panel-title"><h3>② 去新街区检验</h3><span>4 个街区 · 24 个路况</span></div><div class="ai-run-buttons">${DISTRICTS.map(d=>`<button type="button" class="btn" id="ai-run-${d.id}" title="${d.description}">${d.title}</button>`).join('')}</div>
        <div class="ai-run-controls"><button type="button" class="btn" id="ai-pause" hidden>暂停试跑</button><label class="ai-speed-label">播放速度 <select id="ai-speed" aria-label="试跑播放速度"><option value="1">1 倍</option><option value="1.5">1.5 倍</option><option value="2">2 倍</option></select></label><button type="button" class="ai-small-button" id="ai-snapshot">保存快照</button></div>
        <div class="ai-model-summary" id="ai-model-summary"></div><div class="ai-progress-track" role="progressbar" aria-label="当前街区检验进度" aria-valuemin="0" aria-valuemax="6" aria-valuenow="0"><div class="ai-progress-fill" id="ai-progress-fill"></div></div><div class="ai-feedback" id="ai-feedback" aria-live="polite"></div>
        <details class="ai-model-details"><summary>看看小司机学到的决策树</summary><ul class="ai-tree" id="ai-tree"></ul></details>
      </div>
    </div>
    <div class="control-panel ai-result-panel" id="ai-result-panel" hidden><div class="ai-panel-title"><h3>③ 复盘：小司机原来怎么想？</h3><span id="ai-results-count"></span></div><div class="ai-results" id="ai-results"></div></div>
    <div class="science-note ai-science"><strong>小司机学的是示范中的规律，不是背下答案。</strong><p>本实验使用已整理好的道路特征训练一棵小决策树，不进行图片识别。示范太少或互相矛盾，模型就可能判断错；安全教练会保留原始预测，并在危险动作前接管。</p><p>教学规则：红灯、可安全停车的黄灯或行人横穿 → 等；封路、无绕行通道 → 停；骑行者汇入或急救车接近 → 让；已确认可安全借道的占道障碍 → 绕；校园、雨雾、湿滑或弯道 → 慢；畅通 → 走。绕行场景已明确借道合法、邻道无来车。</p></div>`;
  const worldColumn=document.createElement('div');worldColumn.className='ai-world-column';
  const stageWrap=root.querySelector<HTMLElement>('.ai-stage-wrap')!,science=root.querySelector<HTMLElement>('.ai-science')!;
  stageWrap.before(worldColumn);worldColumn.append(stageWrap,science);
  host.append(root);
  const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  function selectedExample():Example { return EXAMPLES.find(e=>e.id===selectedId)??TESTS.find(e=>`review-${e.id}`===selectedId)??EXAMPLES[0]; }
  function fingerprint(list:Sample[]) {return JSON.stringify(list.map(s=>[s.id,s.action,s.features]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
  function dirty() {return fingerprint(samples)!==fingerprint(modelSamples);}
  function persist() {
    const correct=results.filter(r=>r.correct).length,interventions=results.filter(r=>r.intercepted).length;
    const summary=results.length?(correct===results.length?'我的小司机在已检验的道路中都选对了动作；更多复杂路况仍需要新示范。':`我发现模型有 ${results.length-correct} 个情境判断不合适，可以补示范后再训练。`):samples.length?'我正在用六种驾驶动作教小司机找规律。':'我还没有开始教小司机。';
    api.record('ai',{trainingSamples:samples,modelSamples,decisionTree:tree??null,modelRevision,selectedCard:selectedId,testPredictions:results,completedDistricts,bestTestScore,runHistory,
      summary,report:[{label:'我提供的示范',value:`${samples.length} 条，覆盖 ${new Set(samples.map(s=>s.category)).size}/${CATEGORIES.length} 类道路`},{label:'我的小司机模型',value:tree?`第 ${modelRevision} 版，${countNodes(tree)} 个决策树节点`:'还没有生成模型'},{label:'已检验的道路情境',value:`${results.length}/${TESTS.length} 个`},{label:'原始预测符合教学规则',value:`${correct}/${results.length} 个`},{label:'安全教练接管',value:`${interventions} 次；原始预测保留在实验记录中`},{label:'科学发现',value:'模型从结构化道路示范学习；多种路况和正确示范帮助完善判断。'}],
      scientificModel:'ID3 categorical decision tree; structured features; no image recognition',teachingRules:'signal/crossing → wait; blocked/no bypass → stop; priority → yield; safe bypass → detour; poor conditions → slow; otherwise → go',
      sampleCount:samples.length,testedEvents:results.length,correctPredictions:results.filter(r=>r.correct).length,coachInterventions:results.filter(r=>r.intercepted).length});
  }
  function render() {
    const current=selectedExample(),recorded=samples.find(s=>s.id===selectedId),isRunning=!!live;
    $('#ai-sample-count').textContent=`${samples.length} 条示范`;
    $('#ai-model-status').textContent=tree?(dirty()?'有新示范待学习':`第 ${modelRevision} 版模型`):'还没生成模型';
    root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button=>{button.setAttribute('aria-pressed',String(current.category===button.dataset.category&&!selectedId.startsWith('review-')));button.disabled=isRunning;button.querySelector('.ai-card-mark')!.textContent=samples.some(s=>s.category===button.dataset.category)?'✓':'';});
    const exampleSelect=$<HTMLSelectElement>('#ai-example-select');
    const available=EXAMPLES.filter(e=>e.category===current.category);
    exampleSelect.innerHTML=(selectedId.startsWith('review-')?`<option value="${escapeHTML(selectedId)}">复盘 · ${escapeHTML(current.title)}</option>`:'')+available.map((e,i)=>`<option value="${e.id}">${i+1}. ${escapeHTML(e.title)}${samples.some(s=>s.id===e.id)?' ✓':''}</option>`).join('');
    exampleSelect.value=selectedId;exampleSelect.disabled=isRunning;
    root.dataset.trainingCategory=current.category;root.dataset.example=selectedId;
    root.dataset.running=String(isRunning);root.dataset.paused=String(live?.paused??false);
    root.dataset.event=live?districtTests(live.district)[live.index].id:'';
    root.dataset.executedAction=live?.result.actualAction??'';
    $('#ai-card-description').innerHTML=`<strong>${selectedId.startsWith('review-')?'复盘示范 · ':''}${escapeHTML(current.title)}</strong><br>${escapeHTML(featureSentence(current.features))}`;
    root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>{button.setAttribute('aria-pressed',String(recorded?.action===button.dataset.action));button.disabled=isRunning;});
    $('#ai-teaching-feedback').textContent=recorded?`已记录：你选择“${ACTION_TEXT[recorded.action]}”。${dirty()?'生成模型后，小司机才能学到这条新示范。':'这条示范已用于当前模型。'}`:'还没有记录这张卡。选择一个动作，就是给小司机的一条示范。';
    $<HTMLButtonElement>('#ai-train').disabled=isRunning||!samples.length;
    $('#ai-train').textContent=tree?(dirty()?'重新学习这些示范':'重新生成小司机模型'):'生成小司机模型 · +20 分';
    for(const district of DISTRICTS) {$<HTMLButtonElement>(`#ai-run-${district.id}`).disabled=isRunning||!tree||dirty();$('#ai-run-'+district.id).textContent=`${completedDistricts.includes(district.id)?'✓ ':''}${district.title}`;}
    $<HTMLButtonElement>('#ai-next-example').disabled=isRunning;
    $<HTMLButtonElement>('#ai-pause').hidden=!isRunning;
    $('#ai-pause').textContent=live?.paused?'继续试跑':'暂停试跑';
    $('#ai-model-summary').innerHTML=tree?`<strong>小司机已经学会了一棵 ${countNodes(tree)} 节点的决策树。</strong><br>${dirty()?'你修改了示范，先重新学习，再去检验。':`用 ${modelSamples.length} 条示范判断新路况。${modelSamples.length<4?'示范还少，试跑可能暴露盲区。':'不同特征组合仍需要上路检验。'}`}`:'<strong>先给一条示范，就能开始学习。</strong><br>试着教会六种动作，再去四个新街区检验组合路况。';
    $('#ai-tree').innerHTML=tree?treeMarkup(tree):'<li>生成模型后，这里会显示它真正学到的判断顺序。</li>';
    $('#ai-sample-list').innerHTML=samples.length?samples.map(s=>`<span class="ai-sample-item">${escapeHTML(s.title)} → ${ACTION_TEXT[s.action]}<button type="button" class="ai-delete-sample" data-delete="${escapeHTML(s.id)}" aria-label="删除${escapeHTML(s.title)}的示范" ${isRunning?'disabled':''}>×</button></span>`).join(''):'还没有示范。';
    $('#ai-feedback').textContent=notice;
    const visible=live?runCompleted:results;
    $('#ai-result-panel').hidden=!visible.length;
    $('#ai-results-count').textContent=`${visible.filter(r=>r.correct).length} / ${visible.length} 个原始判断符合教学规则`;
    $('#ai-results').innerHTML=visible.map(result=>`<div class="ai-result ${result.correct?'':'is-mistake'}"><div class="ai-result-top"><span>${escapeHTML(result.title)}</span><span>${result.correct?'✓':'待补示范'}</span></div><strong>模型：${ACTION_TEXT[result.prediction]} ${result.correct?'✓':`→ 建议：${ACTION_TEXT[result.expected]}`}</strong><small>${result.intercepted?'安全教练接管，保留原始判断。':result.correct?'小司机按学到的判断行动。':'动作保守但不匹配，继续完善示范。'}</small>${!result.correct&&!live?`<button type="button" class="ai-small-button" data-review="${result.id}">给这个情境补示范 →</button>`:''}</div>`).join('');
    updateCaption();
  }
  function updateCaption() {
    if(live) {
      const e=districtTests(live.district)[live.index];
      $('#ai-stage-title').innerHTML=`<strong>街区 ${live.district.toUpperCase()} · ${live.index+1}/${districtTests(live.district).length}</strong> · ${escapeHTML(e.title)}`;
      $('#ai-stage-status').className=live.result.intercepted?'ai-caption-safety':'ai-caption-prediction';
      $('#ai-stage-status').textContent=`原始预测：${ACTION_TEXT[live.prediction.action]}${live.result.intercepted?` · 安全教练接管为“${ACTION_TEXT[live.result.actualAction]}”`:live.paused?' · 已暂停':''}`;
    } else {$('#ai-stage-title').innerHTML=`<strong>${currentMode==='finished'?'检验已完成':'示范工位'}</strong> · ${escapeHTML(selectedExample().title)}`;$('#ai-stage-status').className='ai-caption-prediction';$('#ai-stage-status').textContent=tree?'小司机由你的示范训练':'小司机等你教';}
  }
  function teach(action:Action) {
    if(live) return; const e=selectedExample();
    samples=samples.filter(s=>s.id!==selectedId);samples.push({...e,id:selectedId,features:{...e.features},action});
    const awardGroup=e.category==='clear'?'clear':['signal','construction','parked','blocked'].includes(e.category)?'signal':['school','fog','rain','night'].includes(e.category)?'school':'pedestrian';
    api.award('ai',`demo-${awardGroup}`,5,`${CATEGORIES.find(c=>c.id===e.category)!.title}示范`);
    notice=`“${ACTION_TEXT[action]}”已成为训练示范。小司机会学习你的选择，是否合适要通过新道路检验。`;
    persist();render();
  }
  function train() {
    if(live||!samples.length) return;
    modelSamples=samples.map(s=>({...s,features:{...s.features}}));tree=buildTree(modelSamples);modelRevision++;currentMode='teach';
    api.award('ai','model-created',20,'亲手训练小决策树');
    const uniform=new Set(samples.map(s=>s.action)).size===1;
    notice=uniform?`你目前的示范全是“${ACTION_TEXT[samples[0].action]}”，小司机会把所有情境都判断成“${ACTION_TEXT[tree.action]}”。试跑看看哪里需要补充。`:'模型已经生成。试跑时看它的原始判断，发现错误后可以补示范、再学习。';
    persist();render();api.notify(`第 ${modelRevision} 版小司机模型已生成`);
  }
  function startEvent(district:District,index:number) {
    const e=districtTests(district)[index],prediction=predict(tree!,e.features,modelSamples);
    const intercepted=needsCoach(e.expected,prediction.action);
    const result:TestResult={id:e.id,title:e.title,district,features:{...e.features},prediction:prediction.action,expected:e.expected,actualAction:intercepted?e.expected:prediction.action,correct:prediction.action===e.expected,intercepted,path:prediction.path,unfamiliar:prediction.unfamiliar,modelRevision};
    live={district,index,elapsed:0,prediction,result,paused:false};
    notice=`${e.title}：模型判断“${ACTION_TEXT[prediction.action]}”。${intercepted?'安全教练将先接管危险动作，再一起复盘。':prediction.unfamiliar.length?'有些特征还没在示范中出现，观察它如何判断。':'看小司机怎样执行自己的判断。'}`;
    render();
  }
  function startRun(district:District) {
    if(live||!tree||dirty()) return;
    runCompleted=[];currentMode='running';$('#ai-progress-fill').style.width='0%';$('.ai-progress-track').setAttribute('aria-valuenow','0');startEvent(district,0);
  }
  function finishEvent() {
    if(!live) return;const {district,index,result}=live;
    results=results.filter(r=>r.id!==result.id);results.push(result);results.sort((a,b)=>a.id.localeCompare(b.id));runCompleted.push(result);
    const correct=results.filter(r=>r.correct).length;bestTestScore=Math.max(bestTestScore,Math.round(correct/TESTS.length*20));
    api.award('ai','prediction-quality',bestTestScore,'新道路原始预测符合教学规则');
    persist();
    if(index<districtTests(district).length-1) startEvent(district,index+1);
    else {
      live=undefined;currentMode='finished';if(!completedDistricts.includes(district)) completedDistricts.push(district);
      $('#ai-progress-fill').style.width='100%';$('.ai-progress-track').setAttribute('aria-valuenow',String(districtTests(district).length));
      runHistory.push({district,modelRevision,results:runCompleted.map(r=>({...r})),correct:runCompleted.filter(r=>r.correct).length});runHistory=runHistory.slice(-10);
      api.award('ai',`district-${district}`,10,`完成街区 ${district.toUpperCase()} 检验`);api.complete('ai');
      const wrong=runCompleted.filter(r=>!r.correct).length;
      notice=wrong?`街区 ${district.toUpperCase()} 检验完成！${wrong} 个情境需要新示范。点下面“补示范”，教会它再来试。`:`街区 ${district.toUpperCase()} 的 ${districtTests(district).length} 个原始判断都符合教学规则！还可以检验另一个街区。`;
      persist();render();api.saveImage('ai',stage.capture());api.notify(`街区 ${district.toUpperCase()} 完成，实验记录已保存`);
    }
  }
  root.addEventListener('click',event=>{
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!target||target.disabled) return;
    const category=target.dataset.category as Category|undefined,action=target.dataset.action as Action|undefined;
    if(category) {selectedId=EXAMPLES.find(e=>e.category===category)!.id;currentMode='teach';persist();render();}
    if(action) teach(action);
    if(target.dataset.delete&&!live) {samples=samples.filter(s=>s.id!==target.dataset.delete);notice='这条示范已移除。重新生成模型后，小司机会按剩余示范学习。';persist();render();}
    if(target.dataset.review&&!live) {selectedId=`review-${target.dataset.review}`;currentMode='teach';notice='请重新观察这个情境，再给小司机一条你认为合适的示范。';persist();render();$('.ai-action-choice').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  });
  $('#ai-train').addEventListener('click',train);
  for(const district of DISTRICTS) $('#ai-run-'+district.id).addEventListener('click',()=>startRun(district.id));
  $('#ai-pause').addEventListener('click',()=>{if(live){live.paused=!live.paused;render();}});
  $('#ai-next-example').addEventListener('click',()=>{
    if(live) return;const current=selectedExample(),alternates=EXAMPLES.filter(e=>e.category===current.category),index=alternates.findIndex(e=>e.id===selectedId);
    selectedId=alternates[(index+1)%alternates.length].id;currentMode='teach';persist();render();
  });
  $('#ai-example-select').addEventListener('change',()=>{if(live) return;selectedId=$<HTMLSelectElement>('#ai-example-select').value;currentMode='teach';persist();render();});
  $('#ai-speed').addEventListener('change',()=>{runSpeed=Number($<HTMLSelectElement>('#ai-speed').value);});
  $('#ai-snapshot').addEventListener('click',()=>{api.saveImage('ai',stage.capture());api.notify('小司机实验快照已存入电子报告');});
  function drawDriver(ctx:CanvasRenderingContext2D,x:number,y:number,size=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    ctx.fillStyle='#bc98ff22';ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.fill();
    roundRect(ctx,-23,-24,46,48,14,'#1e2d46','#bc98ff');
    roundRect(ctx,-18,-14,36,27,9,'#081b30');ctx.fillStyle='#47eaff';ctx.beginPath();ctx.arc(-8,-1,3,0,Math.PI*2);ctx.arc(8,-1,3,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#47eaff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,4,7,.1,Math.PI-.1);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(0,-33);ctx.stroke();ctx.fillStyle='#ed71bd';ctx.beginPath();ctx.arc(0,-35,5,0,Math.PI*2);ctx.fill();
    roundRect(ctx,-7,18,14,4,2,'#bc98ff');ctx.restore();
  }
  function drawTopCar(ctx:CanvasRenderingContext2D,x:number,y:number,color:string,moving:boolean,time:number) {
    ctx.save();ctx.translate(x,y);
    drawPremiumTopCar(ctx,0,0,color,1,api.getVehicle().body);
    drawDriver(ctx,3,0,.42);
    if(moving&&!api.reducedMotion()){ctx.strokeStyle='#47eaff66';ctx.lineWidth=3;for(let i=0;i<3;i++){const offset=(time*70+i*22)%60;ctx.beginPath();ctx.moveTo(-70-offset,-12+i*12);ctx.lineTo(-57-offset,-12+i*12);ctx.stroke();}}
    ctx.restore();
  }
  function treeCountText() {return tree?`${modelSamples.length} 条示范 · 第 ${modelRevision} 版模型`:'从你的示范开始学习';}
  function drawRoadConditions(ctx:CanvasRenderingContext2D,f:Features,category:Category,time:number,elapsed:number) {
    const motion=api.reducedMotion()?0:time;
    if(f.road==='wet') {
      ctx.fillStyle='#47eaff24';for(const [x,y,w] of [[230,312,100],[430,215,85],[720,319,110]]) {ctx.beginPath();ctx.ellipse(x,y,w,7,0,0,Math.PI*2);ctx.fill();}
      ctx.strokeStyle='#8ddcff70';ctx.lineWidth=1.2;for(let i=0;i<30;i++) {const x=(i*73+motion*34)%1000,y=88+(i*41+motion*155)%260;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+12);ctx.stroke();}
    }
    if(category==='night') {
      ctx.fillStyle='#04081338';ctx.fillRect(0,84,1000,289);
      ctx.fillStyle='#fff1b8';ctx.beginPath();ctx.arc(388,110,15,0,Math.PI*2);ctx.fill();
      if(f.road==='curve') {roundRect(ctx,435,108,100,32,7,'#403a2b','#f5bc65');label(ctx,'前方弯道 ↗',446,130,13,'#fde68a');}
    }
    if(f.hazard!=='none') {
      if(f.hazard==='parked') {drawTopCar(ctx,661,235,'#e8c781',false,time);label(ctx,'停放车辆占道',608,195,12,'#f5bc65');}
      else {
        roundRect(ctx,615,211,100,49,5,'#443038','#f5bc65');
        ctx.save();ctx.beginPath();ctx.rect(615,211,100,49);ctx.clip();ctx.strokeStyle='#ffcd73';ctx.lineWidth=9;
        for(let x=595;x<750;x+=23) {ctx.beginPath();ctx.moveTo(x,210);ctx.lineTo(x-32,262);ctx.stroke();}ctx.restore();
        label(ctx,f.hazard==='blocked'?'道路封闭':'前方施工',628,196,12,'#f5bc65');
        for(const x of [595,736]) {ctx.fillStyle='#ee9b5c';ctx.beginPath();ctx.moveTo(x,218);ctx.lineTo(x-9,255);ctx.lineTo(x+9,255);ctx.closePath();ctx.fill();ctx.fillStyle='#fff0d5';ctx.fillRect(x-5,237,10,5);}
      }
      if(f.lane==='open'&&f.hazard!=='blocked') {
        ctx.strokeStyle='#47eaff80';ctx.lineWidth=2;ctx.setLineDash([7,7]);ctx.beginPath();ctx.moveTo(370,235);ctx.bezierCurveTo(470,235,445,307,525,307);ctx.lineTo(755,307);ctx.bezierCurveTo(830,307,820,235,925,235);ctx.stroke();ctx.setLineDash([]);
        label(ctx,'已确认可安全借道 →',601,331,12,'#47eaff');
      } else {roundRect(ctx,601,280,143,43,7,'#442c3c');label(ctx,'不可借道 · 提前停车',610,306,11,'#ffc6d9');}
    }
    if(f.priority==='emergency') {
      const x=live?Math.min(f.signal==='green'?1000:310,-240+elapsed*230):347;
      ctx.save();ctx.translate(x,235);roundRect(ctx,-56,-23,112,46,8,'#edf4fa','#91bde4');
      roundRect(ctx,23,-17,23,34,5,'#334f6c');ctx.fillStyle='#ee82a9';ctx.fillRect(-24,-13,7,25);ctx.fillRect(-33,-4,25,7);
      roundRect(ctx,-6,-27,23,5,2,motion%1>.5?'#ed71bd':'#47eaff');
      ctx.fillStyle='#101a2c';for(const [wx,wy] of [[-32,-27],[35,-27],[-32,21],[35,21]]) ctx.fillRect(wx,wy,17,6);
      ctx.restore();label(ctx,'急救车接近 · 留出通道',319,365,12,'#ffc6d9');
    }
    if(f.priority==='cyclist') {
      const x=live?560+Math.min(310,elapsed*64):654,y=live?175+(f.hazard==='none'?60:132)*Math.min(1,elapsed/1.8):223;
      ctx.strokeStyle='#ffc575';ctx.lineWidth=3;for(const wx of [x-14,x+14]) {ctx.beginPath();ctx.arc(wx,y+12,9,0,Math.PI*2);ctx.stroke();}
      ctx.beginPath();ctx.moveTo(x-14,y+12);ctx.lineTo(x,y);ctx.lineTo(x+14,y+12);ctx.lineTo(x-14,y+12);ctx.stroke();
      ctx.fillStyle='#d8f3ff';ctx.beginPath();ctx.arc(x,y-20,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#bc98ff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,y-11);ctx.lineTo(x-5,y+3);ctx.lineTo(x+7,y+10);ctx.stroke();
      label(ctx,'骑行者汇入 · 先让行',716,180,12,'#ffc575');
    }
  }
  function drawWorld(ctx:CanvasRenderingContext2D,time:number) {
    canvasTime=time;
    const e=live?districtTests(live.district)[live.index]:selectedExample(),f=e.features;
    const vehicle=api.getVehicle();
    nightBackdrop(ctx,1000,520,true);
    roundRect(ctx,22,20,956,62,18,'#111c32');drawDriver(ctx,58,50,.68);
    label(ctx,'小司机 · 芽芽',93,45,18,'#e8f3ff',700);label(ctx,treeCountText(),93,65,12,'#a6bad0');
    const statusText=live?`街区 ${live.district.toUpperCase()}  /  ${live.index+1} · ${e.title}`:'示范工位  /  '+e.title;
    label(ctx,statusText,410,48,17,'#e8f3ff',700);
    if(live?.paused) {roundRect(ctx,842,32,112,34,14,'#48334a');label(ctx,'试跑已暂停',854,54,13,'#f5bc65');}
    else {roundRect(ctx,862,32,88,34,14,'#163d40');label(ctx,live?'正在检验':'等待示范',878,54,13,'#a6bad0');}
    // Night city landmarks keep the road and model decisions readable.
    ctx.fillStyle='#173344';ctx.fillRect(0,164,1000,27);ctx.fillRect(0,349,1000,28);
    ctx.fillStyle='#18263d';ctx.fillRect(0,191,1000,158);
    ctx.fillStyle='#263e58';ctx.fillRect(0,197,1000,6);ctx.fillRect(0,337,1000,6);
    ctx.strokeStyle='#47eaffb8';ctx.lineWidth=3;ctx.setLineDash([26,22]);ctx.beginPath();ctx.moveTo(0,270);ctx.lineTo(1000,270);ctx.stroke();ctx.setLineDash([]);
    for(let x=0;x<1000;x+=75){roundRect(ctx,x,173,45,4,2,'#ed71bd90');roundRect(ctx,x,360,45,4,2,'#ed71bd90');}
    // Crosswalk and stop line are actual landmarks for the animated decision.
    for(let y=210;y<334;y+=21) roundRect(ctx,616,y,62,12,2,'#b8d7e5');
    ctx.fillStyle='#d6f4ff';ctx.fillRect(568,207,5,55);
    const buildingColor=f.road==='school'?'#2b2c4b':'#173c47';
    roundRect(ctx,689,93,196,62,8,buildingColor);roundRect(ctx,679,84,216,20,6,f.road==='school'?'#bc98ff':'#75f1bb');
    for(let i=0;i<4;i++) roundRect(ctx,706+i*41,111,25,27,3,'#47eaff80');
    roundRect(ctx,772,117,28,38,3,'#24445a');label(ctx,f.road==='school'?'新 芽 学 校':f.road==='wet'?'雨 后 街 道':f.road==='curve'?'湖 畔 弯 道':'薄 荷 公 园',716,101,13,'#e8f3ff',700);
    for(const [x,y,s] of [[120,126,1],[228,136,.8],[930,133,.9],[70,408,.8],[879,420,1.2],[936,407,.7]]) {
      ctx.fillStyle='#456078';ctx.fillRect(x-3,y,6,27*s);ctx.fillStyle='#224755';ctx.beginPath();ctx.arc(x,y-7,22*s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2b5a60';ctx.beginPath();ctx.arc(x-10*s,y-14,14*s,0,Math.PI*2);ctx.fill();
    }
    // Signal is presented as a structured feature, not inferred from a picture.
    ctx.strokeStyle='#5a7797';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(592,125);ctx.lineTo(592,187);ctx.stroke();
    roundRect(ctx,576,98,33,84,10,'#0c172a');
    for(const [y,colour,active] of [[113,'#ff6e91',f.signal==='red'],[139,'#f5bc65',f.signal==='yellow'],[165,'#75f1bb',f.signal==='green']] as const) {ctx.fillStyle=active?colour:'#32435e';ctx.beginPath();ctx.arc(592,y,8,0,Math.PI*2);ctx.fill();}
    // A second car creates context but never changes the structured model input.
    if(f.hazard==='none'&&f.priority==='none') drawTopCar(ctx,848,307,'#e8c781',false,time);
    drawRoadConditions(ctx,f,e.category,time,live?.elapsed??0);
    if(f.visibility==='limited') {
      ctx.fillStyle='rgba(149,181,216,.30)';ctx.fillRect(0,84,1000,289);
      for(let i=0;i<4;i++){ctx.fillStyle='rgba(172,204,232,.14)';ctx.beginPath();ctx.ellipse(180+i*260+(api.reducedMotion()?0:Math.sin(time*.3+i)*20),175+i%2*98,230,48,0,0,Math.PI*2);ctx.fill();}
      roundRect(ctx,322,118,155,32,12,'#20314b');label(ctx,'已知线索：视线受限',336,139,12,'#a6bad0');
    }
    const pose=live?actionPose(live.result.actualAction,live.elapsed):{x:155,y:235,moving:false};
    const carX=pose.x,moving=pose.moving;
    if(f.pedestrian==='crossing') {
      const progress=live?Math.min(1,live.elapsed/4.4):.42,pedY=165+progress*210,pedX=641;
      ctx.fillStyle='#b9d5e1';ctx.beginPath();ctx.arc(pedX,pedY-13,8,0,Math.PI*2);ctx.fill();roundRect(ctx,pedX-9,pedY-5,18,24,6,'#ed71bd');
      ctx.strokeStyle='#bc98ff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(pedX-4,pedY+17);ctx.lineTo(pedX-6-(api.reducedMotion()?0:Math.sin(time*7)*3),pedY+28);ctx.moveTo(pedX+4,pedY+17);ctx.lineTo(pedX+6+Math.sin(time*7)*3,pedY+28);ctx.stroke();
    }
    drawTopCar(ctx,carX,pose.y,vehicle.color,moving,time);
    const activeAction=live?.prediction.action??samples.find(s=>s.id===selectedId)?.action;
    roundRect(ctx,Math.max(85,Math.min(carX-65,835)),147,130,34,12,'#111c32','#456385');
    label(ctx,live?`模型：${ACTION_TEXT[live.prediction.action]}`:activeAction?`你示范：${ACTION_TEXT[activeAction]}`:'我该怎么做？',Math.max(95,Math.min(carX-51,849)),169,14,'#e8f3ff',700);
    if(live?.result.intercepted&&live.elapsed>.7) {roundRect(ctx,315,302,240,32,12,'#493540');label(ctx,`安全教练接管 → ${ACTION_TEXT[live.result.actualAction]}`,332,324,14,'#f5bc65',700);}
    // Bottom note is a compact visible record of the model's real reasoning.
    roundRect(ctx,26,389,948,109,18,'#111c32');drawCar(ctx,91,451,vehicle.color,.53,time*(moving?4:0),vehicle.body);
    label(ctx,live?'这一次，它先看了什么？':'输入给模型的道路线索',167,419,16,'#e8f3ff',700);
    const featureLabels=[f.signal==='yellow'?'黄灯 · 能安全停':VALUE_NAMES[f.signal],f.pedestrian==='crossing'?'行人横穿':'无横穿行人',VALUE_NAMES[f.road],f.visibility==='limited'?'视线受限':'视线清晰',f.hazard==='none'?'无占道障碍':VALUE_NAMES[f.hazard],f.hazard==='none'?'保持原车道':VALUE_NAMES[f.lane],f.priority==='none'?'无优先通行者':VALUE_NAMES[f.priority]];
    featureLabels.forEach((text,i)=>{const x=166+i*112;roundRect(ctx,x,431,105,30,7,'#1b2b44');label(ctx,text,x+6,451,10,'#a6bad0');});
    const insight=live?live.prediction.path.slice(0,3).join(' → '):'先选择动作记录示范。模型生成后，会按示范中的信息差异建立决策树。';
    label(ctx,insight.length>71?insight.slice(0,70)+'…':insight,167,483,12,'#a6bad0');
    if(time<driverMessageUntil) {roundRect(ctx,94,88,370,39,12,'#453648');label(ctx,'我会学你的示范，也需要新情境帮我发现盲区。',106,113,13,'#f5bc65');}
  }
  const stage=createStage($('#ai-stage'),{label:'小司机道路训练与决策树检验场景',width:1000,height:520,draw:drawWorld,
    update(dt){if(disposed||!live||live.paused) return;live.elapsed+=dt*runSpeed;const total=districtTests(live.district).length,progress=Math.min(total,live.index+live.elapsed/5.1);$('#ai-progress-fill').style.width=`${progress/total*100}%`;$('.ai-progress-track').setAttribute('aria-valuenow',String(Math.min(total,Math.floor(progress))));if(live.elapsed>=5.1) finishEvent();},
    pointer(kind,x,y){if(kind==='down'&&x<105&&y<85) driverMessageUntil=canvasTime+4;}
  });
  render();
  return {destroy(){disposed=true;stage.destroy();root.remove();}};
}
