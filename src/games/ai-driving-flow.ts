import type { RoadEvent } from './ai-brain-model';

export const AI_DECISION_SECONDS = 5.5;
const RED_LIGHT_WAIT_SECONDS = 1.1;

/** A stopped car must be able to finish waiting even when it stopped early. */
export function advanceRedLightWait(ev: RoadEvent, speedKmh: number, dt: number): boolean {
  if (ev.state !== 'executing' || ev.scenarioId !== 'redlight' || ev.lightGreen) return false;
  if (!Number.isFinite(speedKmh) || Math.abs(speedKmh) > 1 || !Number.isFinite(dt) || dt <= 0) return false;

  ev.timer += dt;
  if (ev.timer < RED_LIGHT_WAIT_SECONDS) return false;
  ev.lightGreen = true;
  return true;
}
