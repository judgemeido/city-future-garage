export type ChallengeRoute = 'city' | 'hill' | 'range';
export interface Choice { title: string; explanation: string; correct: boolean }
export interface RoadEvent { title: string; scene: string; question: string; choices: Choice[]; at: number }
export interface Challenge {
  events: RoadEvent[]; index: number; mistakes: number; retried: boolean;
  answers: { title: string; choice: string; explanation: string; firstTry: boolean }[];
}
type EventRecipe = [string, string, string, string, string, string, string];
// Each recipe gives one sound action and two tempting shortcuts, with feedback.
const RECIPES: Record<ChallengeRoute, EventRecipe[][]> = {
  city: [
    [
      ['斑马线前有人', '礼让行人', '前面有同学正在过斑马线，包裹也在车上。', '停车，等行人通过', '先让行人通过再出发，包裹晚一点也没关系。', '鸣笛催促后通过', '贴着行人绕过去'],
      ['红灯亮起来了', '红灯停车', '校园路口亮起红灯，前面暂时没有人。', '停在停止线前等待', '红灯时也要在线前停车，不能只凭有没有人判断。', '没人才直接通过', '加速抢过路口'],
    ],
    [
      ['包裹怕颠簸', '减速带', '前方是一排减速带，后备厢里装着易碎模型。', '提前减速，平稳通过', '提前降低速度，比到了减速带再急刹更平稳。', '加速飞过减速带', '压上减速带再急刹'],
      ['转角看不清', '视线遮挡', '停着的校车挡住了转角，后面可能有同学。', '减速观察，随时准备停', '遮挡后可能出现行人，先减速才能留出反应空间。', '鸣笛后保持原速', '加速赶紧穿过去'],
    ],
    [
      ['最后一件快递', '安全送达', '收件点在道路另一侧，你该把车停在哪里？', '驶入指定卸货区', '先在指定区域停稳，再卸货，不堵住通道。', '直接停在斑马线上', '停在路口中间卸货'],
      ['前面有骑车同学', '保持距离', '一位骑车的同学在前面行驶，道路比较窄。', '保持距离，耐心跟随', '给骑车的人留出空间，等道路条件允许再超越。', '贴近后不断鸣笛', '从路边窄缝挤过去'],
    ],
  ],
  hill: [
    [
      ['重载坡道起步', '坡道起步', '车上多了 300 kg 物资，现在要从坡道起步。', '保持制动，平稳建立驱动力', '先防止溜车，再平稳起步；电池供电和电机扭矩都要匹配。', '先松刹车再找动力', '猛踩加速让车冲上去'],
      ['坡底配车检查', '动力匹配', '装了大电机，爬坡却仍然吃力，先检查什么？', '电池供电和整车负担', '电机大不等于供电足，还要看电池功率和车重。', '只换更大的电机', '换个车身颜色就好'],
    ],
    [
      ['弯道突然收窄', '山路会车', '前方窄弯有一辆车驶来，路边有安全让行区。', '减速进入让行区等待', '提前让行，留出会车空间，不在窄弯争抢。', '加速抢先进入窄弯', '停在窄弯正中间'],
      ['碎石铺满路面', '碎石缓行', '坡道上有一段碎石，轮胎容易打滑。', '平稳减速，轻柔控制动力', '碎石路附着力低，突然加速或急打方向更容易失稳。', '猛加速把碎石甩开', '大幅左右摆动车身'],
    ],
    [
      ['到坡顶也别冲', '坡顶盲区', '就要翻过坡顶，但还看不到坡后的路面。', '降低速度，观察后再走', '坡顶会遮挡视线，先慢下来才能应对另一侧的情况。', '加速利用惯性飞过', '只看电量不用看路'],
      ['物资有点松动', '固定货物', '听到后面的物资在滑动，前方有安全停靠区。', '安全停靠后重新固定', '货物移动会影响稳定性，停稳处理后再继续。', '一边开车一边回头扶', '加速让货物压在后面'],
    ],
  ],
  range: [
    [
      ['远行先算一算', '规划续航', '开始长途前，怎样判断电量能不能到达？', '结合路线、能耗和电量规划', '容量、车重和行驶条件共同影响续航，不能只看电机大小。', '电机越大一定越远', '只看车身够不够酷'],
      ['行李越装越多', '轻装出发', '朋友准备带上很多用不到的物品，怎样更合适？', '保留必需品，减少多余负担', '在保障出行需要的前提下减少载重，有助于降低能耗。', '全部装上反正有电', '换更大电机抵消重量'],
    ],
    [
      ['服务区到了', '补能规划', '电量偏低，前方服务区能充电，下一站还很远。', '进入服务区安排补能', '先规划补能再出发；这道题考察判断，不会凭空给试跑电池加电。', '关闭电量显示继续开', '等完全没电再想办法'],
      ['风越来越大', '平稳巡航', '迎风路段能耗上升，怎样开得更稳妥？', '合理降低速度，平稳巡航', '较高车速下风阻更大，合理降速有助于减少能耗。', '反复急加速急刹车', '贴近前车借风挡'],
    ],
    [
      ['雨中的最后一程', '雨天车距', '下起了雨，前车的尾灯也有些模糊。', '减速并加大跟车距离', '湿滑路面和低能见度下，需要更低车速与更大安全距离。', '紧跟尾灯就不会迷路', '急打方向试试抓地力'],
      ['有点困了', '服务区休息', '离目的地不远了，小司机却开始犯困。', '在安全服务区停车休息', '困倦时要在安全地点休息，不能靠加速或强撑解决。', '开快一点早点到', '开大音乐硬撑到底'],
    ],
  ],
};

export function createChallenge(route: ChallengeRoute, attempt: number): Challenge {
  const seed = Math.max(0, Math.floor(Number.isFinite(attempt) ? attempt : 0));
  const events = RECIPES[route].map((variants, index) => {
    const [title, scene, question, good, explanation, wrongA, wrongB] = variants[seed % variants.length];
    const choices: Choice[] = [
      { title: good, explanation, correct: true },
      { title: wrongA, explanation: `这个办法不稳妥。${explanation}`, correct: false },
      { title: wrongB, explanation: `再想一想。${explanation}`, correct: false },
    ];
    const rotation = (seed + index) % 3;
    return { title, scene, question, choices: [...choices.slice(rotation), ...choices.slice(0, rotation)], at: [.2, .47, .74][index] };
  });
  return { events, index: 0, mistakes: 0, retried: false, answers: [] };
}

export function answerEvent(state: Challenge, choiceIndex: number): Challenge {
  const event = state.events[state.index];
  if (!event || !Number.isInteger(choiceIndex) || !event.choices[choiceIndex]) return state;
  const choice = event.choices[choiceIndex];
  if (!choice.correct) return { ...state, mistakes: state.mistakes + 1, retried: true };
  return { ...state, index: state.index + 1, retried: false, answers: [...state.answers,
    { title: event.title, choice: choice.title, explanation: choice.explanation, firstTry: !state.retried }] };
}

export function challengeStars(state: Challenge, ratio: number): number {
  if (state.answers.length !== 3) return 0;
  const firstTries = state.answers.filter(a => a.firstTry).length;
  return (ratio >= .999 ? 1 : 0) + (firstTries >= 2 ? 1 : 0) + (firstTries === 3 ? 1 : 0);
}
