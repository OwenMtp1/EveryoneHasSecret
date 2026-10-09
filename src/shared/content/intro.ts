/**
 * Cinématique d'arrivée à la villa — configuration et plan partagé serveur/clients.
 * Le SERVEUR fige la composition, choisit le véhicule, le conducteur, les places et les animations,
 * et cadence les états. Les clients ne font que mettre en scène ce plan : tout le monde voit la même chose.
 */
import type { Character } from '../types';
import { getVehicleForPlayerCount, type VehicleDefinition } from './vehicles';

export interface IntroConfig {
  locationName: string;
  time: string;
  description: string;
  /** seconde ligne, plus lente */
  tagline: string;
}

export const INTRO_CONFIG: IntroConfig = {
  locationName: 'Villa Beaumont',
  time: '22h00',
  description: 'Soirée entre potes.',
  tagline: 'Personne ne savait encore ce qui allait arriver.',
};

export type GameIntroState = 'INTRO_START' | 'INTRO_CAR' | 'INTRO_POINT' | 'INTRO_REVEAL' | 'INTRO_VILLA' | 'GAME_START';

/** Chronologie : part de la durée totale consacrée à chaque état (somme = 1). GAME_START = fin. */
export const INTRO_TIMELINE: { state: Exclude<GameIntroState, 'GAME_START'>; share: number }[] = [
  { state: 'INTRO_START', share: 0.07 },
  { state: 'INTRO_CAR', share: 0.33 },
  { state: 'INTRO_POINT', share: 0.12 },
  { state: 'INTRO_REVEAL', share: 0.22 },
  { state: 'INTRO_VILLA', share: 0.26 },
];

/** Animations de passagers (procédurales, superposées à l'animation d'attente). */
export type IntroAnimation = 'drive' | 'talk' | 'laugh' | 'look' | 'dance';
export const PASSENGER_ANIMATIONS: IntroAnimation[] = ['talk', 'laugh', 'dance', 'look'];

export interface IntroOccupant {
  userId: string;
  name: string;
  character: Character;
  seatId: string;
  animation: IntroAnimation;
}

export interface IntroPlan {
  id: string;
  vehicleId: string;
  driverId: string;
  occupants: IntroOccupant[];
  /** personnage de la victime (plan final de la cinématique : découverte du corps) */
  victimCastId?: string;
  /** graine commune (fenêtre de la silhouette, variations) */
  seed: number;
  /** horodatage serveur du début de la cinématique */
  startedAt: number;
  durationMs: number;
  config: IntroConfig;
}

/** Bornes de chaque état en ms depuis le début. */
export function introSchedule(durationMs: number): { state: GameIntroState; at: number }[] {
  let at = 0;
  const out: { state: GameIntroState; at: number }[] = [];
  for (const s of INTRO_TIMELINE) {
    out.push({ state: s.state, at: Math.round(at) });
    at += s.share * durationMs;
  }
  out.push({ state: 'GAME_START', at: durationMs });
  return out;
}

export function introStateAt(durationMs: number, elapsedMs: number): GameIntroState {
  let cur: GameIntroState = 'INTRO_START';
  for (const s of introSchedule(durationMs)) if (elapsedMs >= s.at) cur = s.state;
  return cur;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Construit le plan de la cinématique : véhicule selon le nombre de joueurs, conducteur tiré au sort,
 * passagers répartis sur les places restantes, animations variées. Déterministe pour une graine donnée.
 */
export function buildIntroPlan(
  players: { userId: string; name: string; character: Character }[],
  opts: { id: string; seed: number; startedAt: number; durationMs: number; config?: IntroConfig; victimCastId?: string },
): IntroPlan {
  if (!players.length) throw new Error('Aucun joueur pour la cinématique.');
  const vehicle: VehicleDefinition = getVehicleForPlayerCount(players.length);
  const rand = seededRandom(opts.seed);
  const driverIdx = Math.floor(rand() * players.length);
  const driver = players[driverIdx];
  const passengers = players.filter((_, i) => i !== driverIdx);
  const driverSeat = vehicle.seats.find((s) => s.type === 'driver')!;
  const passengerSeats = vehicle.seats.filter((s) => s.type === 'passenger');
  // Animations : on parcourt la liste depuis un décalage aléatoire → variées, jamais toutes identiques
  const offset = Math.floor(rand() * PASSENGER_ANIMATIONS.length);
  const occupants: IntroOccupant[] = [{ ...driver, seatId: driverSeat.id, animation: 'drive' }];
  passengers.slice(0, passengerSeats.length).forEach((p, i) => {
    occupants.push({ ...p, seatId: passengerSeats[i].id, animation: PASSENGER_ANIMATIONS[(offset + i) % PASSENGER_ANIMATIONS.length] });
  });
  return {
    id: opts.id,
    vehicleId: vehicle.id,
    driverId: driver.userId,
    occupants,
    victimCastId: opts.victimCastId,
    seed: opts.seed,
    startedAt: opts.startedAt,
    durationMs: opts.durationMs,
    config: opts.config ?? INTRO_CONFIG,
  };
}
