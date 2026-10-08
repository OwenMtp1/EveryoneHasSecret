/**
 * Véhicules de la cinématique d'arrivée — décrits en données.
 * Ajouter un véhicule = ajouter une entrée ici (sièges, cadrages, gabarit) ; aucune logique à toucher.
 *
 * Repère d'un véhicule : origine au sol, au centre ; +z = avant ; +x = gauche du conducteur
 * (conduite à gauche : le conducteur est assis côté +x) ; unités en mètres.
 */

export type SeatType = 'driver' | 'passenger';

export interface VehicleSeat {
  id: string;
  type: SeatType;
  /** position du bassin (assise) dans le repère du véhicule */
  position: [number, number, number];
  /** rotation (radians) : [0, 0, 0] = regarde vers l'avant */
  rotation: [number, number, number];
}

export interface CameraShot {
  position: [number, number, number];
  lookAt: [number, number, number];
}

export interface VehicleCinematicConfig {
  /** plan intérieur de référence (devant le passager avant, regard vers le conducteur et l'arrière) */
  interiorCamera: CameraShot;
  /** plan extérieur final (relatif au véhicule) */
  exteriorCamera: CameraShot;
  /** recul de la caméra derrière le véhicule pendant la révélation */
  revealDistance: number;
  /** hauteur atteinte pendant la révélation */
  revealHeight: number;
  /** décalage latéral (vers la droite du véhicule, donc −x) */
  revealOffset: number;
}

/** Gabarit procédural du véhicule (en attendant de vrais modèles 3D). */
export interface VehicleAssets {
  /** modèle glTF facultatif — non fourni pour l'instant : le gabarit procédural est utilisé */
  model?: string;
  body: { length: number; width: number; height: number; color: string; roof: 'sedan' | 'van' };
}

export interface VehicleDefinition {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  seats: VehicleSeat[];
  cinematicConfig: VehicleCinematicConfig;
  assets: VehicleAssets;
}

const seat = (id: string, type: SeatType, x: number, y: number, z: number): VehicleSeat => ({ id, type, position: [x, y, z], rotation: [0, 0, 0] });

export const VEHICLES: VehicleDefinition[] = [
  {
    id: 'car',
    name: 'Berline',
    minPlayers: 2,
    maxPlayers: 4,
    seats: [
      seat('driver', 'driver', 0.38, 0.55, 0),
      seat('passenger_front', 'passenger', -0.38, 0.55, 0),
      seat('passenger_back_left', 'passenger', 0.4, 0.58, -0.85),
      seat('passenger_back_right', 'passenger', -0.4, 0.58, -0.85),
    ],
    cinematicConfig: {
      interiorCamera: { position: [-0.62, 1.2, 0.5], lookAt: [0.3, 1.02, -0.8] },
      exteriorCamera: { position: [-4.5, 5.5, -10], lookAt: [0, 1, 18] },
      revealDistance: 9,
      revealHeight: 5,
      revealOffset: 4,
    },
    assets: { body: { length: 4.6, width: 1.85, height: 1.45, color: '#1d2433', roof: 'sedan' } },
  },
  {
    id: 'minibus',
    name: 'Minibus',
    minPlayers: 5,
    maxPlayers: 8,
    seats: [
      seat('driver', 'driver', 0.48, 0.62, 1.55),
      seat('passenger_1', 'passenger', -0.48, 0.62, 1.55),
      seat('passenger_2', 'passenger', 0.48, 0.64, 0.45),
      seat('passenger_3', 'passenger', -0.48, 0.64, 0.45),
      seat('passenger_4', 'passenger', 0.48, 0.64, -0.6),
      seat('passenger_5', 'passenger', -0.48, 0.64, -0.6),
      seat('passenger_6', 'passenger', 0.48, 0.64, -1.65),
      seat('passenger_7', 'passenger', -0.48, 0.64, -1.65),
    ],
    cinematicConfig: {
      interiorCamera: { position: [-0.72, 1.45, 2.05], lookAt: [0.3, 1.1, -0.9] },
      exteriorCamera: { position: [-6.5, 7.5, -15], lookAt: [0, 1.5, 18] },
      revealDistance: 14,
      revealHeight: 7,
      revealOffset: 6,
    },
    assets: { body: { length: 5.9, width: 2.05, height: 2.25, color: '#d9d4c7', roof: 'van' } },
  },
];

/** Choisit le véhicule adapté au nombre de joueurs (le plus petit qui convient). */
export function getVehicleForPlayerCount(playerCount: number): VehicleDefinition {
  const fit = VEHICLES.filter((v) => playerCount >= v.minPlayers && playerCount <= v.maxPlayers).sort((a, b) => a.maxPlayers - b.maxPlayers)[0];
  if (fit) return fit;
  // Hors bornes : le plus grand véhicule pour trop de joueurs, le plus petit sinon
  const sorted = [...VEHICLES].sort((a, b) => a.maxPlayers - b.maxPlayers);
  return playerCount > sorted[sorted.length - 1].maxPlayers ? sorted[sorted.length - 1] : sorted[0];
}

export function vehicleById(id: string): VehicleDefinition | undefined {
  return VEHICLES.find((v) => v.id === id);
}
