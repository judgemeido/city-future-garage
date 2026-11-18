export type AdNodeId = 'camera' | 'lidar' | 'radar' | 'chip' | 'steer';
export type RepairFixId = 'calibrate_lidar' | 'replace_radar' | 'cool_chip' | 'replace_steer';

export interface AdNodeSpec {
  id: AdNodeId;
  name: string;
  short: string;
  role: string;
  icon: string;
  x: number; // canvas coordinates in lower architecture zone (1000x560)
  y: number;
}

export interface NodeReading {
  status: 'ok' | 'degraded' | 'fault' | 'downstream';
  metric: string;
  detail: string;
}

export interface RepairFixOption {
  id: RepairFixId;
  title: string;
  detail: string;
  icon: string;
}

export interface AdFaultCase {
  id: number;
  title: string;
  shortTitle: string;
  symptomTitle: string;
  symptomCopy: string;
  weather: 'clear' | 'rain';
  faultNode: AdNodeId;
  correctFix: RepairFixId;
  mrcExplanation: string;
  scienceTakeaway: string;
  readings: Record<AdNodeId, NodeReading>;
  fixedReadings: Record<AdNodeId, NodeReading>;
}

export const AD_NODES: AdNodeSpec[] = [
  { id: 'camera', name: '前视视觉摄像头', short: '摄像头', role: '识别红绿灯、车道线与行人外观', icon: '📷', x: 648, y: 342 },
  { id: 'lidar', name: '车顶激光雷达', short: '激光雷达', role: '发射激光构建 3D 空间点云', icon: '🟢', x: 525, y: 274 },
  { id: 'radar', name: '前向毫米波雷达', short: '毫米波雷达', role: '穿透雨雾精准测距与测速', icon: '🟠', x: 755, y: 410 },
  { id: 'chip', name: '智驾超算域控芯片', short: '超算芯片', role: '多传感器融合与毫秒级路径规划', icon: '🧠', x: 425, y: 396 },
  { id: 'steer', name: '线控底盘执行器', short: '线控转向', role: '把 AI 数字指令转为车轮转向制动', icon: '🛞', x: 245, y: 448 },
];

export const REPAIR_FIXES: RepairFixOption[] = [
  { id: 'calibrate_lidar', title: '清洗激光镜头并重标定外参', detail: '解决点云污损漂移、消除幽灵误报', icon: '🧹' },
  { id: 'replace_radar', title: '更换毫米波雷达与高频总线', detail: '恢复雨雾穿透测距与前车锁定', icon: '🔌' },
  { id: 'cool_chip', title: '修复液冷散热并刷新域控固件', detail: '消除芯片过热降频与决策高延迟', icon: '❄️' },
  { id: 'replace_steer', title: '更换双冗余线控转向电机', detail: '恢复底盘转向执行响应与脱手保护', icon: '🔧' },
];

export const AD_FAULT_CASES: AdFaultCase[] = [
  {
    id: 0,
    title: '病例 01 · 空旷大道「幽灵急刹」',
    shortTitle: '幽灵急刹',
    symptomTitle: '前方完全空旷，智驾车却疯狂原地急刹！',
    symptomCopy: '观察上方测试车道：路面空无一物，但车子每隔几秒就误判前方 12m 有巨大障碍物而猛踩刹车。快探查 5 大节点找出造谣的传感器！',
    weather: 'clear',
    faultNode: 'lidar',
    correctFix: 'calibrate_lidar',
    mrcExplanation: '🛡️ MRC 安全冗余已介入：系统自动屏蔽异常的激光雷达，改由「摄像头 + 毫米波雷达」投票接管，降速安全靠边！',
    scienceTakeaway: '当单个传感器（如激光雷达被泥水遮挡或外参偏移）输出虚假点云时，会引发“幽灵刹车”；多传感器交叉校验与定期标定是智驾安全的关键！',
    readings: {
      camera: { status: 'ok', metric: '30 FPS · 前方空旷', detail: '视觉画面清晰，未检测到任何障碍物' },
      lidar: { status: 'fault', metric: '点云漂移 · 误报 12m', detail: '镜头污损+外参偏移，持续输出虚假鬼影点云！' },
      radar: { status: 'ok', metric: '77 GHz · 无金属回波', detail: '前方 160m 内无车辆或金属障碍' },
      chip: { status: 'downstream', metric: '24 ms · 收到冲突告警', detail: '算力正常，但因激光雷达报 12m 危急障碍被迫触发 AEB' },
      steer: { status: 'ok', metric: '响应正常 · 执行急刹', detail: '按域控指令忠实执行了紧急制动' },
    },
    fixedReadings: {
      camera: { status: 'ok', metric: '30 FPS · 前方空旷', detail: '视觉画面清晰正常' },
      lidar: { status: 'ok', metric: '10 Hz · 点云精准', detail: '镜头清洁、外参标定完成，无虚假鬼影' },
      radar: { status: 'ok', metric: '77 GHz · 无障碍', detail: '回波信号稳定' },
      chip: { status: 'ok', metric: '22 ms · 融合一致', detail: '三传感器一致确认畅通，平稳巡航' },
      steer: { status: 'ok', metric: '线控响应正常', detail: '转向制动平滑精准' },
    },
  },
  {
    id: 1,
    title: '病例 02 · 暴雨夜「盲冲追尾」',
    shortTitle: '雨雾失明',
    symptomTitle: '暴雨夜里看不到前方慢车，触发紧急接管警报！',
    symptomCopy: '暴雨中摄像头能见度骤降，但正常智驾车本该靠“穿透雨雾”的传感器提前刹车——为什么这次完全没发现前车？',
    weather: 'rain',
    faultNode: 'radar',
    correctFix: 'replace_radar',
    mrcExplanation: '🛡️ MRC 安全冗余已介入：毫米波失联且暴雨视距极短，系统立刻打开双闪、自动限速 20 km/h 并提醒人工接管！',
    scienceTakeaway: '摄像头在暴雨大雾中极易衰减，毫米波雷达凭借更长波长几乎不受雨雾影响；只有“多传感器异构冗余”，智驾车才能全天候安全行驶！',
    readings: {
      camera: { status: 'degraded', metric: '暴雨遮挡 · 视距 18m', detail: '镜头本身没坏，但暴雨使视觉能见度大幅下降' },
      lidar: { status: 'degraded', metric: '雨滴散射 · 噪点偏高', detail: '激光正常发射，但大雨造成远距点云衰减' },
      radar: { status: 'fault', metric: 'CAN 总线断路 · 0 回波', detail: '前向毫米波雷达掉线无供电，彻底失去雨雾穿透测距！' },
      chip: { status: 'downstream', metric: '26 ms · 缺少雷达输入', detail: '算力正常，但未收到毫米波前车距离，无法提前减速' },
      steer: { status: 'ok', metric: '响应正常 · 等待指令', detail: '制动执行器待命正常' },
    },
    fixedReadings: {
      camera: { status: 'degraded', metric: '暴雨受限 · 辅助识别', detail: '近距车道线辅助正常' },
      lidar: { status: 'ok', metric: '近距点云正常', detail: '与雷达协同建模' },
      radar: { status: 'ok', metric: '77 GHz · 穿透锁定 95m', detail: '成功穿透暴雨锁定前方慢车距离与车速！' },
      chip: { status: 'ok', metric: '24 ms · 提前减速规划', detail: '融合雷达数据平稳提前减速跟车' },
      steer: { status: 'ok', metric: '平滑制动正常', detail: '安全拉开车距' },
    },
  },
  {
    id: 2,
    title: '病例 03 · 「大脑卡顿」反应慢半拍',
    shortTitle: '大脑卡顿',
    symptomTitle: '传感器全正常，但车子遇施工锥桶总是慢半拍险些撞上！',
    symptomCopy: '摄像头、激光雷达和毫米波全都看得清清楚楚，为什么方向盘要等快撞上锥桶才猛打？探测一下“眼睛”和“大脑”之间的耗时！',
    weather: 'clear',
    faultNode: 'chip',
    correctFix: 'cool_chip',
    mrcExplanation: '🛡️ MRC 安全冗余已介入：主超算芯片过热降频，备用低算力安全核立刻接管，只保留直线降速并安全停靠！',
    scienceTakeaway: '60 km/h 行驶时每延迟 0.5 秒车就会多冲出去 8.3 米！智驾超算芯片必须靠高效液冷散热把端到端决策延迟死死压在 30 ms 以内！',
    readings: {
      camera: { status: 'ok', metric: '30 FPS · 锥桶已识别', detail: '提前 80m 清晰识别前方占道施工锥桶' },
      lidar: { status: 'ok', metric: '10 Hz · 3D 轮廓完整', detail: '准确标出锥桶高度与车道边界' },
      radar: { status: 'ok', metric: '77 GHz · 测距正常', detail: '距离读数无延迟' },
      chip: { status: 'fault', metric: '98°C 过热 · 延迟 480ms!', detail: '液冷停转导致超算降频卡死，决策延迟飙升 20 倍！' },
      steer: { status: 'downstream', metric: '指令迟到 0.5s', detail: '执行器本身完好，但太晚收到转向指令！' },
    },
    fixedReadings: {
      camera: { status: 'ok', metric: '30 FPS · 清晰识别', detail: '正常输出视觉特征' },
      lidar: { status: 'ok', metric: '10 Hz · 点云正常', detail: '正常输出 3D 轮廓' },
      radar: { status: 'ok', metric: '77 GHz · 测距正常', detail: '正常输出距离速度' },
      chip: { status: 'ok', metric: '52°C · 延迟 22 ms!', detail: '液冷恢复满血 256 TOPS 算力，毫秒级规划绕行！' },
      steer: { status: 'ok', metric: '响应正常', detail: '精准平滑绕开施工区' },
    },
  },
  {
    id: 3,
    title: '病例 04 · 「线控转向」脱手卡死',
    shortTitle: '转向锁死',
    symptomTitle: '屏幕已画出完美绕障绿线，但方向盘纹丝不动直冲障碍！',
    symptomCopy: '传感器看到了障碍，AI 大脑也及时算出了向左变道 18° 的规划轨迹——可车轮为什么死死锁在 0° 不转弯？',
    weather: 'clear',
    faultNode: 'steer',
    correctFix: 'replace_steer',
    mrcExplanation: '🛡️ MRC 安全冗余已介入：主转向电机卡死，备用差动制动与双冗余通道立刻启用，平稳刹停避免碰撞！',
    scienceTakeaway: '智能驾驶要靠「线控底盘 (Drive-by-Wire)」把数字电信号转成真实机械力；L3/L4 车型必须配备双冗余转向电机与双电源，防止“大脑清醒、四肢失灵”！',
    readings: {
      camera: { status: 'ok', metric: '30 FPS · 障碍清晰', detail: '已锁定前方施工区' },
      lidar: { status: 'ok', metric: '10 Hz · 轮廓精准', detail: '左侧空车道已确认安全' },
      radar: { status: 'ok', metric: '77 GHz · 侧向无车', detail: '满足安全变道条件' },
      chip: { status: 'ok', metric: '23 ms · 已发左转 18°', detail: '规划轨迹与转向角指令全部正常下发' },
      steer: { status: 'fault', metric: '转角卡死 0° · 电机故障', detail: '线控转向执行器主绕组短路，无法执行大脑指令！' },
    },
    fixedReadings: {
      camera: { status: 'ok', metric: '30 FPS · 正常', detail: '正常识别' },
      lidar: { status: 'ok', metric: '10 Hz · 正常', detail: '正常建图' },
      radar: { status: 'ok', metric: '77 GHz · 正常', detail: '正常测距' },
      chip: { status: 'ok', metric: '23 ms · 指令正常', detail: '正常规划平滑绕行' },
      steer: { status: 'ok', metric: '双冗余在线 · 误差 <0.1°', detail: '线控转向丝滑跟随 AI 轨迹完成绕行！' },
    },
  },
];

export interface RepairAdState {
  caseIdx: number;
  probed: AdNodeId[];
  selectedNode: AdNodeId | null;
  selectedFix: RepairFixId | null;
  mrcActive: boolean;
  repaired: boolean;
  verified: boolean;
  wrongAttempts: number;
  feedback: string;
}

export function createRepairAdState(caseIdx = 0): RepairAdState {
  const idx = Math.max(0, Math.min(AD_FAULT_CASES.length - 1, caseIdx));
  return {
    caseIdx: idx,
    probed: [],
    selectedNode: null,
    selectedFix: null,
    mrcActive: false,
    repaired: false,
    verified: false,
    wrongAttempts: 0,
    feedback: AD_FAULT_CASES[idx].symptomCopy,
  };
}

export function probeAdNode(state: RepairAdState, nodeId: AdNodeId): NodeReading {
  const faultCase = AD_FAULT_CASES[state.caseIdx];
  if (!state.probed.includes(nodeId)) state.probed.push(nodeId);
  state.selectedNode = nodeId;
  const reading = state.repaired ? faultCase.fixedReadings[nodeId] : faultCase.readings[nodeId];
  const node = AD_NODES.find(n => n.id === nodeId)!;
  state.feedback = `🔍 探查「${node.name}」：${reading.metric} — ${reading.detail}`;
  return reading;
}

export function applyRepairFix(state: RepairAdState, fixId: RepairFixId): { ok: boolean; message: string } {
  const faultCase = AD_FAULT_CASES[state.caseIdx];
  state.selectedFix = fixId;
  if (state.repaired) return { ok: true, message: '故障已经修复完成！' };
  if (fixId === faultCase.correctFix) {
    state.repaired = true;
    state.mrcActive = false;
    state.feedback = `✅ 对症修复成功！正在实车路测验收「${faultCase.shortTitle}」是否彻底解决…`;
    return { ok: true, message: state.feedback };
  }
  state.wrongAttempts++;
  const fix = REPAIR_FIXES.find(f => f.id === fixId)!;
  state.feedback = `❌ 「${fix.title}」未能消除症状！请再探查车内 5 大节点或发射诊断信号流，找准真正报错的源头节点！`;
  return { ok: false, message: state.feedback };
}

export function repairAdStars(state: RepairAdState): number {
  if (!state.repaired) return 0;
  const foundFault = state.probed.includes(AD_FAULT_CASES[state.caseIdx].faultNode);
  if (state.wrongAttempts === 0 && foundFault) return 3;
  if (state.wrongAttempts <= 1) return 2;
  return 1;
}
