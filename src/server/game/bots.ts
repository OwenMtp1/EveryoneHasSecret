/**
 * Joueurs IA : complètent une table quand il manque du monde. Ils jouent avec les mêmes actions qu'un humain
 * (déplacements, fouilles, alibi, votes) et ne savent que ce que leur rôle leur apprend : un innocent IA ne connaît
 * pas le meurtrier, il vote d'après les alibis publics. Le meurtrier IA ment sur sa soirée et vote contre les autres.
 */
import { allFurniture, buildWorldGrid, levelOf, roomAt, type FurnitureDef } from '@shared/content/villa';
import { findPathFast as findPath } from '@shared/content/walk';
import type { GameInstance } from './GameInstance';

const grid = buildWorldGrid();

const CHAT_ALIBI = [
  'J’étais à {place} toute la soirée, demandez aux autres.',
  'Moi ? {place}. On peut vérifier.',
  'Je n’ai pas bougé de {place}, je le jure.',
];
const CHAT_SEARCH = ['Je fouille de mon côté.', 'Quelqu’un a regardé à l’étage ?', 'On devrait se séparer pour fouiller.', 'Ce silence ne me dit rien qui vaille.'];

type Goal = { kind: 'search'; f: FurnitureDef; at: { x: number; y: number } } | { kind: 'wander'; at: { x: number; y: number } };

export class BotBrain {
  private path: { x: number; y: number }[] = [];
  private wp = 0;
  private goal: Goal | null = null;
  private last = { x: 0, y: 0 };
  private stuck = 0;
  private lastPos = { x: 0, y: 0 };
  private alibiAt: number;
  private nextChatAt: number;
  private searched = new Set<string>();
  private idleUntil = 0;

  constructor(
    private g: GameInstance,
    readonly id: string,
    private rnd: () => number,
  ) {
    this.alibiAt = 15 + Math.floor(rnd() * 40);
    // graphe de marche calculé dès le lancement (une fois), pas au milieu de la partie
    findPath(g.players.get(id)!.pos, g.players.get(id)!.pos, g.unlockedDoors);
    this.nextChatAt = 30 + Math.floor(rnd() * 60);
  }

  private get me() {
    return this.g.players.get(this.id)!;
  }

  private act(a: Parameters<GameInstance['action']>[1]) {
    try {
      return this.g.action(this.id, a);
    } catch {
      return undefined;
    }
  }

  private say(text: string) {
    try {
      this.g.sendChat(this.id, 'general', text);
    } catch {
      /* hors jeu */
    }
  }

  /** À chaque pas de simulation : suit son chemin (mêmes règles de déplacement que les humains). */
  steer() {
    const p = this.me;
    if (!p.alive || p.arrested || this.g.ended || this.g.phase === 'ARRIVAL' || !this.goal || this.wp >= this.path.length) {
      if (p.input.x || p.input.y) this.g.setInput(this.id, 0, 0);
      return;
    }
    const w = this.path[this.wp];
    // passage d'escalier ou d'échelle : on garde la direction jusqu'au changement de niveau
    if (levelOf(p.pos.x) !== levelOf(w.x)) return this.g.setInput(this.id, this.last.x, this.last.y);
    const dx = w.x - p.pos.x;
    const dy = w.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.3) {
      this.wp++;
      return;
    }
    this.last = { x: dx / d, y: dy / d };
    this.g.setInput(this.id, this.last.x, this.last.y, false);
  }

  /** Une fois par seconde : décisions (alibi, votes, interrogatoire, prochaine fouille). */
  think(elapsedSec: number) {
    const g = this.g;
    const p = this.me;
    if (!p.alive || p.arrested || g.ended) return;
    const cs = g.caseSystem;
    const truth = cs.truth;
    if (!truth) return;
    const camp = truth.players.get(this.id)?.camp;
    if (g.phase === 'ARRIVAL') return;

    // premier choix : toujours l'amitié (visible, rassurant)
    if (elapsedSec > 8 && !cs.stanceOf(this.id)) this.act({ type: 'stance', choice: 'friendship' });

    // alibi (vrai lieu ; le meurtrier tait son absence) — ou réponse à un interrogatoire
    if ((elapsedSec >= this.alibiAt || p.pendingTestimony) && !cs.alibis.has(this.id)) {
      const place = truth.players.get(this.id)!.place;
      const text = camp === 'murderer' ? 'Je ne suis pas sorti·e de la soirée, à part une cigarette.' : 'J’y suis resté·e, d’autres peuvent le confirmer.';
      this.act({ type: 'alibi', place, text });
      const al = cs.alibis.get(this.id);
      if (al) this.say(CHAT_ALIBI[Math.floor(this.rnd() * CHAT_ALIBI.length)].replace('{place}', al.placeName));
    } else if (p.pendingTestimony) this.act({ type: 'testimony', requestId: p.pendingTestimony.requestId, decline: true });

    // vote en cours
    const v = cs.vote;
    if (v && v.eligible.has(this.id) && !v.ballots.has(this.id)) {
      if (v.kind === 'accusation') this.act({ type: 'ballot', choice: this.judge(v.accusedId!, camp) });
      else {
        const pick = this.finalPick(camp);
        if (pick) this.act({ type: 'ballot', choice: pick });
      }
    }

    // meurtrier : une occasion se présente (opposant isolé, sans témoin)
    if (camp === 'murderer') {
      const o = cs.opportunityFor(p);
      if (o && this.rnd() < 0.35) this.act({ type: 'act', targetId: o.target.id, objectId: o.weapon.id });
    }

    if (elapsedSec >= this.nextChatAt) {
      this.nextChatAt = elapsedSec + 60 + Math.floor(this.rnd() * 90);
      this.say(CHAT_SEARCH[Math.floor(this.rnd() * CHAT_SEARCH.length)]);
    }

    // déplacement : progression, blocage, arrivée
    const moved = Math.hypot(p.pos.x - this.lastPos.x, p.pos.y - this.lastPos.y);
    this.lastPos = { ...p.pos };
    if (this.goal && this.wp < this.path.length) {
      this.stuck = moved < 0.05 ? this.stuck + 1 : 0;
      if (this.stuck >= 4) this.goal = null;
      return;
    }
    if (this.goal?.kind === 'search') {
      this.searched.add(this.goal.f.id);
      this.act({ type: 'search', furnitureId: this.goal.f.id });
      this.idleUntil = elapsedSec + 2 + Math.floor(this.rnd() * 4);
      this.goal = null;
      return;
    }
    if (elapsedSec < this.idleUntil) return;
    this.planNext();
  }

  /** Vote d'accusation : sur les seuls alibis publics (innocent), ou selon son camp (meurtrier, protecteur). */
  private judge(accusedId: string, camp: string | undefined): 'guilty' | 'innocent' {
    const cs = this.g.caseSystem;
    const mId = cs.truth.murdererId;
    if (camp === 'murderer') return accusedId === this.id ? 'innocent' : 'guilty';
    if (camp === 'protector' && !cs.isFreed(this.id)) return accusedId === mId ? 'innocent' : 'guilty';
    const st = cs.alibis.get(accusedId)?.status;
    if (st === 'contradicted') return 'guilty';
    if (st === 'confirmed') return 'innocent';
    return this.rnd() < 0.4 ? 'guilty' : 'innocent';
  }

  private finalPick(camp: string | undefined): string | null {
    const cs = this.g.caseSystem;
    const others = cs.freePlayers().filter((x) => x.id !== this.id);
    if (!others.length) return null;
    if (camp === 'murderer' || (camp === 'protector' && !cs.isFreed(this.id))) {
      const pool = others.filter((x) => x.id !== cs.truth.murdererId);
      return (pool[Math.floor(this.rnd() * pool.length)] ?? others[0]).id;
    }
    const suspect = others.find((x) => cs.alibis.get(x.id)?.status === 'contradicted');
    return (suspect ?? others[Math.floor(this.rnd() * others.length)]).id;
  }

  /** Prochaine cachette à fouiller (accessible, pas encore fouillée par ce joueur), sinon une promenade. */
  private planNext() {
    const p = this.me;
    const unlocked = this.g.unlockedDoors;
    const locked = new Set(this.g.caseSystem.lockedFurnitureIds());
    const cands = allFurniture().filter((f) => f.hiding && !this.searched.has(f.id) && !locked.has(f.id));
    for (let tries = 0; tries < 6 && cands.length; tries++) {
      const f = cands.splice(Math.floor(this.rnd() * cands.length), 1)[0];
      const sides = [
        { x: f.x + f.w / 2, y: f.y + f.h + 0.6 },
        { x: f.x + f.w / 2, y: f.y - 0.6 },
        { x: f.x - 0.6, y: f.y + f.h / 2 },
        { x: f.x + f.w + 0.6, y: f.y + f.h / 2 },
      ].filter((pt) => roomAt(grid, pt.x, pt.y)?.id === f.roomId);
      for (const at of sides) {
        const path = findPath(p.pos, at, unlocked);
        if (path && path.length > 1) {
          this.goal = { kind: 'search', f, at };
          this.path = path;
          this.wp = 1;
          this.stuck = 0;
          return;
        }
      }
      this.searched.add(f.id);
    }
    this.searched.clear();
  }
}
