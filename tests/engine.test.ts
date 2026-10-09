/**
 * Tests du moteur de jeu (sans réseau) : horloge injectée, simulation manuelle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameInstance } from '../src/server/game/GameInstance';
import { characterFromCast } from '../src/shared/content/character';
import { CAST } from '../src/shared/content/cast';
import { roomById } from '../src/shared/content/villa';
import type { PlayerState } from '../src/server/game/state';

function makeGame(n = 4, seed = 42) {
  let t = 1_000_000;
  const emitted: { userId: string; event: string }[] = [];
  let finished = false;
  const g = new GameInstance({
    id: 'g1',
    lobbyId: 'l1',
    title: 'Villa Test',
    players: Array.from({ length: n }, (_, i) => ({ userId: `p${i}`, name: `Joueur ${i}`, character: characterFromCast(CAST[(i * 7) % CAST.length]) })),
    emit: (userId, event) => emitted.push({ userId, event }),
    onFinished: () => {
      finished = true;
    },
    timeScale: 0.1,
    seed,
    manual: true,
    now: () => t,
  });
  const advance = (ms: number, step = 50) => {
    for (let i = 0; i < ms; i += step) {
      t += step;
      g.tick();
    }
  };
  /** Téléporte un joueur au centre d'une tuile libre de la pièce. */
  const place = (p: PlayerState, roomId: string, dx = 0) => {
    const r = roomById(roomId)!.rect;
    p.pos = { x: r.x + Math.floor(r.w / 2) + 0.5 + dx, y: r.y + Math.floor(r.h / 2) + 0.5 };
    if (roomId === 'kitchen') p.pos = { x: 3.5 + dx, y: 11.5 };
    advance(60);
  };
  return { g, advance, place, emitted, isFinished: () => finished };
}

test('chaque joueur reçoit un secret, une empreinte et une semelle uniques', () => {
  const { g } = makeGame(5);
  const ps = [...g.players.values()];
  assert.equal(new Set(ps.map((p) => p.secretId)).size, 5);
  assert.equal(new Set(ps.map((p) => p.fingerprint)).size, 5);
  assert.equal(new Set(ps.map((p) => p.shoe.pattern)).size, 5);
  for (const p of ps) assert.ok(p.knowledge.some((k) => k.kind === 'secret'));
});

test('la vérité reste côté serveur : la vue client ne contient pas les secrets des autres', () => {
  const { g } = makeGame(3);
  const [a, b] = [...g.players.values()];
  const view = JSON.stringify(g.buildSelfView(a));
  assert.ok(!view.includes(b.secretText));
  assert.ok(!view.includes(b.fingerprint));
  assert.ok(!view.includes('truth'));
});

test('les joueurs ne voient que ce qui est dans leur pièce', () => {
  const { g, place } = makeGame(2);
  const [a, b] = [...g.players.values()];
  place(a, 'kitchen');
  place(b, 'office');
  const va = g.buildSnapshot(a);
  const seen = va.players.find((p) => p.id === b.id)!;
  // seule une alliance (tirée au sort au début de la nuit) partage la position à distance
  if (!seen.viaAlliance) assert.equal(seen.pos, undefined);
  assert.ok(va.objects.every((o) => o.roomId === 'kitchen'));
});

test('le mouvement est bloqué par les murs et la porte verrouillée de la cave', () => {
  const { g, advance } = makeGame(1);
  const [a] = [...g.players.values()];
  a.pos = { x: 5.5, y: 12.5 }; // juste au-dessus de la porte de la cave (5,13)
  g.setInput(a.id, 0, 1);
  advance(1000);
  assert.ok(a.pos.y < 13, 'ne traverse pas la porte verrouillée');
  g.unlockedDoors.add('d_kitchen_cellar');
  advance(1000);
  assert.equal(a.roomId, 'cellar');
});

test('boucle complète : arme → opportunité → meurtre → découverte → rôles → enquête → vote → épilogue', () => {
  const { g, advance, place, isFinished } = makeGame(4, 7);
  const [killer, victim, finder, other] = [...g.players.values()];
  // Rien n'est possible au début : pas de bouton « tuer »
  const knife = [...g.objects.values()].find((o) => o.type === 'knife')!;
  place(killer, 'kitchen');
  killer.pos = { ...(knife.location as { pos: { x: number; y: number } }).pos };
  advance(60);
  g.action(killer.id, { type: 'take', objectId: knife.id });
  assert.ok(killer.inventory.includes(knife.id));
  place(victim, 'kitchen', 0.6);
  killer.pos = { x: victim.pos.x - 0.6, y: victim.pos.y };
  advance(60);
  assert.equal(g.actions.opportunityFor(killer), null, 'pas d’opportunité en phase d’arrivée');

  // La nuit avance jusqu'à l'escalade
  place(finder, 'office');
  place(other, 'garden');
  advance(22_000); // escalade à 21 s (échelle 0.1), coupure de courant à 30 s
  assert.equal(g.phase, 'ESCALATION');
  assert.equal(g.isBlackout(), false);
  const opp = g.actions.opportunityFor(killer);
  assert.ok(opp, 'opportunité : arme + isolement + tension');
  assert.equal(opp!.target.id, victim.id);

  // Un témoin fait disparaître l'opportunité
  place(other, 'kitchen', 2);
  assert.equal(g.actions.opportunityFor(killer), null, 'pas d’opportunité devant témoin');
  place(other, 'garden');

  g.action(killer.id, { type: 'act', targetId: victim.id, objectId: knife.id });
  assert.equal(victim.alive, false);
  assert.equal(killer.stained, true);
  assert.ok(knife.traces.some((t) => t.kind === 'blood'));
  assert.ok(g.truth.some((e) => e.type === 'PLAYER_DIED'));

  // Le tueur se lave (crée une trace cachée), quitte la pièce
  killer.pos = { x: 7.5, y: 7.5 };
  advance(60);
  g.action(killer.id, { type: 'wash' });
  assert.equal(killer.stained, false);
  assert.ok(g.evidence.some((e) => e.kind === 'diluted_blood' && !e.visible));
  place(killer, 'living');

  // Découverte du corps
  place(finder, 'kitchen', 2);
  assert.ok(g.bodies[0].discovered);
  assert.equal(g.case?.type, 'murder');
  assert.equal(g.case?.culpritId, killer.id);
  assert.equal(g.phase, 'MAJOR_EVENT');
  advance(2_000);
  assert.equal(g.phase, 'INVESTIGATION');
  const alive = g.alivePlayers();
  assert.ok(alive.every((p) => p.roleId), 'chaque vivant a un rôle');
  assert.equal(new Set(alive.map((p) => p.roleId)).size, alive.length, 'rôles uniques');
  assert.equal(finder.roleId, 'forensic', 'le découvreur a une affinité médico-légale');

  // Autopsie : fibres de la tenue du tueur
  finder.pos = { ...g.bodies[0].pos, x: g.bodies[0].pos.x + 0.5 };
  advance(60);
  const autopsy = g.action(finder.id, { type: 'tool', toolId: 'examine_body' })!;
  assert.match(autopsy, /fibres/);

  // Le tueur participe à l'enquête et peut témoigner (mentir)
  const investigator = alive.find((p) => p.roleId === 'investigator')!;
  g.action(investigator.id, { type: 'tool', toolId: 'request_testimony', targetId: killer.id });
  assert.ok(killer.pendingTestimony);
  g.action(killer.id, { type: 'testimony', requestId: killer.pendingTestimony!.requestId, roomId: 'garden', text: 'Je prenais l’air.' });
  const tm = g.testimonies[0];
  const verdict = g.action(investigator.id, { type: 'tool', toolId: 'verify_testimony', targetId: tm.boardId })!;
  assert.match(verdict, /INCOHÉRENT/);

  // Partage d'une connaissance sur le tableau
  const k = finder.knowledge.find((x) => x.kind === 'role')!;
  g.action(finder.id, { type: 'share', knowledgeId: k.id, to: 'board' });
  assert.ok(g.board.some((b) => b.verified && b.text === k.text));

  // Vote
  advance(31_000);
  assert.equal(g.phase, 'RESOLUTION');
  for (const p of g.alivePlayers()) g.action(p.id, { type: 'vote', suspectId: killer.id });
  assert.ok(isFinished());
  assert.equal(g.phase, 'EPILOGUE');
  const epi = g.investigation.epilogue!;
  assert.equal(epi.culpritCaught, true);
  assert.ok(epi.truthTimeline.some((l) => l.text.includes('attaque')));
  assert.equal(epi.secrets.length, 4);
});

test('relations : alliance (canal privé + position partagée), pacte rompu = trahison → vendetta possible', () => {
  const { g, place } = makeGame(3, 11);
  const [a, b, c] = [...g.players.values()];
  place(a, 'living');
  place(b, 'living', 1);
  a.motiveAgainst.delete(b.id);
  assert.throws(() => g.action(a.id, { type: 'relation', op: 'propose', relType: 'VENDETTA', targetId: b.id }), /mobile/);
  g.action(a.id, { type: 'relation', op: 'propose', relType: 'ALLY', targetId: b.id });
  const rel = g.relations.find((r) => r.type === 'ALLY' && r.from === a.id)!;
  g.action(b.id, { type: 'relation', op: 'accept', relationId: rel.id });
  assert.equal(rel.status, 'active');
  place(b, 'office');
  const seen = g.buildSnapshot(a).players.find((p) => p.id === b.id)!;
  assert.ok(seen.pos && seen.viaAlliance, 'allié localisable partout');
  g.sendChat(a.id, `ally:${rel.id}`, 'On se retrouve au bureau.');
  assert.ok(g.buildSelfView(b).chat.some((m) => m.text.includes('bureau')));
  assert.ok(!g.buildSelfView(c).chat.some((m) => m.text.includes('bureau')), 'canal privé');

  place(b, 'living', 1);
  g.action(a.id, { type: 'relation', op: 'propose', relType: 'PACT', targetId: b.id });
  const pact = g.relations.find((r) => r.type === 'PACT' && r.status === 'pending')!;
  g.action(b.id, { type: 'relation', op: 'accept', relationId: pact.id });
  g.action(a.id, { type: 'relation', op: 'break', relationId: pact.id });
  assert.ok(g.truth.some((e) => e.type === 'BETRAYAL'));
  const msg = g.action(b.id, { type: 'relation', op: 'propose', relType: 'VENDETTA', targetId: a.id })!;
  assert.match(msg, /vendetta/);
});

test('empreintes de boue : le jardin salit les semelles, l’intérieur garde la trace', () => {
  const { g, advance } = makeGame(1);
  const [a] = [...g.players.values()];
  a.pos = { x: 5.5, y: 3.5 }; // jardin, au-dessus de la porte de la cuisine
  advance(200);
  assert.ok(a.muddyUntil > 0);
  g.setInput(a.id, 0, 1);
  advance(2500);
  assert.equal(a.roomId, 'kitchen');
  const prints = g.evidence.filter((e) => e.kind === 'footprint');
  assert.ok(prints.length > 0);
  assert.equal(prints[0].data.pattern, a.shoe.pattern);
});

test('cacher puis fouiller : seul celui qui fouille découvre l’objet', () => {
  const { g, place } = makeGame(2, 3);
  const [a, b] = [...g.players.values()];
  const cloth = [...g.objects.values()].find((o) => o.type === 'cloth')!;
  const loc = cloth.location as { roomId: string; pos: { x: number; y: number } };
  place(a, loc.roomId);
  a.pos = { ...loc.pos };
  g.tick();
  g.action(a.id, { type: 'take', objectId: cloth.id });
  place(a, 'living');
  a.pos = { x: 15.5, y: 8.5 }; // sous le canapé
  g.tick();
  g.action(a.id, { type: 'hide', objectId: cloth.id, furnitureId: 'f_living_sofa' });
  assert.equal(cloth.location.kind, 'hidden');
  place(b, 'living');
  b.pos = { x: 14.5, y: 8.5 };
  g.tick();
  assert.ok(!g.buildSnapshot(b).objects.some((o) => o.id === cloth.id));
  g.action(b.id, { type: 'search', furnitureId: 'f_living_sofa' });
  assert.ok(g.buildSnapshot(b).objects.some((o) => o.id === cloth.id));
  g.action(b.id, { type: 'take', objectId: cloth.id });
  assert.ok(b.inventory.includes(cloth.id));
  assert.ok(cloth.history.length >= 4);
});

test('nuit calme : sans événement majeur, l’aube révèle les secrets', () => {
  const { g, advance, isFinished } = makeGame(2, 5);
  // retire le collier pour éviter le vol
  for (const o of g.objects.values()) if (o.type === 'necklace') o.location = { kind: 'floor', roomId: 'bedroom2', pos: (o.location as { pos: { x: number; y: number } }).pos };
  advance(70_000, 200);
  assert.ok(isFinished());
  assert.equal(g.investigation.epilogue?.caseType, 'quiet');
});
