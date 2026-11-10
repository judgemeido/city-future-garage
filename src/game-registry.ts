import type { GameId, MountGame } from './types';
import { mountPerception } from './games/perception';
import { mountFactory } from './games/factory';
import { mountAI } from './games/ai';
import { mountRegen } from './games/regen';
import { mountParking } from './games/parking';
import { mountRepair } from './games/repair';
import { mountCharging } from './games/charging';
import { mountGrip } from './games/grip';
export { GAME_IDS, GAME_META, MAX_SCORE } from './game-catalog';
export const mounts: Record<GameId, MountGame> = {
  perception: mountPerception, factory: mountFactory, ai: mountAI, regen: mountRegen,
  parking: mountParking, repair: mountRepair, charging: mountCharging, grip: mountGrip
};
