/**
 * Invités IA : une nuit complète avec 1 humain passif + 4 bots doit aller jusqu'à l'épilogue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameInstance } from '../src/server/game/GameInstance';
import { randomCharacter } from '../src/shared/content/character';

function runNight(seed: number) {
  let t = 1_000_000;
  let done = false;
  const g = new GameInstance({
    id: `g${seed}`,
    lobbyId: 'l',
    title: 'Villa IA',
    players: [
      { userId: 'human', name: 'Humain Test', character: randomCharacter() },
      ...[1, 2, 3, 4].map((i) => ({ userId: `bot:${i}`, name: `Bot ${i}`, character: randomCharacter(), bot: true })),
    ],
    emit: () => {},
    onFinished: () => (done = true),
    timeScale: 0.05,
    seed,
    manual: true,
    now: () => t,
  });
  const start = new Map([...g.players.values()].map((p) => [p.id, { ...p.pos }]));
  // L'humain vote pour quelqu'un quand le vote s'ouvre
  for (let i = 0; i < 20_000 && !done; i++) {
    t += 50;
    g.tick();
    if (g.phase === 'RESOLUTION' && !g.players.get('human')!.vote && g.players.get('human')!.alive) {
      try {
        g.action('human', { type: 'vote', suspectId: 'bot:1' });
      } catch {
        /* pas encore ouvert */
      }
    }
  }
  return { g, done, start };
}

test('invités IA : la nuit va jusqu’à l’épilogue, les bots se déplacent, agissent et votent', () => {
  const outcomes = new Map<string, number>();
  let moved = 0;
  let botActions = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { g, done, start } = runNight(seed);
    assert.ok(done, `seed ${seed} : la partie se termine (phase ${g.phase})`);
    const epi = g.investigation.epilogue!;
    outcomes.set(epi.caseType, (outcomes.get(epi.caseType) ?? 0) + 1);
    for (const p of g.players.values()) {
      if (!p.bot) continue;
      const s = start.get(p.id)!;
      if (Math.hypot(p.pos.x - s.x, p.pos.y - s.y) > 3 || !p.alive) moved++;
    }
    botActions += g.truth.filter((e) => e.actorId?.startsWith('bot:') && ['OBJECT_PICKED_UP', 'RELATION_PROPOSED', 'RELATION_CREATED', 'TOOL_USED', 'VOTE_CAST', 'PLAYER_ATTACKED', 'TESTIMONY_GIVEN', 'KNOWLEDGE_SHARED'].includes(e.type)).length;
    if (epi.caseType !== 'quiet') assert.ok(epi.votes.length >= 1, 'des votes ont été exprimés');
  }
  assert.ok(moved >= 18, `les bots explorent (${moved}/24)`);
  assert.ok(botActions > 30, `les bots agissent (${botActions})`);
  console.log('  issues des nuits :', Object.fromEntries(outcomes));
});
