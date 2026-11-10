import type { AppState, GameId, GameProgress, Vehicle } from './types';

import { GAME_IDS, GAME_POINTS } from './game-catalog.ts';
export { GAME_IDS } from './game-catalog.ts';
const emptyProgress = (): GameProgress => ({ awards: {}, completed: false, data: {} });
export function initialState(): AppState {
  return { version: 1, profile: { nickname: '小工程师', workstation: '01' },
    vehicle: { name: '我的未来号', color: '#75d1a0', battery: 45, motor: 80, body: 'city' },
    progress: Object.fromEntries(GAME_IDS.map(id => [id, emptyProgress()])) as Record<GameId, GameProgress>, muted: true, reducedMotion: false };
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
    fresh.reducedMotion = raw.reducedMotion === true;
    if (raw.vehicle && typeof raw.vehicle.name === 'string') fresh.vehicle = { ...fresh.vehicle, ...raw.vehicle };
    for (const id of GAME_IDS) {
      const saved = raw.progress?.[id];
      if (saved && typeof saved === 'object') fresh.progress[id] = {
        awards: saved.awards && typeof saved.awards === 'object' ? saved.awards : {},
        completed: saved.completed === true,
        data: saved.data && typeof saved.data === 'object' ? saved.data : {},
        ...(typeof saved.image === 'string' && saved.image.startsWith('data:image/') ? { image: saved.image } : {})
      };
    }
  } catch { /* Storage can be unavailable in private/file browsing; session still works. */ }
  return fresh;
}
export function persist(state: AppState): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch {
    // Keep all structured records; omit only screenshots from the persisted copy.
    const compact = { ...state, progress: Object.fromEntries(GAME_IDS.map(id => {
      const { image: _image, ...record } = state.progress[id]; return [id, record];
    })) };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compact)); } catch { /* In-memory export remains available. */ }
    return false;
  }
}
export function score(progress: GameProgress): number {
  return Math.round(Math.min(GAME_POINTS, Object.values(progress.awards).reduce((sum, award) => sum + Math.max(0, Number(award?.points) || 0), 0)));
}
export function totalScore(state: AppState): number { return GAME_IDS.reduce((sum, id) => sum + score(state.progress[id]), 0); }
export function sanitizeVehicle(vehicle: Vehicle): Vehicle {
  return { ...vehicle, name: vehicle.name.slice(0, 24), color: /^#[\da-f]{6}$/i.test(vehicle.color) ? vehicle.color : '#75d1a0' };
}
