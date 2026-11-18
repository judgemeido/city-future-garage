import type { GameAPI, MountedGame } from '../types';
import { mountAIDriving } from './ai-driving';

export function mountAI(host: HTMLElement, api: GameAPI): MountedGame {
  return mountAIDriving(host, api);
}
