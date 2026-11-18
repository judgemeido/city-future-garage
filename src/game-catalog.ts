export const GAME_IDS = ['factory', 'perception', 'ai', 'regen', 'parking', 'repair', 'charging', 'grip'] as const;
export type CatalogGameId = typeof GAME_IDS[number];
export const GAME_POINTS = 100;
export const MAX_SCORE = GAME_IDS.length * GAME_POINTS;
export const GAME_META: Record<CatalogGameId, { title: string; subtitle: string; icon: string; tag: string; description: string; short: string }> = {
  factory: { title: '未来智驾造车厂', subtitle: '装配激光雷达、超算芯片与三电系统，开启全息透视与风洞检视，导出你的整车参数图。', icon: 'car', tag: 'CYBER EV LAB · 智驾造车', description: '全息展台装配智驾套件与动力链，切换 X 光透视与风洞气流，生成专属整车核心参数图。', short: '造车工厂' },
  perception: { title: '汽车的超级眼睛', subtitle: '看清单、找目标：在实景照片中点出来，挑战六个关卡。', icon: 'eye', tag: 'PERCEPTION LAB · 感知', description: '放大照片找车辆、行人和地标，找齐清单才能完成关卡。', short: '超级眼睛' },
  ai: { title: '我教的 AI 小司机', subtitle: '边跑边教、慢动作接管纠错，亲眼看神经网络学会开车再去雨夜全自动路考。', icon: 'ai', tag: 'AI DRIVING · 大脑养成', description: '实时查看 AI 感知、思考与规划轨迹；一键示范教交规，体验数据污染与清洗，挑战放手毕业路考。', short: 'AI 司机' },
  regen: { title: '智驾回能领航员', subtitle: '调教 AI 的 V2X 超视距视野与 CRBS 回收策略，同屏 PK 急刹幽灵车，随时接管比拼谁更省电！', icon: 'bolt', tag: 'AI ECO-PILOT · 智驾回能', description: '结合 V2X 红绿灯倒计时、高精坡度地图与雷达跟车，亲眼对比 AI 预测性回能与传统急刹的能耗差距。', short: '能量回收' },
  parking: { title: '泊车领航员', subtitle: '亲手掌舵 D/R 档泊车，实时看见阿克曼轨迹弧线与超声波距离，还能一键看 AI 自动泊车！', icon: 'parking', tag: 'APA PARKING · 泊车大师', description: '真实前轮阿克曼转向驾驶，实时投射转弯圆心与 360° 超声波雷达，支持一键 APA 自动泊车示范。', short: '泊车领航员' },
  repair: { title: '智驾故障急诊室', subtitle: '实时复现幽灵急刹、雨雾失明、芯片过热与转向锁死，用示波器揪出真凶并实车验收！', icon: 'repair', tag: 'CYBER AD ER · 智驾排障', description: '双屏联动：上方看实时智驾路测故障与 MRC 安全冗余靠边，下方探查 5 大智驾硬件并对症修复验收。', short: '故障急救' },
  charging: { title: '智驾超充知识擂台', subtitle: '100 题中国智驾题库随机抽 10 题，每题 25 秒限时作答，普通/困难两档任选，终局由 AI 结合难度与剩余时间智能判题！', icon: 'plug', tag: 'AI QUIZ ARENA · 智驾中国', description: '从 100 道中国智能驾驶与超充生态题库随机抽 10 题，普通模式 5 简 + 5 难、困难模式 10 全难，每题 25 秒，终局 AI 智能判卷评分。', short: '充电站' },
  grip: { title: '雨天抓地力挑战', subtitle: '暴雨盘山闪避积水、弯前先减速再贴弯，实时透视「轮胎摩擦圆」与三款轮胎对比！', icon: 'rain', tag: 'RAIN GRIP · 摩擦圆挑战', description: '赛前秒换雨天胎/磨损胎，在暴雨连环弯中实时观察轮胎摩擦圆缩放，练出完美贴弯连击。', short: '雨天抓地力' }
};
