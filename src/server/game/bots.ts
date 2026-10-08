/**
 * Invités IA — permettent de jouer une nuit complète seul ou à quelques-uns.
 *
 * Un bot est un joueur comme les autres : il passe par les MÊMES actions validées par le serveur
 * (déplacement, objets, relations, outils, témoignages, vote). Il ne lit pas la vérité :
 * il décide à partir de SES connaissances, de ce qu'il voit et de son secret (mobile éventuel).
 * Seule entorse assumée : un bot armé qui poursuit la cible de sa rancune sait dans quelle pièce elle est.
 */
import type { GameAction } from '@shared/protocol';
import type { RelationType, Vec2 } from '@shared/types';
import { FURNITURE, ROOMS, randomFreeTile, roomName } from '@shared/content/villa';
import { findOutfit } from '@shared/content/character';
import { GAME_CONFIG } from '@shared/config';
import type { GameInstance } from './GameInstance';
import type { PlayerState } from './state';
import { findPath } from './pathfinding';
import { pick } from '../util';

interface BotState {
  path: Vec2[];
  waitUntil: number;
  nextThink: number;
  nextChat: number;
  lastPos: Vec2;
  stuckSince: number;
  replied: Set<string>;
  roleSteps: number;
  lastToolAt: number;
  pursuing?: string;
  /** objets aperçus : id → position (mémoire du bot, pas la vérité) */
  seen: Map<string, { pos: Vec2; lethal: boolean }>;
  goal?: string;
  activity?: string;
}

const IDLE_LINES = [
  'Quelqu’un a des nouvelles de Victor ?',
  'Cette maison me donne des frissons.',
  'Vous avez entendu ça ? Non… sûrement le vent.',
  'Je n’aime pas cet orage.',
  'Qui a invité tout ce monde, au juste ?',
  'Le dîner ne viendra pas, n’est-ce pas ?',
  'Je vais faire un tour. Restez groupés.',
  'Quelqu’un a vu une clé quelque part ?',
];
const ROOM_LINES = ['Je suis {room}. Rien à signaler… pour l’instant.', 'Il y a quelque chose de bizarre {room}.', 'Quelqu’un est passé {room} il y a peu, j’en suis sûr·e.'];
const AFTER_MURDER_LINES = [
  'C’est horrible… qui a pu faire ça ?',
  'Personne ne sort d’ici tant qu’on n’a pas compris.',
  'Où étiez-vous tous au moment des faits ?',
  'Il faut comparer nos alibis.',
  'Je ne fais confiance à personne.',
];

export class BotSystem {
  private bots = new Map<string, BotState>();

  constructor(private g: GameInstance) {}

  register(id: string) {
    const now = this.g.now();
    this.bots.set(id, {
      path: [],
      waitUntil: now + 1500 + Math.random() * 4000,
      nextThink: now + 500,
      nextChat: now + 15000 + Math.random() * 25000,
      lastPos: { x: 0, y: 0 },
      stuckSince: now,
      replied: new Set(),
      roleSteps: 0,
      lastToolAt: 0,
      seen: new Map(),
    });
  }

  has(id: string) {
    return this.bots.has(id);
  }

  private act(p: PlayerState, a: GameAction): string | undefined {
    try {
      return this.g.action(p.id, a);
    } catch {
      return undefined;
    }
  }

  private say(p: PlayerState, text: string, channel = 'general') {
    try {
      this.g.sendChat(p.id, channel as 'general', text);
    } catch {
      /* ignoré */
    }
  }

  private goTo(p: PlayerState, s: BotState, target: Vec2) {
    s.path = findPath(this.g.grid, p.pos, target, this.g.unlockedDoors) ?? [];
    s.stuckSince = this.g.now();
  }

  private goToRoom(p: PlayerState, s: BotState, roomId: string) {
    this.goTo(p, s, randomFreeTile(this.g.grid, roomId, this.g.rnd));
  }

  /** Appelé à chaque pas de simulation : pilotage vers le prochain point du chemin. */
  steer() {
    const now = this.g.now();
    for (const [id, s] of this.bots) {
      const p = this.g.players.get(id);
      if (!p || !p.alive || this.g.ended) continue;
      if (!s.path.length) {
        if (p.input.x || p.input.y) this.g.setInput(id, 0, 0);
        continue;
      }
      const wp = s.path[0];
      const dx = wp.x - p.pos.x;
      const dy = wp.y - p.pos.y;
      if (Math.hypot(dx, dy) < 0.25) {
        s.path.shift();
        if (!s.path.length) {
          this.g.setInput(id, 0, 0);
          s.waitUntil = now + 3000 + Math.random() * 8000;
        }
        continue;
      }
      this.g.setInput(id, dx, dy);
      // Détection de blocage (un autre joueur, une porte qui vient de se fermer…)
      if (Math.hypot(p.pos.x - s.lastPos.x, p.pos.y - s.lastPos.y) > 0.05) {
        s.lastPos = { ...p.pos };
        s.stuckSince = now;
      } else if (now - s.stuckSince > 1500) {
        s.path = [];
        this.g.setInput(id, 0, 0);
        s.waitUntil = now + 500;
      }
    }
  }

  /** Décisions (≈ 2 fois par seconde). */
  think() {
    const g = this.g;
    const now = g.now();
    for (const [id, s] of this.bots) {
      const p = g.players.get(id);
      if (!p || !p.alive || g.ended || now < s.nextThink) continue;
      s.nextThink = now + 400 + Math.random() * 300;
      this.observe(p, s);
      this.reactSocial(p, s);
      this.answerTestimony(p, s);
      if (this.vote(p)) continue;
      if (this.murder(p, s)) continue;
      if (this.cleanUp(p, s)) continue;
      if (g.case && g.phase === 'INVESTIGATION' && this.investigate(p, s)) continue;
      this.pursue(p, s);
      this.handleObjects(p, s);
      this.socialize(p, s);
      this.chat(p, s);
      if (!s.path.length && now > s.waitUntil) this.wander(p, s);
    }
  }

  // ───────────── comportements ─────────────

  private reactSocial(p: PlayerState, s: BotState) {
    for (const r of this.g.relations) {
      if (r.status !== 'pending' || r.to !== p.id || s.replied.has(r.id)) continue;
      if (this.g.now() - this.g.startedAt < 0) continue;
      s.replied.add(r.id);
      const chance = r.type === 'FRIEND' ? 0.8 : r.type === 'ALLY' ? 0.65 : 0.4;
      const accept = !p.motiveAgainst.has(r.from) && this.g.rnd() < chance;
      setTimeout(() => {
        if (r.status === 'pending') this.act(p, { type: 'relation', op: accept ? 'accept' : 'decline', relationId: r.id });
      }, 1500 + Math.random() * 3000);
    }
  }

  private answerTestimony(p: PlayerState, s: BotState) {
    const req = p.pendingTestimony;
    if (!req || s.replied.has(req.requestId)) return;
    s.replied.add(req.requestId);
    const ref = this.g.case?.refClock ?? this.g.clock();
    const truth = this.g.roomAtClock(p.id, ref) ?? p.roomId;
    const guilty = this.g.case?.culpritId === p.id;
    // Le coupable ment ; les innocents disent (presque toujours) la vérité
    const lie = guilty || this.g.rnd() < 0.08;
    const room = lie ? pick(ROOMS.filter((r) => r.id !== truth && r.id !== this.g.case?.roomId), this.g.rnd).id : truth;
    const details = lie ? 'J’étais seul·e, je n’ai rien vu.' : pick(['Je me promenais.', 'Je cherchais Victor.', 'J’attendais que l’orage passe.'], this.g.rnd);
    setTimeout(() => this.act(p, { type: 'testimony', requestId: req.requestId, roomId: room, text: details }), 2000 + Math.random() * 3000);
  }

  private vote(p: PlayerState): boolean {
    const g = this.g;
    if (g.phase !== 'RESOLUTION' || !g.investigation.voteEndsAt || p.vote) return false;
    if (g.rnd() > 0.25) return true; // réfléchit quelques secondes
    const scores = new Map<string, number>();
    const add = (id: string, n: number) => scores.set(id, (scores.get(id) ?? 0) + n);
    const candidates = g.investigation.candidates().filter((c) => c.id !== p.id);
    const caseRoom = g.case?.roomId ? roomName(g.case.roomId) : '';
    const texts = [...p.knowledge.map((k) => k.text), ...g.board.filter((b) => b.verified).map((b) => b.text)];
    for (const c of candidates) {
      add(c.id, g.rnd());
      const name = g.nameOf(c.id);
      const fiber = findOutfit(g.players.get(c.id)!.character.outfitId).fiber;
      for (const t of texts) {
        if (!t.includes(name) && !t.includes(fiber)) continue;
        if (t.includes(fiber) && t.includes('ongles')) add(c.id, 4);
        if (t.includes('tache sombre')) add(c.id, 3);
        if (t.includes('INCOHÉRENT')) add(c.id, 4);
        if (caseRoom && t.includes(caseRoom)) add(c.id, 1.5);
        if (t.includes('lave') || t.includes('essuie') || t.includes('brûle')) add(c.id, 2);
      }
      if (g.social.some((x) => x.kind === 'declared_enemy' && x.actorId === c.id && x.targetId === g.case?.victimId)) add(c.id, 2);
    }
    if (g.case?.culpritId === p.id) scores.delete(p.id);
    const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) this.act(p, { type: 'vote', suspectId: best[0] });
    return true;
  }

  private murder(p: PlayerState, s: BotState): boolean {
    const g = this.g;
    const opp = g.actions.opportunityFor(p);
    if (!opp) return false;
    const motivated = p.motiveAgainst.has(opp.target.id);
    const chance = motivated ? 0.45 : opp.dark ? 0.06 : 0.015;
    if (g.rnd() > chance) return false;
    this.act(p, { type: 'act', targetId: opp.target.id, objectId: opp.weapon.id });
    s.pursuing = undefined;
    s.path = [];
    s.activity = 'flee';
    return true;
  }

  /** Après un crime : se laver, quitter les lieux. */
  private cleanUp(p: PlayerState, s: BotState): boolean {
    if (!p.stained) {
      if (s.activity === 'flee' && !s.path.length) {
        s.activity = undefined;
        this.goToRoom(p, s, pick(['living', 'hall', 'garden', 'bedroom1'], this.g.rnd));
        return true;
      }
      return false;
    }
    const sinks = FURNITURE.filter((f) => f.kind === 'sink');
    const sink = sinks.find((f) => f.roomId === p.roomId && Math.hypot(f.x + f.w / 2 - p.pos.x, f.y + 0.5 - p.pos.y) < GAME_CONFIG.interactRange + 0.5);
    if (sink) {
      this.act(p, { type: 'wash' });
      s.activity = 'flee';
      return true;
    }
    if (!s.path.length) {
      const target = pick(sinks, this.g.rnd);
      this.goTo(p, s, { x: target.x + target.w / 2, y: target.y + target.h + 0.5 });
    }
    return true;
  }

  /** Ce que le bot voit dans sa pièce : il s'en souvient. */
  private observe(p: PlayerState, s: BotState) {
    const g = this.g;
    if (!g.canSeeRoom(p)) return;
    for (const o of g.objects.values()) {
      if (o.location.kind === 'floor' && o.location.roomId === p.roomId) s.seen.set(o.id, { pos: o.location.pos, lethal: o.def.tags.includes('lethal') });
      else if (s.seen.has(o.id) && (o.location.kind !== 'floor' || o.location.roomId !== p.roomId)) {
        const mem = s.seen.get(o.id)!;
        if (g.grid && Math.hypot(mem.pos.x - p.pos.x, mem.pos.y - p.pos.y) < 4) s.seen.delete(o.id); // il n'est plus là
      }
    }
  }

  private pursue(p: PlayerState, s: BotState) {
    const g = this.g;
    if (!['SOCIAL', 'ESCALATION'].includes(g.phase) || g.murders >= g.maxMurders) return;
    const target = [...p.motiveAgainst].map((id) => g.players.get(id)).find((t) => t?.alive);
    if (!target) return;
    const armed = p.inventory.some((id) => g.objects.get(id)?.def.tags.includes('lethal'));
    if (!armed) {
      // Va chercher une arme aperçue plus tôt
      const mem = [...s.seen.entries()].find(([, m]) => m.lethal);
      if (mem && !s.path.length) {
        const [oid, m] = mem;
        const o = g.objects.get(oid);
        if (o?.location.kind === 'floor' && Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y) <= GAME_CONFIG.interactRange) {
          if (!this.act(p, { type: 'take', objectId: oid })) s.seen.delete(oid);
        } else this.goTo(p, s, m.pos);
      }
      return;
    }
    s.pursuing = target.id;
    const last = s.path[s.path.length - 1];
    if (!last || Math.hypot(last.x - target.pos.x, last.y - target.pos.y) > 1.5) this.goTo(p, s, target.pos);
  }

  private handleObjects(p: PlayerState, s: BotState) {
    const g = this.g;
    if (s.path.length || p.inventory.length >= 3) return;
    for (const o of g.objects.values()) {
      if (o.location.kind !== 'floor' || o.location.roomId !== p.roomId) continue;
      if (Math.hypot(o.location.pos.x - p.pos.x, o.location.pos.y - p.pos.y) > GAME_CONFIG.interactRange) continue;
      const weapon = o.def.tags.includes('lethal');
      const wants = weapon ? (p.motiveAgainst.size ? 1 : 0.35) : o.def.tags.some((t) => ['light', 'key', 'document', 'valuable'].includes(t)) ? 0.3 : 0.08;
      if (p.secretId === 'thief' && o.type === 'necklace') {
        this.act(p, { type: 'take', objectId: o.id });
        return;
      }
      if (g.rnd() < wants * 0.3) {
        this.act(p, { type: g.rnd() < 0.3 ? 'examine' : 'take', objectId: o.id });
        return;
      }
    }
    // Le voleur cache le collier
    const necklace = p.inventory.map((id) => g.objects.get(id)!).find((o) => o.type === 'necklace');
    if (necklace) {
      const spot = FURNITURE.find((f) => f.hiding && f.roomId === p.roomId && f.roomId !== 'bedroom2' && Math.hypot(f.x + f.w / 2 - p.pos.x, f.y + f.h / 2 - p.pos.y) < 2);
      if (spot) this.act(p, { type: 'hide', objectId: necklace.id, furnitureId: spot.id });
    }
    // Pendant le noir, on allume sa lampe
    const lamp = p.inventory.map((id) => g.objects.get(id)!).find((o) => o.def.tags.includes('light'));
    if (lamp && g.isBlackout() !== lamp.lit) this.act(p, { type: 'use', objectId: lamp.id });
  }

  private socialize(p: PlayerState, s: BotState) {
    const g = this.g;
    if (!['SOCIAL', 'ESCALATION', 'EXPLORATION'].includes(g.phase) || g.rnd() > 0.04) return;
    const near = g.alivePlayers().filter((o) => o.id !== p.id && o.roomId === p.roomId);
    if (!near.length) return;
    const t = pick(near, g.rnd);
    if (p.motiveAgainst.has(t.id) && g.phase !== 'EXPLORATION' && !g.relationships.between(p.id, t.id, 'ENEMY')) {
      if (g.rnd() < 0.3) {
        this.act(p, { type: 'relation', op: 'propose', relType: 'ENEMY', targetId: t.id });
        this.say(p, `${t.name.split(' ')[0]}, je sais ce que tu as fait.`);
      } else if (!g.relationships.between(p.id, t.id, 'VENDETTA')) {
        this.act(p, { type: 'relation', op: 'propose', relType: 'VENDETTA', targetId: t.id });
      }
      return;
    }
    const type: RelationType = pick(['FRIEND', 'FRIEND', 'ALLY'], g.rnd);
    if (!g.relationships.between(p.id, t.id) && !s.replied.has(`prop:${t.id}`)) {
      s.replied.add(`prop:${t.id}`);
      this.act(p, { type: 'relation', op: 'propose', relType: type, targetId: t.id });
    }
  }

  private chat(p: PlayerState, s: BotState) {
    const g = this.g;
    if (g.now() < s.nextChat) return;
    s.nextChat = g.now() + 25000 + Math.random() * 35000;
    let line: string;
    if (g.case?.type === 'murder') line = pick(AFTER_MURDER_LINES, g.rnd);
    else if (g.rnd() < 0.35) line = pick(ROOM_LINES, g.rnd).replace('{room}', `— ${roomName(p.roomId)} —`);
    else line = pick(IDLE_LINES, g.rnd);
    // Parfois, partager une observation réelle (ou mentir si on est coupable)
    const seen = p.knowledge.filter((k) => k.kind === 'seen' || k.kind === 'heard').slice(-6);
    if (g.case && seen.length && g.rnd() < 0.5) {
      const k = pick(seen, g.rnd);
      const guilty = g.case.culpritId === p.id;
      if (!guilty || !k.text.includes(p.name)) line = `J’ai noté ça : « ${k.text} »`;
    }
    this.say(p, line);
  }

  private wander(p: PlayerState, s: BotState) {
    const g = this.g;
    const rooms = ROOMS.filter((r) => r.id !== p.roomId).map((r) => r.id);
    let target = pick(rooms, g.rnd);
    if (p.secretId === 'thief' && !p.inventory.some((id) => g.objects.get(id)?.type === 'necklace') && g.rnd() < 0.4) target = 'bedroom2';
    this.goToRoom(p, s, target);
  }

  // ───────────── enquête ─────────────

  private shareLatestRole(p: PlayerState) {
    const g = this.g;
    const k = [...p.knowledge].reverse().find((x) => x.kind === 'role' && !x.text.startsWith('Rôle attribué'));
    if (!k) return;
    const guilty = g.case?.culpritId === p.id;
    const fiber = findOutfit(p.character.outfitId).fiber;
    if (guilty && (k.text.includes(p.name) || k.text.includes(p.fingerprint) || k.text.includes(fiber) || k.text.includes(p.shoe.pattern))) {
      this.act(p, { type: 'claim', text: 'Mes analyses ne donnent rien de concluant. Le coupable a été prudent.' });
      return;
    }
    this.act(p, { type: 'share', knowledgeId: k.id, to: 'board' });
  }

  private useTool(p: PlayerState, s: BotState, toolId: string, targetId?: string) {
    const res = this.act(p, { type: 'tool', toolId, targetId });
    s.lastToolAt = this.g.now();
    if (res) setTimeout(() => this.shareLatestRole(p), 1500 + Math.random() * 2500);
    return !!res;
  }

  private investigate(p: PlayerState, s: BotState): boolean {
    const g = this.g;
    const c = g.case!;
    if (g.now() - s.lastToolAt < 6000) return false;
    const near = (pos: Vec2, r: number = GAME_CONFIG.interactRange) => Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y) < r;
    const travel = (pos: Vec2) => {
      if (!s.path.length) this.goTo(p, s, pos);
      return true;
    };
    const uses = (id: string) => p.toolUses[id] ?? 0;
    switch (p.roleId) {
      case 'forensic': {
        const body = g.bodies.find((b) => b.playerId === c.victimId);
        if (!body || uses('examine_body') >= 1) return false;
        if (near(body.pos, 1.8)) return this.useTool(p, s, 'examine_body');
        return travel(body.pos);
      }
      case 'inspector': {
        if (s.roleSteps >= 2 || !c.roomId) return false;
        if (p.roomId === c.roomId) {
          s.roleSteps++;
          return this.useTool(p, s, 'inspect_room');
        }
        return travel(randomFreeTile(g.grid, c.roomId, g.rnd));
      }
      case 'technician': {
        if (uses('camera_logs') >= 1) return false;
        const term = FURNITURE.find((f) => f.kind === 'terminal')!;
        const spot = { x: term.x - 0.5, y: term.y + 0.5 };
        if (near({ x: term.x + 0.5, y: term.y + 0.5 }, 1.9)) return this.useTool(p, s, 'camera_logs');
        return travel(spot);
      }
      case 'profiler':
        if (uses('social_profile') >= 1) return false;
        return this.useTool(p, s, 'social_profile');
      case 'investigator': {
        const asked = s.roleSteps;
        const others = g.alivePlayers().filter((o) => o.id !== p.id);
        if (asked < others.length) {
          s.roleSteps++;
          return this.useTool(p, s, 'request_testimony', others[asked].id);
        }
        const tm = g.testimonies.filter((t) => t.playerId !== p.id && !s.replied.has(`verif:${t.id}`));
        if (tm.length && uses('verify_testimony') < 2) {
          const t = pick(tm, g.rnd);
          s.replied.add(`verif:${t.id}`);
          return this.useTool(p, s, 'verify_testimony', t.boardId);
        }
        return false;
      }
      case 'scientist': {
        if (s.roleSteps >= 1) return false;
        const body = g.bodies.find((b) => b.playerId === c.victimId);
        const spot = body?.pos ?? (c.roomId ? randomFreeTile(g.grid, c.roomId, g.rnd) : p.pos);
        const objs = [...g.objects.values()].filter((o) => o.location.kind === 'floor' && o.location.roomId === (c.roomId ?? p.roomId));
        const target = objs.find((o) => o.location.kind === 'floor' && near(o.location.pos, GAME_CONFIG.interactRange));
        if (target) {
          s.roleSteps++;
          return this.useTool(p, s, 'analyze_prints', target.id);
        }
        if (objs.length && objs[0].location.kind === 'floor') return travel(objs[0].location.pos);
        if (!near(spot, 2)) return travel(spot);
        s.roleSteps++;
        return false;
      }
    }
    return false;
  }
}
