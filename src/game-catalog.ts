export const GAME_IDS = ['perception', 'factory', 'ai', 'regen', 'parking', 'repair', 'charging', 'grip'] as const;
export type CatalogGameId = typeof GAME_IDS[number];
export const GAME_POINTS = 100;
export const MAX_SCORE = GAME_IDS.length * GAME_POINTS;
export const GAME_META: Record<CatalogGameId, { title: string; subtitle: string; icon: string; tag: string; description: string; short: string }> = {
  perception: { title: '汽车的超级眼睛', subtitle: '滑动、扫描、发现：换个视角看城市。', icon: 'eye', tag: 'PERCEPTION LAB · 感知', description: '打开汽车的超级视界，发现道路里的秘密。', short: '超级眼睛' },
  factory: { title: '我的新能源车厂', subtitle: '造一辆有个性的车，接任务，挑战三星车手。', icon: 'car', tag: 'EV GARAGE · 创造', description: '装配三款个性小车，在途中路况挑战里争取三星。', short: '造车工厂' },
  ai: { title: '我教的 AI 小司机', subtitle: '给它一点示范，看看它学会了什么。', icon: 'ai', tag: 'AI DRIVING · 训练', description: '亲手教一个小司机，陪它在城市里练习。', short: 'AI 司机' },
  regen: { title: '刹车充电秀', subtitle: '停得漂亮，也看看能量去了哪里。', icon: 'bolt', tag: 'ENERGY TRACK · 探索', description: '轻轻刹车，让看不见的能量流动起来。', short: '能量回收' },
  parking: { title: '自动泊车训练营', subtitle: '拖弯光轨，按住试停，松手就暂停。', icon: 'parking', tag: 'PARKING LAB · 规划', description: '让光轨跟着手弯曲，把自己的小车停进车位。', short: '自动泊车' },
  repair: { title: '汽车故障急救站', subtitle: '扫描光跟着手，找到断点再换件复测。', icon: 'repair', tag: 'REPAIR LAB · 检测', description: '拖动扫描器看剖面，收集证据修好小车。', short: '故障急救' },
  charging: { title: '充电站小站长', subtitle: '拖线接车，看见功率与电量的变化。', icon: 'plug', tag: 'CHARGING LAB · 调度', description: '亲手接上发光电缆，把有限电力分给排队小车。', short: '充电站' },
  grip: { title: '雨天抓地力挑战', subtitle: '拖滑块改条件，按住双车出发，拖回放比轨迹。', icon: 'rain', tag: 'GRIP LAB · 对照', description: '让雨水随滑动变化，看两辆小车留下不同轮迹。', short: '雨天抓地力' }
};
