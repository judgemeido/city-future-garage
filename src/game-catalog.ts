export const GAME_IDS = ['perception', 'factory', 'ai', 'regen', 'parking', 'repair', 'charging', 'grip'] as const;
export type CatalogGameId = typeof GAME_IDS[number];
export const GAME_POINTS = 100;
export const MAX_SCORE = GAME_IDS.length * GAME_POINTS;
export const GAME_META: Record<CatalogGameId, { title: string; subtitle: string; icon: string; tag: string; description: string; short: string }> = {
  perception: { title: '汽车的超级眼睛', subtitle: '滑动、扫描、发现：换个视角看城市。', icon: 'eye', tag: 'PERCEPTION LAB · 感知', description: '打开汽车的超级视界，发现道路里的秘密。', short: '超级眼睛' },
  factory: { title: '我的新能源车厂', subtitle: '选装六大部件，读懂整车参数，带自己的车挑战三星。', icon: 'car', tag: 'EV GARAGE · 创造', description: '搭配电池、电驱与车轮，查看完整参数图，再上路试一试。', short: '造车工厂' },
  ai: { title: '我教的 AI 小司机', subtitle: '12 类路况、6 种动作，教它应对更多道路。', icon: 'ai', tag: 'AI DRIVING · 训练', description: '选择 36 个情境做示范，再到 4 个街区检验小司机。', short: 'AI 司机' },
  regen: { title: '回能快递员', subtitle: '稳稳送到站，看见动能经电机回到电池。', icon: 'bolt', tag: 'ENERGY COURIER · 动能回收', description: '送快递、控下坡，用同一次刹停追踪能量的去向。', short: '能量回收' },
  parking: { title: '泊车领航员', subtitle: '测距离、拖弧线、点执行，解开自动泊车的秘密。', icon: 'parking', tag: 'PARKING NAVIGATOR · 科普闯关', description: '挑战倒库与侧方，用回声、车身足迹和转向实验找到入位路线。', short: '泊车领航员' },
  repair: { title: '汽车故障急救站', subtitle: '扫描光跟着手，找到断点再换件复测。', icon: 'repair', tag: 'REPAIR LAB · 检测', description: '拖动扫描器看剖面，收集证据修好小车。', short: '故障急救' },
  charging: { title: '充电站小站长', subtitle: '拖线接车，看见功率与电量的变化。', icon: 'plug', tag: 'CHARGING LAB · 调度', description: '亲手接上发光电缆，把有限电力分给排队小车。', short: '充电站' },
  grip: { title: '雨天抓地力挑战', subtitle: '拖滑块改条件，按住双车出发，拖回放比轨迹。', icon: 'rain', tag: 'GRIP LAB · 对照', description: '让雨水随滑动变化，看两辆小车留下不同轮迹。', short: '雨天抓地力' }
};
