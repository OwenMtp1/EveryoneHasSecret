/**
 * Interactions physiques génériques : objets, mobilier, portes, hygiène… et le passage à l'acte.
 * Aucune action n'est codée pour un objet précis : tout passe par les tags et useEffect des données.
 * Chaque action : valide → applique → journalise (vérité) → perception des témoins.
 */
import type { GameAction } from '@shared/protocol';
import type { GestureKind } from '@shared/types';
import { DOORS, FURNITURE, furnitureById, roomName } from '@shared/content/villa';
import { GAME_CONFIG, formatClock } from '@shared/config';
import type { GameInstance } from './GameInstance';
import type { GameObject, PlayerState } from './state';
import { UserError } from '../util';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export class ActionSystem {
  constructor(private g: GameInstance) {}

  // ───────────── helpers ─────────────

  objectPos(o: GameObject): { x: number; y: number } | null {
    if (o.location.kind === 'floor' || o.location.kind === 'hidden') return o.location.pos;
    if (o.location.kind === 'player') return this.g.players.get(o.location.playerId)?.pos ?? null;
    return null;
  }

  private owned(p: PlayerState, objectId: string): GameObject {
    const o = this.g.objects.get(objectId);
    if (!o || o.location.kind !== 'player' || o.location.playerId !== p.id) throw new UserError('Vous n’avez pas cet objet.');
    return o;
  }

  /** Objet en main OU visible à portée. */
  reachable(p: PlayerState, objectId: string): GameObject {
    const o = this.g.objects.get(objectId);
    if (!o) throw new UserError('Objet introuvable.');
    if (o.location.kind === 'player' && o.location.playerId === p.id) return o;
    if (o.location.kind === 'floor' && o.location.roomId === p.roomId && dist(o.location.pos, p.pos) <= GAME_CONFIG.interactRange && this.g.canSeeRoom(p))
      return o;
    if (o.location.kind === 'hidden' && o.knownBy.has(p.id) && o.location.roomId === p.roomId && dist(o.location.pos, p.pos) <= GAME_CONFIG.interactRange + 0.8)
      return o;
    throw new UserError('Trop loin.');
  }

  private nearFurniture(p: PlayerState, furnitureId: string) {
    const f = furnitureById(furnitureId);
    if (!f || f.roomId !== p.roomId) throw new UserError('Meuble introuvable ici.');
    const cx = Math.max(f.x, Math.min(p.pos.x, f.x + f.w));
    const cy = Math.max(f.y, Math.min(p.pos.y, f.y + f.h));
    if (Math.hypot(cx - p.pos.x, cy - p.pos.y) > GAME_CONFIG.interactRange) throw new UserError('Approchez-vous du meuble.');
    return f;
  }

  private nearPlayer(p: PlayerState, targetId: string): PlayerState {
    const t = this.g.players.get(targetId);
    if (!t || t.id === p.id || !t.alive) throw new UserError('Personne à portée.');
    if (t.roomId !== p.roomId || dist(t.pos, p.pos) > GAME_CONFIG.interactRange + 0.4) throw new UserError('Approchez-vous.');
    return t;
  }

  touch(p: PlayerState, o: GameObject) {
    const last = o.traces[o.traces.length - 1];
    if (!(last && last.kind === 'print' && last.playerId === p.id && !last.cleaned)) {
      o.traces.push({ kind: 'print', playerId: p.id, clock: this.g.clock(), cleaned: false });
    }
    p.metrics.objectsTouched++;
    this.g.log('PLAYER_TOUCHED_OBJECT', { actorId: p.id, objectId: o.id, roomId: p.roomId });
  }

  private history(o: GameObject, text: string) {
    o.history.push({ clock: this.g.clock(), text });
  }

  private moveToPlayer(o: GameObject, p: PlayerState) {
    if (p.inventory.length >= GAME_CONFIG.inventorySize) throw new UserError('Inventaire plein.');
    if (o.location.kind === 'player') {
      const prev = this.g.players.get(o.location.playerId);
      if (prev) prev.inventory = prev.inventory.filter((id) => id !== o.id);
    }
    o.location = { kind: 'player', playerId: p.id };
    p.inventory.push(o.id);
  }

  private removeFromPlayer(o: GameObject) {
    if (o.location.kind !== 'player') return;
    const prev = this.g.players.get(o.location.playerId);
    if (prev) prev.inventory = prev.inventory.filter((id) => id !== o.id);
    if (o.def.tags.includes('light')) o.lit = false;
  }

  // ───────────── dispatcher ─────────────

  handle(p: PlayerState, a: GameAction): string | undefined {
    if (!p.alive && a.type !== 'vote') throw new UserError('Vous n’êtes plus de ce monde.');
    if (this.g.ended) throw new UserError('La partie est terminée.');
    const msg = this.dispatch(p, a);
    const GESTURE: Partial<Record<GameAction['type'], GestureKind>> = {
      take: 'take', drop: 'drop', hide: 'hide', give: 'give', use: 'use', examine: 'examine',
      search: 'search', clean: 'clean', destroy: 'destroy', wash: 'wash', act: 'attack',
    };
    const g = GESTURE[a.type];
    if (g) this.g.gesture(p, g, g === 'search' || g === 'wash' ? 1900 : 1400);
    return msg;
  }

  private dispatch(p: PlayerState, a: GameAction): string | undefined {
    switch (a.type) {
      case 'take':
        return this.take(p, a.objectId);
      case 'drop':
        return this.drop(p, a.objectId);
      case 'hide':
        return this.hide(p, a.objectId, a.furnitureId);
      case 'give':
        return this.give(p, a.objectId, a.targetId);
      case 'use':
        return this.use(p, a.objectId);
      case 'examine':
        return this.examine(p, a.objectId);
      case 'search':
        return this.search(p, a.furnitureId);
      case 'clean':
        return this.clean(p, a.toolId, a.targetKind, a.targetId);
      case 'destroy':
        return this.destroy(p, a.objectId);
      case 'wash':
        return this.wash(p);
      case 'act':
        return this.act(p, a.targetId, a.objectId);
      default:
        throw new UserError('Action inconnue.');
    }
  }

  // ───────────── objets ─────────────

  take(p: PlayerState, objectId: string) {
    const o = this.reachable(p, objectId);
    if (o.location.kind === 'player') throw new UserError('Vous l’avez déjà.');
    const wasHidden = o.location.kind === 'hidden';
    const fromRoom = o.location.kind === 'floor' || o.location.kind === 'hidden' ? o.location.roomId : p.roomId;
    this.moveToPlayer(o, p);
    o.knownBy.clear();
    this.touch(p, o);
    this.history(o, `Pris par ${p.name} — ${roomName(fromRoom)}`);
    if (o.type === 'necklace' && !o.props.firstTakerId) {
      o.props.firstTakerId = p.id;
      o.props.firstTakenAt = this.g.clock();
    }
    this.g.log('OBJECT_PICKED_UP', { actorId: p.id, objectId: o.id, roomId: p.roomId, data: { hidden: wasHidden }, text: `${p.name} prend ${o.name.toLowerCase()} — ${roomName(p.roomId)}` });
    this.g.perceive(p.id, wasHidden ? `${p.name} récupère quelque chose de caché.` : `${p.name} ramasse : ${o.name.toLowerCase()}.`);
    return `Vous prenez : ${o.name}.`;
  }

  drop(p: PlayerState, objectId: string) {
    const o = this.owned(p, objectId);
    this.removeFromPlayer(o);
    o.location = { kind: 'floor', roomId: p.roomId, pos: { x: p.pos.x, y: p.pos.y } };
    this.history(o, `Posé par ${p.name} — ${roomName(p.roomId)}`);
    this.g.log('OBJECT_DROPPED', { actorId: p.id, objectId: o.id, roomId: p.roomId, text: `${p.name} pose ${o.name.toLowerCase()} — ${roomName(p.roomId)}` });
    this.g.perceive(p.id, `${p.name} pose : ${o.name.toLowerCase()}.`);
    return `Vous posez : ${o.name}.`;
  }

  hide(p: PlayerState, objectId: string, furnitureId: string) {
    const o = this.owned(p, objectId);
    const f = this.nearFurniture(p, furnitureId);
    if (!f.hiding) throw new UserError('Impossible de cacher quoi que ce soit ici.');
    this.removeFromPlayer(o);
    o.location = { kind: 'hidden', roomId: f.roomId, furnitureId: f.id, pos: { x: f.x + f.w / 2, y: f.y + f.h / 2 } };
    o.knownBy = new Set([p.id]);
    this.history(o, `Caché par ${p.name} — ${f.name}, ${roomName(f.roomId)}`);
    this.g.log('OBJECT_HIDDEN', { actorId: p.id, objectId: o.id, roomId: p.roomId, data: { furnitureId: f.id }, text: `${p.name} cache ${o.name.toLowerCase()} dans : ${f.name} (${roomName(f.roomId)})` });
    this.g.perceive(p.id, `${p.name} glisse quelque chose dans : ${f.name.toLowerCase()}.`, { important: true });
    return `${o.name} est caché·e dans : ${f.name}.`;
  }

  give(p: PlayerState, objectId: string, targetId: string) {
    const o = this.owned(p, objectId);
    const t = this.nearPlayer(p, targetId);
    this.moveToPlayer(o, t);
    this.touch(t, o);
    this.history(o, `Donné par ${p.name} à ${t.name}`);
    this.g.relationships.social('helped', p.id, t.id, `${p.name} a donné ${o.name.toLowerCase()} à ${t.name}`, true);
    this.g.log('OBJECT_GIVEN', { actorId: p.id, targetId: t.id, objectId: o.id, roomId: p.roomId, text: `${p.name} donne ${o.name.toLowerCase()} à ${t.name}` });
    this.g.feed(t.id, 'whisper', `${p.name} vous donne : ${o.name}.`);
    this.g.know(t.id, 'self', `${p.name} m’a donné : ${o.name}.`);
    this.g.perceive(p.id, `${p.name} remet quelque chose à ${t.name}.`, { exclude: [t.id] });
    this.g.markDirty(t.id);
    return `Vous donnez ${o.name} à ${t.name}.`;
  }

  examine(p: PlayerState, objectId: string) {
    const o = this.reachable(p, objectId);
    p.metrics.examinations++;
    const lines = [o.def.description];
    const blood = o.traces.some((t) => t.kind === 'blood' && !t.cleaned);
    const prints = o.traces.some((t) => t.kind === 'print' && !t.cleaned);
    if (blood) lines.push('Il y a du sang dessus.');
    if (o.cleanedAt !== undefined) lines.push('Il semble avoir été nettoyé récemment : une odeur de savon.');
    else if (prints) lines.push('Des traces de doigts sont visibles, impossibles à identifier sans analyse.');
    this.g.log('OBJECT_EXAMINED', { actorId: p.id, objectId: o.id, roomId: p.roomId });
    const doc = this.readDocument(p, o);
    if (doc) lines.push(doc);
    const text = `${o.name} : ${lines.join(' ')}`;
    this.g.know(p.id, blood || doc ? 'evidence' : 'self', text, { important: blood || !!doc });
    return text;
  }

  private readDocument(p: PlayerState, o: GameObject): string | null {
    const g = this.g;
    if (o.type === 'letter' && typeof o.props.secretOf === 'string') {
      const owner = g.players.get(o.props.secretOf);
      if (!owner) return null;
      if (!o.props[`read_${p.id}`]) {
        o.props[`read_${p.id}`] = true;
        g.log('SECRET_DISCOVERED', { actorId: p.id, targetId: owner.id, objectId: o.id, text: `${p.name} découvre le secret de ${owner.name} grâce à une lettre anonyme` });
      }
      return owner.id === p.id
        ? `Votre propre secret est écrit ici, noir sur blanc : « ${owner.secretReveal} ». Quelqu’un sait.`
        : `Écrit à l’encre noire : « ${owner.secretReveal} »`;
    }
    if (o.type === 'photo' && typeof o.props.aboutPlayerId === 'string') {
      const about = g.players.get(o.props.aboutPlayerId);
      if (!about) return null;
      if (!o.props[`read_${p.id}`] && p.id !== o.props.ownerSecretOf) {
        o.props[`read_${p.id}`] = true;
        g.log('SECRET_DISCOVERED', { actorId: p.id, targetId: about.id, objectId: o.id, text: `${p.name} voit la photo compromettante de ${about.name}` });
      }
      return `On y reconnaît ${about.name}, dans une situation très compromettante. Au dos : « Je garde les négatifs. »`;
    }
    if (o.type === 'phone' && typeof o.props.message === 'string') return o.props.message;
    return null;
  }

  search(p: PlayerState, furnitureId: string) {
    const f = this.nearFurniture(p, furnitureId);
    if (!f.hiding) return `${f.name} : rien à fouiller.`;
    const found = [...this.g.objects.values()].filter((o) => o.location.kind === 'hidden' && o.location.furnitureId === f.id);
    this.g.log('FURNITURE_SEARCHED', { actorId: p.id, roomId: p.roomId, data: { furnitureId: f.id, found: found.map((o) => o.id) }, text: `${p.name} fouille : ${f.name}` });
    this.g.perceive(p.id, `${p.name} fouille : ${f.name.toLowerCase()}.`);
    if (!found.length) {
      this.g.know(p.id, 'self', `${f.name} (${roomName(f.roomId)}) : rien de caché à ${formatClock(this.g.clock())}.`);
      return `Vous fouillez ${f.name.toLowerCase()}… rien.`;
    }
    for (const o of found) {
      o.knownBy.add(p.id);
      this.g.log('OBJECT_FOUND', { actorId: p.id, objectId: o.id, roomId: p.roomId, text: `${p.name} trouve ${o.name.toLowerCase()} caché dans : ${f.name}` });
    }
    const names = found.map((o) => o.name).join(', ');
    this.g.know(p.id, 'evidence', `Caché dans ${f.name.toLowerCase()} (${roomName(f.roomId)}) : ${names}.`, { important: true });
    return `Vous trouvez : ${names}.`;
  }

  use(p: PlayerState, objectId: string) {
    const o = this.owned(p, objectId);
    const g = this.g;
    switch (o.def.useEffect) {
      case 'unlock':
      case 'force': {
        const door = DOORS.find(
          (d) => d.lockedBy && !g.unlockedDoors.has(d.id) && Math.hypot(d.x + 0.5 - p.pos.x, d.y + 0.5 - p.pos.y) <= 2 && (o.def.useEffect === 'force' || d.lockedBy === o.def.unlocks),
        );
        if (!door) throw new UserError(o.def.useEffect === 'unlock' ? 'Aucune serrure correspondante à proximité.' : 'Aucune porte verrouillée à proximité.');
        g.unlockedDoors.add(door.id);
        // Les deux battants d'une même serrure s'ouvrent ensemble
        for (const d of DOORS) if (d.lockedBy === door.lockedBy && d.rooms.includes(door.rooms[0]) && d.rooms.includes(door.rooms[1])) g.unlockedDoors.add(d.id);
        this.touch(p, o);
        if (o.def.useEffect === 'force') {
          g.addEvidence('forced_lock', p.roomId, { x: door.x + 0.5, y: door.y + 0.5 }, { doorId: door.id }, true, p.id);
          g.log('DOOR_FORCED', { actorId: p.id, roomId: p.roomId, objectId: o.id, data: { doorId: door.id }, text: `${p.name} force : ${door.label ?? 'une porte'}` });
          g.hearFrom(p.roomId, `Un raclement métallique, puis un claquement sec — du côté de : ${roomName(p.roomId)}.`, p.id);
          g.perceive(p.id, `${p.name} force la serrure : ${door.label ?? 'une porte'}.`, { important: true });
        } else {
          g.log('DOOR_UNLOCKED', { actorId: p.id, roomId: p.roomId, objectId: o.id, data: { doorId: door.id }, text: `${p.name} déverrouille : ${door.label ?? 'une porte'}` });
          g.perceive(p.id, `${p.name} déverrouille : ${door.label ?? 'une porte'}.`);
        }
        g.markAllDirty();
        return `${door.label ?? 'La porte'} est ouverte.`;
      }
      case 'toggle_light':
        o.lit = !o.lit;
        g.log('OBJECT_USED', { actorId: p.id, objectId: o.id, data: { lit: o.lit } });
        return o.lit ? 'Vous allumez la lampe.' : 'Vous éteignez la lampe.';
      case 'read':
      case 'phone':
        return this.examine(p, objectId);
      case 'calm':
        g.log('OBJECT_USED', { actorId: p.id, objectId: o.id, text: `${p.name} avale un somnifère` });
        return 'Vous avalez un comprimé. Vos mains tremblent un peu moins.';
      default:
        throw new UserError('Cet objet ne s’utilise pas ainsi.');
    }
  }

  clean(p: PlayerState, toolId: string, targetKind: 'object' | 'trace', targetId: string) {
    const tool = this.owned(p, toolId);
    if (!tool.def.tags.includes('cleaning')) throw new UserError('Il vous faut de quoi nettoyer.');
    const g = this.g;
    if (targetKind === 'object') {
      const o = this.reachable(p, targetId);
      if (o.id === tool.id) throw new UserError('Impossible.');
      const hadBlood = o.traces.some((t) => t.kind === 'blood' && !t.cleaned);
      for (const t of o.traces) t.cleaned = true;
      o.cleanedAt = g.clock();
      if (hadBlood) tool.traces.push({ kind: 'blood', playerId: (o.traces.find((t) => t.kind === 'blood')?.playerId ?? p.id), clock: g.clock(), cleaned: false });
      this.touch(p, tool);
      this.history(o, `Nettoyé par ${p.name}`);
      g.log('OBJECT_CLEANED', { actorId: p.id, objectId: o.id, roomId: p.roomId, text: `${p.name} essuie soigneusement ${o.name.toLowerCase()}` });
      g.perceive(p.id, `${p.name} essuie soigneusement : ${o.name.toLowerCase()}.`, { important: true });
      return `${o.name} est propre. En apparence.`;
    }
    const ev = g.evidence.find((e) => e.id === targetId && !e.cleaned && e.roomId === p.roomId && dist(e.pos, p.pos) <= GAME_CONFIG.interactRange + 0.5);
    if (!ev) throw new UserError('Aucune trace à nettoyer ici.');
    ev.cleaned = true;
    g.addEvidence('smear', p.roomId, ev.pos, { cleanedKind: ev.kind }, false, p.id);
    if (ev.kind === 'blood_pool') tool.traces.push({ kind: 'blood', playerId: ev.sourceId ?? p.id, clock: g.clock(), cleaned: false });
    g.log('EVIDENCE_DESTROYED', { actorId: p.id, roomId: p.roomId, data: { evidenceId: ev.id, kind: ev.kind }, text: `${p.name} nettoie une trace (${ev.kind}) — ${roomName(p.roomId)}` });
    g.perceive(p.id, `${p.name} frotte le sol avec un torchon.`, { important: true });
    g.markAllDirty();
    return 'La trace a disparu… presque.';
  }

  destroy(p: PlayerState, objectId: string) {
    const o = this.owned(p, objectId);
    if (!o.def.tags.includes('destructible')) throw new UserError('Impossible de détruire cet objet.');
    const fire = p.inventory.map((id) => this.g.objects.get(id)!).find((x) => x.def.tags.includes('fire'));
    const nearFireplace = FURNITURE.some((f) => f.kind === 'fireplace' && f.roomId === p.roomId && Math.hypot(f.x + 0.5 - p.pos.x, f.y + 1 - p.pos.y) < 2.2);
    if (!fire && !nearFireplace) throw new UserError('Il vous faut une flamme : un briquet, ou la cheminée.');
    this.removeFromPlayer(o);
    o.location = { kind: 'destroyed' };
    this.history(o, `Brûlé par ${p.name}`);
    this.g.addEvidence('ashes', p.roomId, { x: p.pos.x, y: p.pos.y }, { objectType: o.type }, true, p.id);
    this.g.log('OBJECT_DESTROYED', { actorId: p.id, objectId: o.id, roomId: p.roomId, text: `${p.name} brûle ${o.name.toLowerCase()} — ${roomName(p.roomId)}` });
    this.g.perceive(p.id, `${p.name} brûle un papier. Une odeur âcre emplit la pièce.`, { important: true });
    return `${o.name} n’est plus que cendres.`;
  }

  wash(p: PlayerState) {
    const sink = FURNITURE.find((f) => f.kind === 'sink' && f.roomId === p.roomId && Math.hypot(f.x + f.w / 2 - p.pos.x, f.y + 0.5 - p.pos.y) <= GAME_CONFIG.interactRange + 0.6);
    if (!sink) throw new UserError('Il faut un évier ou un lavabo.');
    const g = this.g;
    const wasStained = p.stained;
    p.stained = false;
    if (wasStained) g.addEvidence('diluted_blood', p.roomId, { x: sink.x + 0.5, y: sink.y + 0.5 }, { sinkId: sink.id }, false, p.id);
    g.log('PLAYER_WASHED', { actorId: p.id, roomId: p.roomId, data: { stained: wasStained }, text: wasStained ? `${p.name} lave le sang de ses mains et de ses manches — ${sink.name}` : undefined });
    g.perceive(p.id, wasStained ? `${p.name} se lave longuement les mains à : ${sink.name.toLowerCase()}.` : `${p.name} se lave les mains.`, { important: wasStained });
    return wasStained ? 'L’eau rougit, puis redevient claire.' : 'Vous vous lavez les mains.';
  }

  // ───────────── le passage à l'acte ─────────────

  /**
   * Une opportunité n'existe que si le monde la crée : une arme létale en main,
   * une cible à portée, personne pour voir (ou le noir complet), et un contexte (tension ou mobile).
   */
  opportunityFor(p: PlayerState): { target: PlayerState; weapon: GameObject; dark: boolean } | null {
    const g = this.g;
    if (!p.alive || g.murders >= g.maxMurders || g.ended) return null;
    const dark = g.isBlackout();
    const weapon = p.inventory.map((id) => g.objects.get(id)!).find((o) => o.def.tags.includes('weapon') && o.def.tags.includes('lethal'));
    if (!weapon) return null;
    const phaseOk = g.opportunityPhases().includes(g.phase) || (dark && g.prePhases().includes(g.phase));
    for (const t of g.alivePlayers()) {
      if (t.id === p.id || t.roomId !== p.roomId || dist(t.pos, p.pos) > GAME_CONFIG.interactRange) continue;
      const motive = p.motiveAgainst.has(t.id) && g.motivePhases().includes(g.phase);
      if (!phaseOk && !motive) continue;
      const witnesses = g.alivePlayers().filter((w) => w.id !== p.id && w.id !== t.id && g.canSee(w, p));
      if (witnesses.length === 0) return { target: t, weapon, dark };
    }
    return null;
  }

  act(p: PlayerState, targetId: string, objectId: string) {
    const g = this.g;
    const opp = this.opportunityFor(p);
    if (!opp || opp.target.id !== targetId || opp.weapon.id !== objectId) throw new UserError('L’occasion est passée.');
    const { target: t, weapon } = opp;
    const clock = g.clock();
    g.murders++;
    // Vérité
    g.log('PLAYER_ATTACKED', { actorId: p.id, targetId: t.id, objectId: weapon.id, roomId: p.roomId, text: `${p.name} attaque ${t.name} avec ${weapon.name.toLowerCase()} — ${roomName(p.roomId)}` });
    t.alive = false;
    t.input = { x: 0, y: 0 };
    // Traces physiques
    this.touch(p, weapon);
    if (weapon.def.weaponClass !== 'strangle') {
      weapon.traces.push({ kind: 'blood', playerId: t.id, clock, cleaned: false });
      p.stained = true;
      g.addEvidence('blood_pool', t.roomId, { x: t.pos.x, y: t.pos.y }, { victimId: t.id }, true, t.id);
    }
    this.history(weapon, `Utilisé contre ${t.name}`);
    // L'inventaire de la victime tombe au sol
    for (const id of [...t.inventory]) {
      const o = g.objects.get(id)!;
      this.removeFromPlayer(o);
      o.location = { kind: 'floor', roomId: t.roomId, pos: { x: t.pos.x + (g.rnd() - 0.5), y: t.pos.y + (g.rnd() - 0.5) } };
    }
    g.bodies.push({
      id: `b_${t.id}`,
      playerId: t.id,
      roomId: t.roomId,
      pos: { ...t.pos },
      clock,
      diedAt: g.now(),
      killerId: p.id,
      weaponId: weapon.id,
      discovered: false,
    });
    g.log('PLAYER_DIED', { actorId: p.id, targetId: t.id, roomId: t.roomId, objectId: weapon.id, data: { victimId: t.id }, text: `${t.name} meurt — ${roomName(t.roomId)}, ${formatClock(clock)}` });
    // Perceptions
    g.know(t.id, 'seen', `${p.name} vous a attaqué·e avec ${weapon.name.toLowerCase()}. Tout est devenu noir.`, { important: true });
    g.feed(t.id, 'danger', `${p.name} vous a attaqué·e. Vous êtes mort·e. Vous pouvez encore observer… en silence.`);
    g.know(p.id, 'self', `J’ai tué ${t.name} avec ${weapon.name.toLowerCase()} — ${roomName(p.roomId)}, ${formatClock(clock)}.`, { important: true });
    const noise = weapon.def.weaponClass === 'strangle' ? 'Un râle étouffé, puis plus rien' : 'Un bruit sourd et un cri étouffé';
    g.hearFrom(p.roomId, `${noise} — du côté de : ${roomName(p.roomId)} (vers ${formatClock(clock)}).`, p.id, [t.id]);
    g.markAllDirty();
    return `C’est fait. ${t.name} ne se relèvera pas. Maintenant… il faut survivre à la suite.`;
  }
}
