import type { AppState, GameId, GameProgress, Vehicle } from './types';

export const GAME_IDS: GameId[] = ['perception', 'factory', 'ai', 'regen'];
const emptyProgress = (): GameProgress => ({ awards: {}, completed: false, data: {} });
export function initialState(): AppState {
  return { version: 1, profile: { nickname: '小工程师', workstation: '01' },
    vehicle: { name: '我的未来号', color: '#75d1a0', battery: 45, motor: 80, body: 'city' },
    progress: { perception: emptyProgress(), factory: emptyProgress(), ai: emptyProgress(), regen: emptyProgress() }, muted: true };
}
const STORAGE_KEY = 'city-future-garage-v1';
export function loadState(): AppState {
  const fresh = initialState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || raw.version !== 1) return fresh;
    fresh.profile.nickname = String(raw.profile?.nickname || fresh.profile.nickname).slice(0, 20);
    fresh.profile.workstation = String(raw.profile?.workstation || '01').slice(0, 8);
    fresh.muted = raw.muted !== false;
    if (raw.vehicle && typeof raw.vehicle.name === 'string') fresh.vehicle = { ...fresh.vehicle, ...raw.vehicle };
    for (const id of GAME_IDS) {
      if (raw.progress?.[id]) fresh.progress[id] = { ...emptyProgress(), ...raw.progress[id] };
    }
  } catch { /* Storage can be unavailable in private/file browsing; session still works. */ }
  return fresh;
}
export function persist(state: AppState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the in-memory session and exports available. */ }
}
export function score(progress: GameProgress): number {
  return Math.round(Math.min(100, Object.values(progress.awards).reduce((sum, award) => sum + Math.max(0, Number(award.points) || 0), 0)));
}
export function totalScore(state: AppState): number { return GAME_IDS.reduce((sum, id) => sum + score(state.progress[id]), 0); }
export function sanitizeVehicle(vehicle: Vehicle): Vehicle {
  return { ...vehicle, name: vehicle.name.slice(0, 24), color: /^#[\da-f]{6}$/i.test(vehicle.color) ? vehicle.color : '#75d1a0' };
}
