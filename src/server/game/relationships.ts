/**
 * Relations entre joueurs : FRIEND / ALLY / PACT (consentement mutuel), ENEMY / VENDETTA (unilatérales).
 * Chaque relation a un type, une date, une origine, un historique et des conséquences :
 *  - ALLY / PACT : canal privé, positions partagées, partage de connaissances en un clic
 *  - PACT : inventaires visibles entre membres ; le rompre = TRAHISON (débloque la vendetta)
 *  - ENEMY : notifie la cible, fait monter la tension (événements)
 *  - VENDETTA : secrète, exige un mobile, crée une opportunité plus tôt dans la nuit
 * Le système ne force jamais un joueur à agir contre son ennemi.
 */
import type { RelationType, RelationView } from '@shared/types';
import type { GameInstance } from './GameInstance';
import type { Relation, SocialEvent } from './state';
import { shortId, UserError } from '../util';

const MUTUAL: RelationType[] = ['FRIEND', 'ALLY', 'PACT'];
const LABEL: Record<RelationType, string> = {
  FRIEND: 'amitié',
  ALLY: 'alliance',
  PACT: 'pacte',
  ENEMY: 'inimitié',
  VENDETTA: 'vendetta',
};

export class RelationshipSystem {
  constructor(private g: GameInstance) {}

  private add(type: RelationType, from: string, to: string, status: Relation['status'], origin: string): Relation {
    const r: Relation = {
      id: shortId('r_'),
      type,
      from,
      to,
      status,
      createdAt: this.g.clock(),
      origin,
      history: [{ at: this.g.clock(), text: origin }],
    };
    this.g.relations.push(r);
    return r;
  }

  social(kind: SocialEvent['kind'], actorId: string, targetId: string, text: string, isPublic: boolean) {
    this.g.social.push({ clock: this.g.clock(), kind, actorId, targetId, text, public: isPublic });
    const a = this.g.players.get(actorId);
    if (a) a.metrics.socialActions++;
  }

  between(a: string, b: string, type?: RelationType, status: Relation['status'] = 'active'): Relation | undefined {
    return this.g.relations.find(
      (r) =>
        r.status === status &&
        (!type || r.type === type) &&
        ((r.from === a && r.to === b) || (MUTUAL.includes(r.type) && r.from === b && r.to === a)),
    );
  }

  /** Alliés au sens large (ALLY ou PACT actifs). */
  alliesOf(id: string): string[] {
    return this.g.relations
      .filter((r) => r.status === 'active' && (r.type === 'ALLY' || r.type === 'PACT') && (r.from === id || r.to === id))
      .map((r) => (r.from === id ? r.to : r.from));
  }

  pactPartners(id: string): string[] {
    return this.g.relations
      .filter((r) => r.status === 'active' && r.type === 'PACT' && (r.from === id || r.to === id))
      .map((r) => (r.from === id ? r.to : r.from));
  }

  createHidden(type: RelationType, a: string, b: string, origin: string) {
    const r = this.add(type, a, b, 'active', origin);
    this.g.log('RELATION_CREATED', { actorId: a, targetId: b, data: { relType: type, relationId: r.id, hidden: true }, text: `${this.g.nameOf(a)} et ${this.g.nameOf(b)} : ${LABEL[type]} (${origin})` });
    return r;
  }

  propose(fromId: string, relType: RelationType, targetId: string): string {
    const g = this.g;
    const from = g.players.get(fromId)!;
    const target = g.players.get(targetId);
    if (!target || targetId === fromId) throw new UserError('Cible invalide.');
    if (!target.alive) throw new UserError('Cette personne ne peut plus vous répondre.');

    if (MUTUAL.includes(relType)) {
      if (target.roomId !== from.roomId) throw new UserError('Il faut être dans la même pièce pour proposer cela.');
      if (this.between(fromId, targetId, relType)) throw new UserError('Cette relation existe déjà.');
      if (this.between(fromId, targetId, relType, 'pending') || this.between(targetId, fromId, relType, 'pending'))
        throw new UserError('Une proposition est déjà en attente.');
      const r = this.add(relType, fromId, targetId, 'pending', `Proposée par ${from.name}`);
      g.log('RELATION_PROPOSED', { actorId: fromId, targetId, roomId: from.roomId, data: { relType, relationId: r.id }, text: `${from.name} propose un·e ${LABEL[relType]} à ${target.name}` });
      g.feed(targetId, 'whisper', `${from.name} vous propose un·e ${LABEL[relType]}. (onglet Relations)`);
      g.markDirty(targetId, fromId);
      return `Proposition envoyée à ${target.name}.`;
    }

    if (relType === 'ENEMY') {
      if (this.between(fromId, targetId, 'ENEMY')) throw new UserError('Déjà déclaré·e ennemi·e.');
      this.breakMutual(fromId, targetId, 'Rompue par une déclaration d’hostilité');
      this.add('ENEMY', fromId, targetId, 'active', `Déclarée par ${from.name}`);
      this.social('declared_enemy', fromId, targetId, `${from.name} a déclaré ${target.name} ennemi·e`, true);
      g.feed(targetId, 'danger', `${from.name} vous a déclaré son ennemi·e.`);
      g.perceive(fromId, `${from.name} et ${target.name} se disputent violemment.`, { exclude: [targetId] });
      g.log('RELATION_CREATED', { actorId: fromId, targetId, roomId: from.roomId, data: { relType: 'ENEMY' }, text: `${from.name} déclare ${target.name} ennemi·e` });
      g.markDirty(targetId, fromId);
      return `${target.name} est désormais votre ennemi·e.`;
    }

    // VENDETTA : nécessite un mobile
    const betrayed = g.social.some((s) => s.kind === 'betrayed' && s.actorId === targetId && s.targetId === fromId);
    const declared = !!this.between(targetId, fromId, 'ENEMY');
    const motive = from.motiveAgainst.has(targetId);
    if (!betrayed && !declared && !motive)
      throw new UserError('Une vendetta exige un mobile : trahison, hostilité déclarée ou vieille rancune.');
    if (this.between(fromId, targetId, 'VENDETTA')) throw new UserError('Vendetta déjà jurée.');
    this.add('VENDETTA', fromId, targetId, 'active', betrayed ? 'Trahison' : declared ? 'Hostilité déclarée' : 'Vieille rancune');
    from.motiveAgainst.add(targetId);
    this.social('vendetta', fromId, targetId, `${from.name} a juré une vendetta contre ${target.name}`, false);
    g.log('RELATION_CREATED', { actorId: fromId, targetId, data: { relType: 'VENDETTA' }, text: `${from.name} jure une vendetta contre ${target.name}` });
    g.markDirty(fromId);
    return `Vous avez juré une vendetta contre ${target.name}. Personne d’autre ne le sait.`;
  }

  respond(userId: string, relationId: string, accept: boolean): string {
    const g = this.g;
    const r = g.relations.find((x) => x.id === relationId);
    if (!r || r.status !== 'pending' || r.to !== userId) throw new UserError('Proposition introuvable.');
    const me = g.players.get(userId)!;
    const other = g.players.get(r.from)!;
    if (!accept) {
      r.status = 'broken';
      r.history.push({ at: g.clock(), text: `Refusée par ${me.name}` });
      g.feed(r.from, 'whisper', `${me.name} a refusé votre proposition.`);
      g.log('RELATION_DECLINED', { actorId: userId, targetId: r.from, data: { relType: r.type }, text: `${me.name} refuse le/la ${LABEL[r.type]} de ${other.name}` });
      g.markDirty(userId, r.from);
      return 'Proposition refusée.';
    }
    r.status = 'active';
    r.history.push({ at: g.clock(), text: `Acceptée par ${me.name}` });
    const kind = r.type === 'FRIEND' ? 'friend' : r.type === 'ALLY' ? 'allied' : 'pact';
    this.social(kind, r.from, userId, `${other.name} et ${me.name} : ${LABEL[r.type]}`, r.type !== 'PACT');
    if (r.type !== 'PACT' && me.roomId === other.roomId) g.perceive(userId, `${other.name} et ${me.name} se serrent la main.`, { exclude: [r.from] });
    g.feed(r.from, 'whisper', `${me.name} a accepté votre ${LABEL[r.type]}.`);
    g.log('RELATION_CREATED', { actorId: r.from, targetId: userId, data: { relType: r.type, relationId: r.id }, text: `${other.name} et ${me.name} scellent un·e ${LABEL[r.type]}` });
    g.markDirty(userId, r.from);
    return `${LABEL[r.type][0].toUpperCase()}${LABEL[r.type].slice(1)} scellé·e avec ${other.name}.`;
  }

  breakRelation(userId: string, relationId: string): string {
    const g = this.g;
    const r = g.relations.find((x) => x.id === relationId);
    if (!r || r.status !== 'active' || (r.from !== userId && (r.to !== userId || !MUTUAL.includes(r.type))))
      throw new UserError('Relation introuvable.');
    const otherId = r.from === userId ? r.to : r.from;
    const me = g.players.get(userId)!;
    const other = g.players.get(otherId)!;
    r.status = 'broken';
    r.history.push({ at: g.clock(), text: `Rompue par ${me.name}` });
    if (r.type === 'PACT') {
      this.social('betrayed', userId, otherId, `${me.name} a trahi ${other.name}`, false);
      g.log('BETRAYAL', { actorId: userId, targetId: otherId, data: { relType: 'BETRAYAL' }, text: `${me.name} trahit ${other.name} en rompant leur pacte` });
    } else if (r.type === 'ENEMY' || r.type === 'VENDETTA') {
      this.social('reconciled', userId, otherId, `${me.name} enterre la hache de guerre avec ${other.name}`, r.type === 'ENEMY');
      if (r.type === 'ENEMY') g.feed(otherId, 'whisper', `${me.name} ne vous considère plus comme un·e ennemi·e.`);
    } else {
      g.feed(otherId, 'whisper', `${me.name} a mis fin à votre ${LABEL[r.type]}.`);
    }
    g.log('RELATION_BROKEN', { actorId: userId, targetId: otherId, data: { relType: r.type }, text: `${me.name} rompt le/la ${LABEL[r.type]} avec ${other.name}` });
    g.markDirty(userId, otherId);
    return 'Relation rompue.';
  }

  private breakMutual(a: string, b: string, reason: string) {
    for (const r of this.g.relations) {
      if (r.status !== 'active' || !MUTUAL.includes(r.type)) continue;
      if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) {
        r.status = 'broken';
        r.history.push({ at: this.g.clock(), text: reason });
        if (r.type === 'PACT') {
          this.social('betrayed', a, b, `${this.g.nameOf(a)} a trahi ${this.g.nameOf(b)}`, false);
          this.g.log('BETRAYAL', { actorId: a, targetId: b, data: { relType: 'BETRAYAL' }, text: `${this.g.nameOf(a)} trahit ${this.g.nameOf(b)}` });
        }
      }
    }
  }

  /** Relations visibles par un joueur : celles qui le concernent. */
  viewFor(id: string): RelationView[] {
    return this.g.relations
      .filter((r) => r.from === id || r.to === id)
      .filter((r) => !(r.type === 'VENDETTA' && r.from !== id))
      .filter((r) => !(r.status === 'broken' && r.history.length <= 1))
      .map((r) => ({ id: r.id, type: r.type, status: r.status, from: r.from, to: r.to, createdAt: r.createdAt, origin: r.origin, history: r.history }));
  }
}
