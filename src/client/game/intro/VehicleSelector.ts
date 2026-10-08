/**
 * Choix du véhicule côté client : celui que le serveur a désigné dans le plan.
 * (La règle « nombre de joueurs → véhicule » vit dans `@shared/content/vehicles`, utilisée par le serveur.)
 */
import type { IntroPlan } from '@shared/content/intro';
import { getVehicleForPlayerCount, vehicleById, type VehicleDefinition } from '@shared/content/vehicles';

export { getVehicleForPlayerCount };

export function resolveVehicle(plan: IntroPlan): VehicleDefinition {
  return vehicleById(plan.vehicleId) ?? getVehicleForPlayerCount(plan.occupants.length);
}
