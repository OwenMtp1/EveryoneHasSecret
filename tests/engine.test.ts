/**
 * Moteur de jeu et règles de l'affaire (sans réseau) : horloge injectée, simulation manuelle.
 * Simulations de parties pour les trois scénarios et 3 à 8 joueurs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameInstance } from '../src/server/game/GameInstance';
import { characterFromCast } from '../src/shared/content/character';
import { CAST } from '../src/shared/content/cast';
import { OBJECT_TYPES } from '../src/shared/content/objects';
import { allFurniture, roomById } from '../src/shared/content/villa';
import type { GameObject, PlayerState } from '../src/server/game/state';
import type { GameAction } from '../src/shared/protocol';

const SCENARIOS = ['pacte', 'mensonges', 'testament'] as const;

function makeGame(n = 4, seed = 42, scenarioId?: string) {
  let t = 1_000_000;
  let finished = false;
  const g = new GameInstance({
    id: 'g1',
    lobbyId: 'l1',
    title: 'Villa Test',
    players: Array.from({ length: n }, (_, i) => {
      const c = CAST[(i * 7) % CAST.length];
      return { userId: `p${i}`, name: `${c.firstName} ${c.lastName}`, character: characterFromCast(c) };
    }),
    emit: () => {},
    onFinished: () => (finished = true),
    timeScale: 0.05,
    voteScale: 0.05,
    seed,
    scenarioId,
    manual: true,
    now: () => t,
  });
  const advance = (ms: number, step = 50) => {
    for (let i = 0; i < ms; i += step) {
      t += step;
      g.tick();
    }
  };
  const act = (p: PlayerState, a: GameAction) => g.action(p.id, a);
  const ref = (r: string) => [...g.objects.values()].find((o) => o.props.ref === r)!;
  /** Téléporte un joueur au contact d'un objet / d'un point. */
  const goTo = (p: PlayerState, pos: { x: number; y: number }, roomId: string) => {
    p.pos = { x: pos.x + 0.3, y: pos.y };
    p.roomId = roomId;
  };
  const goToObject = (p: PlayerState, o: GameObject) => {
    const loc = o.location;
    if (loc.kind === 'floor' || loc.kind === 'hidden') {
      goTo(p, loc.pos, loc.roomId);
      if (loc.kind === 'hidden') {
        if (loc.furnitureId.startsWith('body:')) act(p, { type: 'search_body', bodyId: loc.furnitureId.slice(5) });
        else act(p, { type: 'search', furnitureId: loc.furnitureId });
      }
    }
  };
  /** Prend un objet de l'affaire (en le cherchant là où il est). */
  const fetch = (p: PlayerState, o: GameObject): void => {
    if (o.location.kind === 'player' && o.location.playerId === p.id) return;
    // meuble verrouillé : clé à aller chercher, ou code (connu ici grâce à la vérité serveur)
    const loc = o.location;
    if (loc.kind === 'hidden' && g.caseSystem.furnitureLocked(loc.furnitureId)) {
      const lock = g.caseSystem.furnitureLocks.get(loc.furnitureId)!;
      if (lock.kind === 'key') fetch(p, g.objects.get(lock.keyId)!);
      goTo(p, loc.pos, loc.roomId);
      act(p, { type: 'unlock_furniture', furnitureId: loc.furnitureId, code: lock.kind === 'code' ? lock.code : undefined });
    }
    goToObject(p, o);
    while (p.inventory.length >= 4) act(p, { type: 'drop', objectId: p.inventory[0] });
    act(p, { type: 'take', objectId: o.id });
  };
  const murderer = () => g.players.get(g.caseSystem.truth.murdererId)!;
  const innocents = () => [...g.players.values()].filter((p) => p.id !== g.caseSystem.truth.murdererId);
  const startInvestigation = () => {
    advance(3000);
    assert.equal(g.phase, 'INVESTIGATION');
  };
  return { g, advance, act, ref, fetch, goTo, goToObject, murderer, innocents, startInvestigation, isFinished: () => finished };
}

// ───────────────────────── mise en place et cohérence ─────────────────────────

test('aucun objet interdit dans le catalogue ni dans le mobilier', () => {
  const banned = /horloge|pendule|montre|enregistreur|dictaphone|disque dur|tableau blanc|plateau|badge|disjoncteur|sonnette|caméra de surveillance|surveillance/i;
  for (const o of OBJECT_TYPES) assert.ok(!banned.test(`${o.name} ${o.description}`), `objet interdit : ${o.name}`);
  for (const f of allFurniture()) assert.ok(!banned.test(f.name), `meuble interdit : ${f.name}`);
});

for (const scenarioId of SCENARIOS)
  for (const n of [3, 4, 5, 6, 7, 8])
    test(`affaire « ${scenarioId} » à ${n} joueurs : vérité cohérente, rôles, preuves, aucune fuite`, () => {
      const { g, murderer } = makeGame(n, 1000 + n, scenarioId);
      const t = g.caseSystem.truth;
      const ps = [...g.players.values()];
      assert.equal(t.scenarioId, scenarioId);
      // exactement un meurtrier, humain, parmi les joueurs
      assert.equal(ps.filter((p) => t.players.get(p.id)!.camp === 'murderer').length, 1);
      assert.ok(g.players.has(t.murdererId));
      // protecteurs selon le nombre de joueurs, jamais le meurtrier
      assert.equal(t.protectorIds.length, n >= 8 ? 2 : n >= 6 ? 1 : 0);
      assert.ok(!t.protectorIds.includes(t.murdererId));
      // victime : personnage du catalogue que personne n'incarne
      assert.ok(!ps.some((p) => p.character.castId === t.victim.castId));
      assert.ok(roomById(t.victim.roomId));
      // identités physiques uniques, secrets distincts
      assert.equal(new Set(ps.map((p) => p.fingerprint)).size, n);
      assert.equal(new Set(ps.map((p) => p.secretText)).size, n);
      // chaque joueur a une spécialité, des souvenirs, un secret
      for (const p of ps) {
        assert.ok(p.roleId);
        assert.ok(t.players.get(p.id)!.memories.length >= 3);
      }
      // le meurtrier est absent pendant le crime, et quelqu'un l'a remarqué
      const mt = t.players.get(t.murdererId)!;
      assert.ok(mt.absence && mt.absence.from < t.murderAt && t.murderAt < mt.absence.to);
      assert.ok(ps.some((p) => p.id !== t.murdererId && t.players.get(p.id)!.memories.some((m) => m.includes(murderer().name.split(' ')[0]) && m.includes('cigarettes'))));
      // chaque objet d'affaire existe et a un emplacement valide
      for (const it of t.items) {
        const o = [...g.objects.values()].find((x) => x.props.ref === it.ref);
        assert.ok(o, `objet manquant : ${it.ref}`);
        assert.notEqual(o!.location.kind, 'destroyed');
      }
      // pièces décisives présentes : mobile, présence près de la villa, absence sur la photo
      const facts = t.items.flatMap((i) => i.content?.facts ?? []);
      assert.ok(facts.some((f) => f.kind === 'motive' && f.playerId === t.murdererId));
      assert.ok(facts.some((f) => f.kind === 'place' && f.playerId === t.murdererId && f.place === 'station'));
      assert.ok(facts.some((f) => f.kind === 'absent' && f.playerId === t.murdererId));
      // secret de chaque innocent prouvé par un document
      for (const p of ps) if (p.id !== t.murdererId) assert.ok(facts.some((f) => f.kind === 'secret' && f.playerId === p.id));
      // AUCUNE fuite : la vue d'un innocent ne contient ni l'identité du meurtrier, ni les codes, ni les secrets des autres
      for (const p of ps) {
        const view = JSON.stringify(g.buildSelfView(p));
        for (const o of ps) if (o.id !== p.id) assert.ok(!view.includes(o.secretText), 'secret d’un autre joueur dans la vue');
        assert.ok(!view.includes('"murdererId"') && !view.includes('"facts"') && !view.includes('"lock":'), 'vérité dans la vue');
        for (const l of g.caseSystem.furnitureLocks.values()) if (l.kind === 'code') assert.ok(!new RegExp(`(^|[^0-9a-z])${l.code}([^0-9a-z]|$)`).test(view), 'code du coffre divulgué');
        for (const it of t.items) if (it.lock?.kind === 'code') assert.ok(!new RegExp(`(^|[^0-9a-z])${it.lock.code}([^0-9a-z]|$)`, 'i').test(view), 'code divulgué');
        if (t.players.get(p.id)!.camp === 'innocent') assert.ok(!view.includes(t.motive));
      }
    });

test('la vérité ne change pas au cours de la partie', () => {
  const { g, advance } = makeGame(5, 7);
  const before = JSON.stringify({ m: g.caseSystem.truth.murdererId, t: g.caseSystem.truth.timeline, at: g.caseSystem.truth.murderAt });
  advance(20_000);
  assert.equal(JSON.stringify({ m: g.caseSystem.truth.murdererId, t: g.caseSystem.truth.timeline, at: g.caseSystem.truth.murderAt }), before);
});

// ───────────────────────── chaînes d'enquête ─────────────────────────

test('chaîne complète : corps → clé → boîte → journal → téléphone et ordinateur → coffret → clé USB lue', () => {
  const { g, act, ref, fetch, innocents, startInvestigation } = makeGame(4, 3, 'pacte');
  startInvestigation();
  const p = innocents()[0];
  // le téléphone est verrouillé
  fetch(p, ref('victim_phone'));
  assert.match(act(p, { type: 'examine', objectId: ref('victim_phone').id })!, /verrouill/);
  // clé sur le corps → boîte cadenassée → journal (codes)
  fetch(p, ref('box_key'));
  fetch(p, ref('diary_box'));
  act(p, { type: 'open', objectId: ref('diary_box').id });
  assert.ok(g.caseSystem.hasRead(p, ref('diary').id), 'journal lu à l’ouverture');
  const lines = g.caseSystem.dossierView(p).evidence.find((e) => e.objectId === ref('diary').id)!.lines.join(' ');
  const pin = lines.match(/téléphone, alors je l’écris ici : (\d{4})/)![1];
  const pwd = lines.match(/mot de passe : (\w+)\./)![1];
  // mauvais code refusé, trois échecs = verrouillage temporaire
  assert.throws(() => act(p, { type: 'unlock', objectId: ref('victim_phone').id, code: '0000' }), /incorrect/);
  act(p, { type: 'unlock', objectId: ref('victim_phone').id, code: pin });
  assert.ok(g.caseSystem.hasRead(p, ref('victim_phone').id));
  // ordinateur → code du coffret
  fetch(p, ref('laptop'));
  act(p, { type: 'unlock', objectId: ref('laptop').id, code: pwd });
  const lap = g.caseSystem.dossierView(p).evidence.find((e) => e.objectId === ref('laptop').id)!.lines.join(' ');
  const boxCode = lap.match(/Code : (\d{4})/)![1];
  // inventaire limité à 4 : on ne garde que l'ordinateur
  for (const id of [...p.inventory]) if (id !== ref('laptop').id) act(p, { type: 'drop', objectId: id });
  fetch(p, ref('usb_box'));
  act(p, { type: 'unlock', objectId: ref('usb_box').id, code: boxCode });
  // la clé USB ne se lit que dans l'ordinateur
  const usb = ref('usb');
  assert.ok(p.inventory.includes(usb.id));
  assert.match(act(p, { type: 'examine', objectId: usb.id })!, /appareil/);
  act(p, { type: 'insert', mediaId: usb.id, deviceId: ref('laptop').id });
  assert.ok(g.caseSystem.hasRead(p, usb.id), 'preuve décisive lue');
  assert.ok(g.caseSystem.dossierView(p).evidence.find((e) => e.objectId === usb.id)!.lines.join(' ').includes(g.nameOf(g.caseSystem.truth.murdererId)));
});

test('codes : le verrou se bloque après trois erreurs (pas de force brute)', () => {
  const { g, act, ref, fetch, innocents, startInvestigation, advance } = makeGame(3, 4);
  startInvestigation();
  const p = innocents()[0];
  fetch(p, ref('usb_box'));
  for (let i = 0; i < 3; i++) assert.throws(() => act(p, { type: 'unlock', objectId: ref('usb_box').id, code: '1' + i }), /incorrect/);
  assert.throws(() => act(p, { type: 'unlock', objectId: ref('usb_box').id, code: '12' }), /Trop d’essais/);
  advance(31_000);
  assert.throws(() => act(p, { type: 'unlock', objectId: ref('usb_box').id, code: '12' }), /incorrect/);
  void g;
});

test('appareil photo : la carte mémoire montre le groupe sans le meurtrier ; la carte peut être retirée et brûlée', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation } = makeGame(5, 11, 'testament');
  startInvestigation();
  const p = innocents()[0];
  fetch(p, ref('camera'));
  act(p, { type: 'examine', objectId: ref('camera').id });
  const card = g.caseSystem.dossierView(p).evidence.find((e) => e.objectId === ref('card').id)!;
  assert.ok(card.photos?.length, 'photo rendue avec les personnages');
  assert.ok(!card.photos![0].castIds.includes(murderer().character.castId), 'le meurtrier n’est pas sur la photo');
  // le meurtrier peut faire disparaître la carte (dissimulation), ce qui laisse des cendres
  const m = murderer();
  act(p, { type: 'drop', objectId: ref('camera').id });
  fetch(m, ref('camera'));
  act(m, { type: 'open', objectId: ref('camera').id }); // retire la carte
  assert.ok(m.inventory.includes(ref('card').id));
  const lighter = [...g.objects.values()].find((o) => o.type === 'lighter')!;
  fetch(m, lighter);
  act(m, { type: 'destroy', objectId: ref('card').id });
  assert.equal(ref('card').location.kind, 'destroyed');
  assert.ok(g.evidence.some((e) => e.kind === 'ashes'));
});

test('gants : un objet manipulé avec des gants ne porte pas d’empreinte', () => {
  const { g, act, fetch, innocents, startInvestigation } = makeGame(3, 5);
  startInvestigation();
  const p = innocents()[0];
  const gloves = [...g.objects.values()].find((o) => o.type === 'gloves')!;
  fetch(p, gloves);
  act(p, { type: 'use', objectId: gloves.id });
  assert.equal(p.gloves, true);
  const lighter = [...g.objects.values()].find((o) => o.type === 'lighter')!;
  fetch(p, lighter);
  assert.ok(!lighter.traces.some((tr) => tr.kind === 'print' && tr.playerId === p.id));
});

test('arme cachée : empreinte partielle du meurtrier après essuyage, autopsie cohérente', () => {
  const { g, act, ref, fetch, murderer, startInvestigation } = makeGame(6, 21);
  startInvestigation();
  const sci = [...g.players.values()].find((p) => p.roleId === 'scientist')!;
  const weapon = ref('weapon');
  fetch(sci, weapon);
  const res = act(sci, { type: 'tool', toolId: 'analyze_prints', targetId: weapon.id })!;
  assert.match(res, new RegExp(murderer().fingerprint));
  assert.match(res, /essuyé/);
  const forensic = [...g.players.values()].find((p) => p.roleId === 'forensic')!;
  const body = g.bodies.find((b) => b.playerId === 'victim')!;
  forensic.pos = { ...body.pos };
  forensic.roomId = body.roomId;
  const aut = act(forensic, { type: 'tool', toolId: 'examine_body' })!;
  const fiber = CAST.find((c) => c.id === murderer().character.castId)!.fiber;
  assert.ok(aut.includes(fiber), 'fibres du vêtement du meurtrier');
});

// ───────────────────────── dossier commun, alibis ─────────────────────────

test('alibis : une pièce versée au dossier confirme ou contredit une déclaration', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation } = makeGame(4, 8, 'mensonges');
  startInvestigation();
  const m = murderer();
  const mPlace = g.caseSystem.truth.players.get(m.id)!.place;
  act(m, { type: 'alibi', place: mPlace, text: 'J’étais avec les autres toute la soirée.' });
  const p = innocents()[0];
  fetch(p, ref('m_receipt'));
  act(p, { type: 'examine', objectId: ref('m_receipt').id });
  act(p, { type: 'present', objectId: ref('m_receipt').id });
  const al = g.caseSystem.alibiViews().find((a) => a.playerId === m.id)!;
  assert.equal(al.status, 'contradicted');
  const pe = g.caseSystem.publicEvidenceView()[0];
  assert.ok(pe.checks.some((c) => c.status === 'contradicts'));
  // présenter une pièce non lue : refusé
  assert.throws(() => act(p, { type: 'present', objectId: ref('usb').id }), /pas lu/);
});

// ───────────────────────── accusations, votes, opposition ─────────────────────────

test('accusation : pièce lue obligatoire, opposition officielle, majorité absolue, innocent arrêté → la nuit continue', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation } = makeGame(5, 13, 'pacte');
  const inn = innocents();
  // pas d'accusation pendant la découverte du corps
  assert.throws(() => act(inn[0], { type: 'accuse', targetId: inn[1].id, evidenceIds: [], text: '' }), /instants/);
  startInvestigation();
  assert.throws(() => act(inn[0], { type: 'accuse', targetId: inn[1].id, evidenceIds: [], text: '' }), /pièce/);
  fetch(inn[0], ref('group_photo'));
  act(inn[0], { type: 'examine', objectId: ref('group_photo').id });
  act(inn[0], { type: 'accuse', targetId: inn[1].id, evidenceIds: [ref('group_photo').id], text: 'Je ne te crois pas.' });
  assert.ok(g.caseSystem.oppositions.some((o) => o.fromId === inn[0].id && o.toId === inn[1].id && o.cause === 'accusation formelle'));
  // un seul vote à la fois ; l'accusé ne vote pas ; double vote refusé
  assert.throws(() => act(inn[2], { type: 'accuse', targetId: inn[1].id, evidenceIds: [ref('group_photo').id], text: '' }), /déjà|pièce/);
  assert.throws(() => act(inn[1], { type: 'ballot', choice: 'innocent' }), /ne participez pas/);
  act(inn[2], { type: 'ballot', choice: 'guilty' });
  assert.throws(() => act(inn[2], { type: 'ballot', choice: 'innocent' }), /définitif/);
  assert.ok(g.caseSystem.oppositions.some((o) => o.fromId === inn[2].id && o.cause === 'vote « coupable »'));
  act(inn[3], { type: 'ballot', choice: 'guilty' });
  act(murderer(), { type: 'ballot', choice: 'guilty' });
  // 4 « coupable » sur 4 votants : arrestation d'un innocent ; la partie continue
  assert.equal(inn[1].arrested, true);
  assert.equal(g.ended, false);
  assert.throws(() => act(inn[1], { type: 'alibi', place: 'phare', text: '' }), /arrêté/);
  assert.throws(() => g.sendChat(inn[1].id, 'general', 'coucou'), /spectateurs/);
});

test('accusation : majorité absolue non atteinte (égalité) → relâché ; limites et délai entre accusations', () => {
  const { act, ref, fetch, murderer, innocents, startInvestigation, advance } = makeGame(5, 14);
  startInvestigation();
  const [a, b, c, d] = innocents();
  fetch(a, ref('group_photo'));
  act(a, { type: 'examine', objectId: ref('group_photo').id });
  act(a, { type: 'accuse', targetId: b.id, evidenceIds: [ref('group_photo').id], text: '' });
  act(c, { type: 'ballot', choice: 'guilty' });
  act(d, { type: 'ballot', choice: 'innocent' });
  act(murderer(), { type: 'ballot', choice: 'innocent' });
  // 2 coupable / 4 votants : pas de majorité absolue
  assert.equal(b.arrested, false);
  // délai avant une nouvelle accusation
  assert.throws(() => act(a, { type: 'accuse', targetId: b.id, evidenceIds: [ref('group_photo').id], text: '' }), /dans \d+ s/);
  advance(5_000);
  act(a, { type: 'accuse', targetId: c.id, evidenceIds: [ref('group_photo').id], text: '' });
  advance(4_000); // le vote expire sans votes
  assert.equal(c.arrested, false);
  advance(5_000);
  assert.throws(() => act(a, { type: 'accuse', targetId: d.id, evidenceIds: [ref('group_photo').id], text: '' }), /épuisé/);
});

test('victoire des innocents : le meurtrier arrêté par vote', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation, isFinished } = makeGame(4, 15, 'testament');
  startInvestigation();
  const [a, b, c] = innocents();
  fetch(a, ref('m_receipt'));
  act(a, { type: 'examine', objectId: ref('m_receipt').id });
  act(a, { type: 'accuse', targetId: murderer().id, evidenceIds: [ref('m_receipt').id], text: 'Ticket de la station à 21h.' });
  act(murderer(), { type: 'defend', text: 'J’ai juste acheté de l’eau !' });
  act(b, { type: 'ballot', choice: 'guilty' });
  act(c, { type: 'ballot', choice: 'guilty' });
  assert.ok(isFinished());
  const epi = g.caseSystem.epilogue!;
  assert.equal(epi.winner, 'innocents');
  assert.ok(epi.outcomes.find((o) => o.playerId === a.id)!.won);
  assert.ok(!epi.outcomes.find((o) => o.playerId === murderer().id)!.won);
  assert.ok(epi.truthTimeline.length > 5 && epi.motive.length > 20);
});

test('délibération finale : égalité → le doute profite au meurtrier ; mauvais choix → le meurtrier gagne', () => {
  for (const mode of ['tie', 'wrong', 'right'] as const) {
    const { g, act, murderer, innocents, advance } = makeGame(4, 30 + mode.length);
    advance(48_000); // fin de l'enquête (échelle de test : (40 + 900) s × 0,05)
    assert.equal(g.phase, 'RESOLUTION');
    const [a, b, c] = innocents();
    const m = murderer();
    if (mode === 'tie') {
      act(a, { type: 'ballot', choice: b.id });
      act(b, { type: 'ballot', choice: a.id });
      act(c, { type: 'ballot', choice: m.id });
      act(m, { type: 'ballot', choice: c.id });
      assert.equal(g.caseSystem.epilogue!.winner, 'murderer');
    } else if (mode === 'wrong') {
      act(a, { type: 'ballot', choice: b.id });
      act(c, { type: 'ballot', choice: b.id });
      act(m, { type: 'ballot', choice: b.id });
      act(b, { type: 'ballot', choice: m.id });
      assert.equal(g.caseSystem.epilogue!.winner, 'murderer');
    } else {
      for (const p of [a, b, c]) act(p, { type: 'ballot', choice: m.id });
      act(m, { type: 'ballot', choice: a.id });
      assert.equal(g.caseSystem.epilogue!.winner, 'innocents');
    }
    assert.throws(() => act(a, { type: 'ballot', choice: m.id }), /Aucun vote|terminée/);
  }
});

// ───────────────────────── éliminations ─────────────────────────

test('élimination : réservée au meurtrier, seulement contre un opposant officiel, sans témoin', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation, advance, goTo } = makeGame(5, 17);
  startInvestigation();
  const m = murderer();
  const [a, b] = innocents();
  const knife = [...g.objects.values()].find((o) => o.type === 'knife')!;
  fetch(m, knife);
  const lonely = roomById('office') ? 'office' : 'kitchen';
  const spot = { x: roomById(lonely)!.rect.x + 2.5, y: roomById(lonely)!.rect.y + 2.5 };
  for (const p of g.players.values()) if (p !== m && p !== a) goTo(p, { x: 4.5, y: 24.5 }, 'exterior');
  goTo(m, spot, lonely);
  goTo(a, spot, lonely);
  // a ne s'est pas opposé à m : aucune occasion
  assert.equal(g.caseSystem.opportunityFor(m), null);
  assert.throws(() => act(m, { type: 'act', targetId: a.id, objectId: knife.id }), /occasion/);
  // un innocent n'a jamais d'occasion
  fetch(a, [...g.objects.values()].find((o) => o.type === 'rope' || o.type === 'fire_poker' || o.type === 'candlestick') ?? knife);
  assert.equal(g.caseSystem.opportunityFor(a), null);
  // a dénonce formellement m (pièce versée contre lui) → opposant officiel
  fetch(a, ref('group_photo'));
  goTo(a, spot, lonely);
  goTo(m, spot, lonely);
  act(a, { type: 'examine', objectId: ref('group_photo').id });
  act(a, { type: 'present', objectId: ref('group_photo').id, againstId: m.id });
  // un témoin dans la pièce empêche l'acte
  goTo(b, spot, lonely);
  assert.equal(g.caseSystem.opportunityFor(m), null);
  goTo(b, { x: 4.5, y: 24.5 }, 'exterior');
  advance(100);
  const opp = g.caseSystem.opportunityFor(m);
  assert.ok(opp && opp.target.id === a.id);
  act(m, { type: 'act', targetId: a.id, objectId: knife.id });
  assert.equal(a.alive, false);
  assert.ok(g.bodies.some((x) => x.playerId === a.id));
  // délai entre deux éliminations
  assert.equal(g.caseSystem.opportunityFor(m), null);
});

test('le meurtrier gagne quand il ne reste qu’un seul joueur libre face à lui', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation } = makeGame(3, 19);
  startInvestigation();
  const [a, b] = innocents();
  fetch(a, ref('group_photo'));
  act(a, { type: 'examine', objectId: ref('group_photo').id });
  act(a, { type: 'accuse', targetId: b.id, evidenceIds: [ref('group_photo').id], text: '' });
  act(murderer(), { type: 'ballot', choice: 'guilty' });
  assert.equal(b.arrested, true);
  assert.equal(g.caseSystem.epilogue?.winner, 'murderer');
});

test('protecteur : connaît le meurtrier, gagne avec lui sauf s’il le dénonce', () => {
  const { g, act, ref, fetch, murderer, startInvestigation } = makeGame(6, 23);
  startInvestigation();
  const prId = g.caseSystem.truth.protectorIds[0];
  const pr = g.players.get(prId)!;
  const d = g.caseSystem.dossierView(pr);
  assert.equal(d.camp, 'protector');
  assert.ok(d.objective.includes(murderer().name));
  // le meurtrier détient la preuve du secret du protecteur
  assert.ok(murderer().inventory.some((id) => g.objects.get(id)!.props.ref === `secret_${prId}`));
  fetch(pr, ref('group_photo'));
  act(pr, { type: 'examine', objectId: ref('group_photo').id });
  act(pr, { type: 'present', objectId: ref('group_photo').id, againstId: murderer().id });
  assert.equal(g.caseSystem.dossierView(pr).camp, 'innocent', 'la dénonciation libère le protecteur');
});

test('déconnexion : le joueur reste dans l’histoire, retrouve sa vue complète à la reconnexion', () => {
  const { g, innocents, startInvestigation } = makeGame(4, 25);
  startInvestigation();
  const p = innocents()[0];
  g.setConnected(p.id, false);
  g.setInput(p.id, 1, 0);
  assert.deepEqual(p.input, { x: 1, y: 0 }); // l'entrée est conservée mais le joueur ne bouge pas
  const pos = { ...p.pos };
  g.tick();
  assert.deepEqual(p.pos, pos);
  g.setConnected(p.id, true);
  const v = g.fullView(p.id)!;
  assert.equal(v.you, p.id);
  assert.ok(v.dossier!.memories.length);
});

test('mouvement bloqué par les murs ; un joueur arrêté ne bouge plus', () => {
  const { g, act, ref, fetch, murderer, innocents, startInvestigation, advance } = makeGame(5, 27);
  startInvestigation();
  const [a, b, c, d] = innocents();
  fetch(a, ref('group_photo'));
  act(a, { type: 'examine', objectId: ref('group_photo').id });
  act(a, { type: 'accuse', targetId: b.id, evidenceIds: [ref('group_photo').id], text: '' });
  for (const p of [c, d, murderer()]) act(p, { type: 'ballot', choice: 'guilty' });
  assert.ok(b.arrested);
  const pos = { ...b.pos };
  g.setInput(b.id, 1, 0);
  advance(500);
  assert.deepEqual(b.pos, pos);
});

test('meubles verrouillés : fouille impossible sans la clé ou le bon code ; le code est dans le journal', () => {
  const { g, act, ref, fetch, innocents, startInvestigation, goTo } = makeGame(4, 31, 'pacte');
  startInvestigation();
  const p = innocents()[0];
  const desk = allFurniture().find((f) => f.id === 'f_office_desk')!;
  const safe = allFurniture().find((f) => f.id === 'f_office_safe')!;
  goTo(p, { x: desk.x + 0.5, y: desk.y + 0.5 }, desk.roomId);
  assert.throws(() => act(p, { type: 'search', furnitureId: desk.id }), /verrouillé/);
  assert.throws(() => act(p, { type: 'unlock_furniture', furnitureId: desk.id }), /clé/);
  goTo(p, { x: safe.x + 0.5, y: safe.y + 0.5 }, safe.roomId);
  assert.throws(() => act(p, { type: 'unlock_furniture', furnitureId: safe.id, code: '0000' }), /incorrect/);
  // le journal (boîte cadenassée, clé sur le corps) donne le code du coffre
  fetch(p, ref('box_key'));
  fetch(p, ref('diary_box'));
  act(p, { type: 'open', objectId: ref('diary_box').id });
  const diary = g.caseSystem.dossierView(p).evidence.find((e) => e.objectId === ref('diary').id)!.lines.join(' ');
  const code = diary.match(/coffre-fort du bureau : (\d{4})/)![1];
  goTo(p, { x: safe.x + 0.5, y: safe.y + 0.5 }, safe.roomId);
  const res = act(p, { type: 'unlock_furniture', furnitureId: safe.id, code })!;
  assert.match(res, /ouvert/);
  assert.ok(!g.caseSystem.furnitureLocked(safe.id));
  // le tiroir du bureau s'ouvre avec la petite clé trouvée sur le corps, et contient l'ordinateur
  fetch(p, ref('laptop'));
  assert.ok(p.inventory.includes(ref('laptop').id));
});
