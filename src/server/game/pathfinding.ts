/**
 * Portes ouvertes reliant deux pièces (ligne de vue entre pièces voisines).
 */
import { DOORS } from '@shared/content/villa';

export function doorsBetween(a: string, b: string, unlocked: Set<string>) {
  return DOORS.filter((d) => d.rooms.includes(a) && d.rooms.includes(b) && (!d.lockedBy || unlocked.has(d.id)));
}
