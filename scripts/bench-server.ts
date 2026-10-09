/**
 * Mesure de charge du serveur de jeu : coût d'une simulation (20 Hz) et de la construction des vues
 * (12 Hz) pour une partie de 8 joueurs qui se déplacent en continu.
 *   node --import tsx scripts/bench-server.ts
 */
import { GameInstance } from '../src/server/game/GameInstance';
import { characterFromCast } from '../src/shared/content/character';
import { CAST } from '../src/shared/content/cast';

let t = 1_000_000;
const g = new GameInstance({
  id: 'bench',
  lobbyId: 'l',
  title: 'Bench',
  players: Array.from({ length: 8 }, (_, i) => ({ userId: `p${i}`, name: `${CAST[i * 5].firstName} ${CAST[i * 5].lastName}`, character: characterFromCast(CAST[i * 5]) })),
  emit: () => {},
  manual: true,
  now: () => t,
});
const ps = [...g.players.values()];
let sim = 0;
let views = 0;
let bytes = 0;
const frames = 2000;
for (let i = 0; i < frames; i++) {
  if (i % 40 === 0) for (const p of ps) g.setInput(p.id, Math.cos(i + p.id.length), Math.sin(i * 1.3 + Number(p.id.slice(1))), i % 80 === 0);
  t += 50;
  let s = performance.now();
  g.tick();
  sim += performance.now() - s;
  if (i % 2 === 0) {
    s = performance.now();
    for (const p of ps) bytes += JSON.stringify(i % 20 === 0 ? g.buildSelfView(p) : g.buildSnapshot(p)).length;
    views += performance.now() - s;
  }
}
const mem = process.memoryUsage();
console.log(`simulation : ${(sim / frames).toFixed(3)} ms par tick (budget 50 ms à 20 Hz)`);
console.log(`vues : ${(views / (frames / 2)).toFixed(3)} ms par diffusion pour 8 joueurs (budget 83 ms à 12 Hz)`);
console.log(`débit moyen sortant : ${((bytes / (frames / 2)) * 12 / 1024).toFixed(1)} Ko/s pour 8 joueurs`);
console.log(`mémoire : ${(mem.heapUsed / 1048576).toFixed(1)} Mo de tas`);
