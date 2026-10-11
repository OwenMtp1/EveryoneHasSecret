/**
 * Système de marche partagé serveur / prédiction client : vitesse avec accélération, freinage et virages
 * progressifs (pas de passage instantané de l'arrêt à la course), puis déplacement avec collisions.
 * Le serveur et le client appliquent exactement les mêmes règles : la prédiction ne se fait pas recaler.
 */
import { GAME_CONFIG } from '../config';
import { stepMove } from './villa';

export interface Vel {
  x: number;
  y: number;
}

export const LOCOMOTION = {
  /** accélération au démarrage et dans les virages (m/s²) : ≈ 0,2 s pour atteindre la marche */
  accel: 10,
  /** freinage quand on relâche (m/s²) : arrêt en ≈ 0,15 s depuis la marche */
  decel: 14,
};

/** Fait tendre la vitesse vers la vitesse voulue (direction d'entrée × vitesse de marche ou de course). */
export function steer(vel: Vel, input: Vel, running: boolean, dt: number): void {
  const len = Math.hypot(input.x, input.y);
  const top = running ? GAME_CONFIG.runSpeed : GAME_CONFIG.walkSpeed;
  const tx = len > 0.01 ? (input.x / len) * top : 0;
  const ty = len > 0.01 ? (input.y / len) * top : 0;
  const dx = tx - vel.x;
  const dy = ty - vel.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const step = Math.min(d, (len > 0.01 ? LOCOMOTION.accel : LOCOMOTION.decel) * dt);
  vel.x += (dx / d) * step;
  vel.y += (dy / d) * step;
  if (Math.hypot(vel.x, vel.y) < 0.02 && len <= 0.01) vel.x = vel.y = 0;
}

/**
 * Avance selon la vitesse (murs, meubles, escaliers). Contre un obstacle, la composante bloquée de la vitesse
 * tombe : on glisse le long du mur au lieu d'y « pousser ». Retourne true en cas de changement de niveau.
 */
export function advance(pos: Vel, vel: Vel, dt: number, fits: (x: number, y: number) => boolean): boolean {
  if (!vel.x && !vel.y) return false;
  const bx = pos.x;
  const by = pos.y;
  const portal = stepMove(pos, vel.x * dt, vel.y * dt, fits);
  if (!portal && dt > 0) {
    const ax = (pos.x - bx) / dt;
    const ay = (pos.y - by) / dt;
    if (Math.abs(ax) < Math.abs(vel.x) - 1e-3) vel.x = ax;
    if (Math.abs(ay) < Math.abs(vel.y) - 1e-3) vel.y = ay;
  }
  return portal;
}
