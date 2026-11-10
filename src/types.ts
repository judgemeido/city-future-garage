export type GameId = import('./game-catalog').CatalogGameId;
export interface Vehicle { name: string; color: string; battery: number; motor: number; body: string }
export interface Profile { nickname: string; workstation: string }
export interface GameProgress { awards: Record<string, { points: number; label: string }>; completed: boolean; data: Record<string, unknown>; image?: string }
export interface AppState { version: number; profile: Profile; vehicle: Vehicle; progress: Record<GameId, GameProgress>; muted: boolean; reducedMotion: boolean }
export interface GameAPI {
  award(game: GameId, key: string, points: number, label: string): void;
  complete(game: GameId): void;
  record(game: GameId, data: Record<string, unknown>): void;
  getRecord(game: GameId): Record<string, unknown>;
  saveImage(game: GameId, image: string): void;
  notify(message: string): void;
  getVehicle(): Vehicle;
  setVehicle(vehicle: Vehicle): void;
  getProfile(): Profile;
  reducedMotion(): boolean;
}
export interface MountedGame { destroy(): void }
export type MountGame = (host: HTMLElement, api: GameAPI) => MountedGame;
