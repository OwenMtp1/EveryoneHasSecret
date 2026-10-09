/**
 * Affaire en cours : règles de la nuit (serveur autoritaire).
 *
 *  ARRIVAL       découverte du corps, dossiers distribués (aucune accusation possible)
 *  INVESTIGATION fouilles, lectures, déverrouillages, dossier commun, alibis, accusations → votes
 *  RESOLUTION    délibération finale (police à l'aube)
 *  EPILOGUE      vérité complète
 *
 * OPPOSITION OFFICIELLE (irrévocable pour la partie) — enregistrée SEULEMENT par :
 *  1. une accusation formelle contre X (avec au moins une pièce lue jointe) ;
 *  2. un vote « coupable » lors d'un vote d'accusation contre X ;
 *  3. une pièce versée au dossier commun « contre X » (dénonciation formelle).
 * Soupçons, messages privés, questions et discussions n'en créent jamais.
 * Le meurtrier ne peut éliminer QUE ses opposants officiels (seul à seul, sans témoin, arme en main).
 *
 * VICTOIRE
 *  - Innocents : le meurtrier est arrêté (vote d'accusation ou délibération finale).
 *  - Meurtrier : il n'est pas arrêté à l'issue de la délibération finale (égalité = le doute profite
 *    à l'accusé), ou il ne reste qu'un seul joueur libre face à lui (plus aucune majorité possible).
 *    L'arrestation d'un innocent ne fait PAS gagner le meurtrier : la nuit continue.
 *  - Protecteur : gagne avec le meurtrier, sauf s'il s'est officiellement opposé à lui ou si son
 *    secret a été révélé publiquement (il est alors libéré du chantage et rejoint les innocents).
 */
import type {
  AlibiView,
  CaseView,
  DossierView,
  EpilogueView,
  EvidenceView,
  ObjectView,
  OppositionView,
  PhotoView,
  PublicEvidenceView,
  RoleView,
  VoteView,
} from '@shared/types';
import { castById } from '@shared/content/cast';
import { characterFromCast } from '@shared/content/character';
import { objectTypeDef } from '@shared/content/objects';
import { ROLES, roleById } from '@shared/content/roles';
import { DOORS, allFurniture, randomFreeTile, roomById, roomName } from '@shared/content/villa';
import { GAME_CONFIG, formatClock } from '@shared/config';
import type { GameInstance } from '../GameInstance';
import type { GameObject, PlayerState } from '../state';
import { buildCase, murdererBriefing, PLACES } from './director';
import type { CaseItemSpec, CaseTruth, EvidenceContent, Fact, Lock, PlaceId } from './model';
import { pick, shortId, shuffle, UserError } from '../../util';

/** Durées de base (secondes réelles, multipliées par l'échelle de la nuit). */
export const CASE_TIMING = {
  arrivalSec: 40,
  investigationSec: 900,
  blackoutAtFraction: 0.45,
  blackoutSec: 35,
  /** durées des votes (multipliées par l'échelle de test seulement) */
  accusationVoteSec: 60,
  finalVoteSec: 90,
  accusationCooldownSec: 75,
  accusationsPerPlayer: 2,
  eliminationCooldownSec: 60,
};

/** accord en genre selon le personnage incarné */
const ag = (p: PlayerState | undefined) => (p?.character.appearance === 'feminine' ? 'e' : '');

const WEAPON_CLASS_TEXT: Record<string, string> = {
  sharp: 'une plaie profonde et nette : une lame fine',
  blunt: 'un traumatisme crânien : un objet lourd et contondant',
  strangle: 'des marques de strangulation : un lien',
};

interface PublicEvidence extends PublicEvidenceView {
  facts: Fact[];
  againstId?: string;
}

interface Vote {
  id: string;
  kind: 'accusation' | 'final';
  trigger: string;
  accusedId?: string;
  accuserId?: string;
  text?: string;
  evidence: { title: string; lines: string[]; photos?: PhotoView[] }[];
  defense?: string;
  eligible: Set<string>;
  ballots: Map<string, string>;
  endsAt: number;
}

export class CaseSystem {
  truth!: CaseTruth;
  epilogue: EpilogueView | null = null;
  vote: Vote | null = null;
  /** objets d'affaire par référence locale */
  private refs = new Map<string, GameObject>();
  /** ce que chacun a lu : objet → contenu figé au moment de la lecture */
  private read = new Map<string, Map<string, EvidenceView>>();
  publicEvidence: PublicEvidence[] = [];
  alibis = new Map<string, AlibiView>();
  oppositions: OppositionView[] = [];
  private revealedSecrets = new Set<string>();
  private freedProtectors = new Set<string>();
  private votesHistory: EpilogueView['votes'] = [];
  private arrestedOrder: string[] = [];
  private lastAccusationAt = -Infinity;
  private lastEliminationAt = -Infinity;
  private investigationEndsAt = 0;
  private blackoutAt = 0;
  private victimBodyId = 'b_victim';
  /** meubles verrouillés (coffre-fort à code, tiroir et malle à clé) : verrou réel côté serveur */
  furnitureLocks = new Map<string, { kind: 'code'; code: string; fails: number; until: number } | { kind: 'key'; keyId: string }>();

  constructor(private g: GameInstance) {}

  // ───────────────────────── mise en place ─────────────────────────

  setup(opts: { victimCastId?: string; scenarioId?: string }) {
    const g = this.g;
    const players = [...g.players.values()];
    const taken = new Set(players.map((p) => p.character.castId));
    const victimCastId = opts.victimCastId && !taken.has(opts.victimCastId) ? opts.victimCastId : pick(['f', 'm'].flatMap((s) => Array.from({ length: 20 }, (_, i) => `${s}${String(i + 1).padStart(2, '0')}`)).filter((id) => !taken.has(id)), g.rnd);
    this.truth = buildCase({
      players: players.map((p) => ({ id: p.id, name: p.name, castId: p.character.castId, feminine: p.character.appearance === 'feminine' })),
      victimCastId,
      rnd: g.rnd,
      scenarioId: opts.scenarioId,
    });
    const t = this.truth;

    // le corps de la victime, dans la pièce du crime
    const vc = castById(t.victim.castId)!;
    const bodyPos = randomFreeTile(g.grid, t.victim.roomId, g.rnd);
    g.bodies.push({
      id: this.victimBodyId,
      playerId: 'victim',
      npc: { name: t.victim.name, character: characterFromCast(vc) },
      roomId: t.victim.roomId,
      pos: bodyPos,
      clock: t.murderAt,
      diedAt: g.now(),
      killerId: t.murdererId,
      weaponId: '',
      discovered: true,
      discoveredAt: g.clock(),
    });

    // objets de l'affaire
    for (const spec of t.items) this.spawn(spec, bodyPos);
    for (const spec of t.items) {
      const o = this.refs.get(spec.ref)!;
      if (spec.insertedRef) o.props.inserted = [this.refs.get(spec.insertedRef)!.id];
    }
    const weapon = this.refs.get(t.weaponRef)!;
    g.bodies[0].weaponId = weapon.id;
    this.setupFurnitureLocks(bodyPos);

    // traces physiques du crime : flaque de sang, empreintes de boue du jardin à la pièce, sang dilué
    const m = g.players.get(t.murdererId)!;
    g.addEvidence('blood_pool', t.victim.roomId, bodyPos, { victimId: 'victim' }, true, 'victim').clock = t.murderAt;
    const door = DOORS.find((d) => d.rooms.includes(t.victim.roomId));
    if (door) {
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const k = i / (steps - 1);
        const pos = { x: door.x + 0.5 + (bodyPos.x - door.x - 0.5) * k + (i % 2 ? 0.15 : -0.15), y: door.y + 0.5 + (bodyPos.y - door.y - 0.5) * k };
        const ev = g.addEvidence('footprint', t.victim.roomId, pos, { pattern: m.shoe.pattern, size: m.shoe.size, angle: Math.atan2(bodyPos.y - door.y, bodyPos.x - door.x) }, true, m.id);
        ev.clock = t.murderAt - 3;
      }
    }
    const sink = allFurniture().find((f) => f.kind === 'sink');
    if (sink) g.addEvidence('diluted_blood', sink.roomId, { x: sink.x + 0.5, y: sink.y + 0.5 }, { sinkId: sink.id }, false, m.id).clock = t.murderAt + 5;

    // spécialités d'enquête (le meurtrier en reçoit une aussi)
    const roles = shuffle(ROLES, g.rnd).slice(0, players.length);
    shuffle(players, g.rnd).forEach((p, i) => {
      const role = roles[i % roles.length];
      p.roleId = role.id;
      p.toolUses = {};
    });

    // dossiers personnels
    for (const p of players) {
      const pt = t.players.get(p.id)!;
      p.secretText = pt.secret.text;
      p.secretReveal = `${p.name} ${pt.secret.reveal}.`;
      this.read.set(p.id, new Map());
      g.know(p.id, 'secret', `Votre secret : ${pt.secret.text}`, { important: true });
      for (const mem of pt.memories) g.know(p.id, 'self', mem);
    }
    g.feedAll('announce', `${t.scenarioTitle.toUpperCase()} — ${t.victim.name} est mort${t.victim.feminine ? 'e' : ''}. ${roomName(t.victim.roomId)}.`);
    g.feedAll('narration', 'Ouvrez votre dossier (Tab). Fouillez, recoupez, déclarez votre alibi. Une accusation formelle déclenche un vote.');
    g.addBoard('system', null, t.publicBrief, true);

    const scale = g.timeScale;
    this.investigationEndsAt = g.now() + (CASE_TIMING.arrivalSec + CASE_TIMING.investigationSec) * 1000 * scale;
    this.blackoutAt = g.now() + (CASE_TIMING.arrivalSec + CASE_TIMING.investigationSec * CASE_TIMING.blackoutAtFraction) * 1000 * scale;
    g.log('CASE_OPENED', { text: `Affaire : ${t.scenarioTitle}. Victime : ${t.victim.name}. Meurtrier : ${m.name}.`, data: { scenario: t.scenarioId } });
  }

  /**
   * Meubles verrouillés de la villa intégrés à l'enquête (si la villa les contient) :
   *  - tiroir du bureau (clé sur le corps) : l'ordinateur de la victime ;
   *  - coffre-fort du bureau (code noté dans le journal) : les documents de l'histoire passée ;
   *  - malle du grenier (clé cachée ailleurs) : le coffret de la clé USB.
   */
  private setupFurnitureLocks(bodyPos: { x: number; y: number }) {
    const g = this.g;
    const furn = (id: string) => allFurniture().find((f) => f.id === id && f.lock);
    const put = (o: GameObject | undefined, f: { id: string; roomId: string; x: number; y: number; w: number; h: number }) => {
      if (o) o.location = { kind: 'hidden', roomId: f.roomId, furnitureId: f.id, pos: { x: f.x + f.w / 2, y: f.y + f.h / 2 } };
    };
    const desk = furn('f_office_desk');
    if (desk) {
      const key = this.spawnExtra('key', 'Petite clé de bureau', 'Une petite clé plate, trouvée dans la poche de la victime. « Bureau ».', { kind: 'hidden', roomId: this.truth.victim.roomId, furnitureId: `body:${this.victimBodyId}`, pos: { ...bodyPos } });
      this.furnitureLocks.set(desk.id, { kind: 'key', keyId: key.id });
      put(this.refs.get('laptop'), desk);
    }
    const safe = furn('f_office_safe');
    if (safe) {
      const code = String(1000 + Math.floor(g.rnd() * 9000));
      this.furnitureLocks.set(safe.id, { kind: 'code', code, fails: 0, until: 0 });
      for (const [ref, o] of this.refs) if (ref.startsWith('story_')) put(o, safe);
      const diary = this.content(this.refs.get('diary')!);
      diary?.lines.splice(2, 0, `« Le coffre-fort du bureau : ${code}. J’y ai mis tout ce que j’ai retrouvé sur cette histoire. »`);
    }
    const trunk = furn('f_attic_trunk');
    if (trunk) {
      const spots = allFurniture().filter((f) => f.hiding && !f.lock && ['garage', 'basement', 'laundry', 'mudroom', 'kidsroom', 'gamesroom'].includes(f.roomId));
      const spot = spots.length ? pick(spots, g.rnd) : null;
      const key = this.spawnExtra('key', 'Clé de la malle du grenier', 'Une grosse clé ancienne avec une étiquette : « Malle — grenier ».', spot ? { kind: 'hidden', roomId: spot.roomId, furnitureId: spot.id, pos: { x: spot.x + spot.w / 2, y: spot.y + spot.h / 2 } } : { kind: 'floor', roomId: 'hall', pos: randomFreeTile(g.grid, 'hall', g.rnd) });
      this.furnitureLocks.set(trunk.id, { kind: 'key', keyId: key.id });
      put(this.refs.get('usb_box'), trunk);
    }
  }

  private spawnExtra(type: string, name: string, description: string, location: GameObject['location']): GameObject {
    const def = objectTypeDef(type)!;
    const o: GameObject = { id: shortId('o_'), type, def, name, location, spawnRoomId: null, history: [], traces: [], lit: false, knownBy: new Set(), props: { description } };
    this.g.objects.set(o.id, o);
    return o;
  }

  /** Un meuble est-il encore verrouillé ? (fouille impossible tant qu'il l'est) */
  furnitureLocked(furnitureId: string) {
    return this.furnitureLocks.has(furnitureId);
  }

  /** Ouvrir un meuble verrouillé : code saisi, ou clé correspondante dans l'inventaire. */
  unlockFurniture(p: PlayerState, furnitureId: string, code?: string): string {
    this.requireActive(p);
    const g = this.g;
    const lock = this.furnitureLocks.get(furnitureId);
    const f = allFurniture().find((x) => x.id === furnitureId);
    if (!f || f.roomId !== p.roomId) throw new UserError('Meuble introuvable ici.');
    const cx = Math.max(f.x, Math.min(p.pos.x, f.x + f.w));
    const cy = Math.max(f.y, Math.min(p.pos.y, f.y + f.h));
    if (Math.hypot(cx - p.pos.x, cy - p.pos.y) > GAME_CONFIG.interactRange) throw new UserError('Approchez-vous du meuble.');
    if (!lock) throw new UserError(`${f.name} n’est pas verrouillé.`);
    if (lock.kind === 'code') {
      const now = g.now();
      if (lock.until > now) throw new UserError(`Trop d’essais : réessayez dans ${Math.ceil((lock.until - now) / 1000)} s.`);
      if (String(code ?? '').trim() !== lock.code) {
        lock.fails++;
        if (lock.fails % 3 === 0) lock.until = now + 30_000;
        throw new UserError('Code incorrect.');
      }
    } else if (!p.inventory.includes(lock.keyId)) throw new UserError('Il vous faut la bonne clé.');
    this.furnitureLocks.delete(furnitureId);
    g.log('FURNITURE_UNLOCKED', { actorId: p.id, roomId: p.roomId, data: { furnitureId }, text: `${p.name} ouvre : ${f.name}` });
    g.perceive(p.id, `${p.name} ouvre : ${f.name.toLowerCase()}.`);
    g.markAllDirty();
    return `${f.name} est ouvert. ${g.actions.search(p, furnitureId)}`;
  }

  private spawn(spec: CaseItemSpec, bodyPos: { x: number; y: number }) {
    const g = this.g;
    const def = objectTypeDef(spec.type);
    if (!def) throw new Error(`Type d'objet inconnu : ${spec.type}`);
    const o: GameObject = {
      id: shortId('o_'),
      type: spec.type,
      def,
      name: spec.name || def.name,
      location: { kind: 'destroyed' },
      spawnRoomId: null,
      history: [],
      traces: (spec.traces ?? []).map((tr) => ({ ...tr, clock: this.truth.murderAt })),
      lit: false,
      knownBy: new Set(),
      props: { ref: spec.ref, description: spec.description, content: spec.content, lock: spec.lock, locked: !!spec.lock, opens: spec.opens, inserted: [] as string[] },
    };
    g.objects.set(o.id, o);
    this.refs.set(spec.ref, o);
    const pl = spec.placement;
    if (pl.kind === 'player') {
      g.players.get(pl.playerId)!.inventory.push(o.id);
      o.location = { kind: 'player', playerId: pl.playerId };
    } else if (pl.kind === 'inside') {
      const c = this.refs.get(pl.containerRef)!;
      o.location = { kind: 'inside', containerId: c.id };
    } else if (pl.kind === 'body') {
      o.location = { kind: 'hidden', roomId: this.truth.victim.roomId, furnitureId: `body:${this.victimBodyId}`, pos: { ...bodyPos } };
    } else {
      const roomId = roomById(pl.roomId) ? pl.roomId : 'living';
      const spots = allFurniture().filter((f) => f.roomId === roomId && f.hiding);
      const hinted = pl.kind === 'hidden' && pl.furnitureHint ? spots.filter((f) => pl.furnitureHint!.some((h) => `${f.name} ${f.kind}`.toLowerCase().includes(h))) : [];
      const f = pl.kind === 'hidden' ? pick(hinted.length ? hinted : spots.length ? spots : [null], g.rnd) : null;
      if (f) o.location = { kind: 'hidden', roomId, furnitureId: f.id, pos: { x: f.x + f.w / 2, y: f.y + f.h / 2 } };
      else {
        const t = randomFreeTile(g.grid, roomId, g.rnd);
        o.location = { kind: 'floor', roomId, pos: { x: t.x + (g.rnd() - 0.5) * 0.3, y: t.y + (g.rnd() - 0.5) * 0.3 } };
      }
    }
    o.history.push({ clock: g.clock(), text: 'Présent au début de la nuit' });
  }

  // ───────────────────────── horloge ─────────────────────────

  tick() {
    const g = this.g;
    if (this.epilogue) return;
    const now = g.now();
    if (g.phase === 'ARRIVAL' && now - g.startedAt >= CASE_TIMING.arrivalSec * 1000 * g.timeScale) {
      g.setPhase('INVESTIGATION');
      g.feedAll('announce', 'L’enquête commence. Les accusations formelles sont désormais possibles.');
    }
    if (this.blackoutAt && now >= this.blackoutAt) {
      this.blackoutAt = 0;
      g.startBlackout(CASE_TIMING.blackoutSec * g.timeScale);
      g.feedAll('danger', 'Un éclair, puis le noir : l’orage a coupé le courant. Restez groupés… ou pas.');
    }
    if (this.vote && now >= this.vote.endsAt) this.closeVote();
    if (!this.vote && g.phase === 'INVESTIGATION' && now >= this.investigationEndsAt) this.startFinalVote();
  }

  // ───────────────────────── accès aux contenus ─────────────────────────

  /** Le joueur peut-il agir dans l'enquête (vivant, libre, partie en cours) ? */
  requireActive(p: PlayerState) {
    if (this.epilogue) throw new UserError('La nuit est terminée.');
    if (!p.alive) throw new UserError('Vous n’êtes plus de ce monde.');
    if (p.arrested) throw new UserError('Vous êtes arrêté·e : vous ne pouvez plus qu’observer.');
  }

  private content(o: GameObject): EvidenceContent | undefined {
    return o.props.content as EvidenceContent | undefined;
  }

  isLocked(o: GameObject) {
    return !!o.props.locked;
  }

  /** Contenus lisibles via cet objet : le sien, et ceux des supports insérés (appareil déverrouillé). */
  private readable(o: GameObject): GameObject[] {
    if (this.isLocked(o)) return [];
    const out: GameObject[] = [];
    if (this.content(o) && !o.def.tags.includes('media') && o.props.ref !== 'weapon') out.push(o);
    for (const id of (o.props.inserted as string[]) ?? []) {
      const m = this.g.objects.get(id);
      if (m && this.content(m)) out.push(m);
    }
    return out;
  }

  /** Lecture : enregistre le contenu dans le dossier du joueur (et ses connaissances). */
  readObject(p: PlayerState, o: GameObject): string | null {
    const g = this.g;
    if (o.def.tags.includes('media') && o.location.kind !== 'inside') return `${o.name} : il faut un appareil pour la lire (${(o.def.readBy ?? []).map((t) => objectTypeDef(t)?.name.toLowerCase()).join(' ou ')}).`;
    if (this.isLocked(o)) {
      const lock = o.props.lock as Lock;
      return lock.kind === 'code' ? `${o.name} est verrouillé${o.def.type === 'laptop' || o.def.type === 'phone' ? '' : ''} : ${lock.hint.toLowerCase()} requis.` : `${o.name} est fermé à clé.`;
    }
    const items = this.readable(o);
    if (!items.length) return null;
    const mine = this.read.get(p.id)!;
    const texts: string[] = [];
    for (const it of items) {
      const c = this.content(it)!;
      if (!mine.has(it.id)) {
        mine.set(it.id, { objectId: it.id, title: c.title, lines: c.lines, photos: c.photos as PhotoView[] | undefined, at: g.clock() });
        g.know(p.id, 'evidence', `${c.title} — ${c.lines.join(' ')}`, { important: c.weight === 'key' });
        g.log('EVIDENCE_READ', { actorId: p.id, objectId: it.id, text: `${p.name} lit : ${c.title}` });
        if (c.weight === 'key' || c.weight === 'herring') p.metrics.examinations++;
      }
      texts.push(`${c.title} : ${c.lines.join(' ')}`);
    }
    p.dirty = true;
    return texts.join('\n');
  }

  hasRead(p: PlayerState, objectId: string) {
    return this.read.get(p.id)?.has(objectId) ?? false;
  }

  /** Saisie d'un code (téléphone, ordinateur, coffret). Trop d'erreurs : verrouillage temporaire. */
  unlock(p: PlayerState, o: GameObject, code: string): string {
    this.requireActive(p);
    const lock = o.props.lock as Lock | undefined;
    if (!lock || !this.isLocked(o)) throw new UserError('Ce n’est pas verrouillé.');
    if (lock.kind !== 'code') throw new UserError('Il faut une clé.');
    const now = this.g.now();
    const until = (o.props.lockoutUntil as number) ?? 0;
    if (until > now) throw new UserError(`Trop d’essais : réessayez dans ${Math.ceil((until - now) / 1000)} s.`);
    const clean = String(code ?? '').trim().toLowerCase().slice(0, 40);
    if (clean !== lock.code.toLowerCase()) {
      const fails = ((o.props.fails as number) ?? 0) + 1;
      o.props.fails = fails;
      if (fails % 3 === 0) o.props.lockoutUntil = now + 30_000;
      this.g.log('CODE_FAILED', { actorId: p.id, objectId: o.id });
      throw new UserError('Code incorrect.');
    }
    return this.release(p, o, 'code');
  }

  /** Ouverture d'un contenant avec la clé détenue. */
  open(p: PlayerState, o: GameObject): string {
    this.requireActive(p);
    const lock = o.props.lock as Lock | undefined;
    if (!this.isLocked(o)) return this.readObject(p, o) ?? `${o.name} est déjà ouvert.`;
    if (lock?.kind !== 'key') throw new UserError('Il faut un code.');
    const key = p.inventory.map((id) => this.g.objects.get(id)!).find((k) => k.props.opens === o.props.ref);
    if (!key) throw new UserError('Vous n’avez pas la bonne clé.');
    return this.release(p, o, 'key');
  }

  /** Verrou levé : contenu lisible, objets contenus remis au joueur (ou posés à côté). */
  release(p: PlayerState, o: GameObject, how: 'code' | 'key' | 'bypass'): string {
    const g = this.g;
    o.props.locked = false;
    g.log('OBJECT_UNLOCKED', { actorId: p.id, objectId: o.id, data: { how }, text: `${p.name} ouvre ${o.name.toLowerCase()}` });
    g.perceive(p.id, `${p.name} ouvre : ${o.name.toLowerCase()}.`);
    const out: string[] = [`${o.name} s’ouvre.`];
    if (o.def.tags.includes('container')) {
      for (const inner of [...g.objects.values()].filter((x) => x.location.kind === 'inside' && x.location.containerId === o.id)) {
        if (p.inventory.length < GAME_CONFIG.inventorySize) {
          inner.location = { kind: 'player', playerId: p.id };
          p.inventory.push(inner.id);
          g.actions.touch(p, inner);
          out.push(`Vous prenez : ${inner.name}.`);
          if (this.content(inner) && !inner.def.tags.includes('media')) {
            const txt = this.readObject(p, inner);
            if (txt) out.push(txt);
          }
        } else {
          inner.location = { kind: 'floor', roomId: p.roomId, pos: { ...p.pos } };
          out.push(`À l’intérieur : ${inner.name} (posé à vos pieds, inventaire plein).`);
          if (this.content(inner) && !inner.def.tags.includes('media')) {
            const txt = this.readObject(p, inner);
            if (txt) out.push(txt);
          }
        }
      }
    }
    const txt = this.readObject(p, o);
    if (txt) out.push(txt);
    g.markAllDirty();
    return out.join(' ');
  }

  /** Lire un support dans un appareil (carte → appareil photo / ordinateur ; clé USB → ordinateur). */
  insert(p: PlayerState, mediaId: string, deviceId: string): string {
    this.requireActive(p);
    const g = this.g;
    const media = g.actions.reachable(p, mediaId);
    const device = g.actions.reachable(p, deviceId);
    if (!media.def.tags.includes('media')) throw new UserError('Ce n’est pas un support à insérer.');
    if (!(media.def.readBy ?? []).includes(device.type)) throw new UserError(`${media.name} ne se lit pas dans : ${device.name.toLowerCase()}.`);
    if (media.location.kind === 'player') {
      const holder = g.players.get(media.location.playerId)!;
      holder.inventory = holder.inventory.filter((id) => id !== media.id);
    }
    media.location = { kind: 'inside', containerId: device.id };
    const ins = (device.props.inserted as string[]) ?? [];
    if (!ins.includes(media.id)) ins.push(media.id);
    device.props.inserted = ins;
    g.actions.touch(p, media);
    g.log('MEDIA_INSERTED', { actorId: p.id, objectId: media.id, text: `${p.name} insère ${media.name.toLowerCase()} dans ${device.name.toLowerCase()}` });
    if (this.isLocked(device)) return `${media.name} insérée. ${device.name} est verrouillé : il faut d’abord l’ouvrir.`;
    return this.readObject(p, device) ?? `${media.name} insérée.`;
  }

  /** Retirer un support d'un appareil tenu (pour le cacher, le détruire ou le lire ailleurs). */
  eject(p: PlayerState, device: GameObject): string | null {
    const ins = (device.props.inserted as string[]) ?? [];
    const media = ins.map((id) => this.g.objects.get(id)!).find(Boolean);
    if (!media || p.inventory.length >= GAME_CONFIG.inventorySize) return null;
    device.props.inserted = ins.filter((id) => id !== media.id);
    media.location = { kind: 'player', playerId: p.id };
    p.inventory.push(media.id);
    this.g.actions.touch(p, media);
    return `Vous retirez : ${media.name}.`;
  }

  /** Fouiller le corps de la victime. */
  searchBody(p: PlayerState, bodyId: string): string {
    this.requireActive(p);
    const g = this.g;
    const body = g.bodies.find((b) => b.id === bodyId);
    if (!body || body.roomId !== p.roomId || Math.hypot(body.pos.x - p.pos.x, body.pos.y - p.pos.y) > GAME_CONFIG.interactRange + 0.6) throw new UserError('Approchez-vous du corps.');
    const found = [...g.objects.values()].filter((o) => o.location.kind === 'hidden' && o.location.furnitureId === `body:${bodyId}`);
    g.gesture(p, 'search', 1900);
    g.perceive(p.id, `${p.name} fouille les poches de ${body.npc?.name ?? g.nameOf(body.playerId)}.`);
    g.log('BODY_SEARCHED', { actorId: p.id, text: `${p.name} fouille le corps` });
    if (!found.length) return 'Les poches sont vides.';
    for (const o of found) o.knownBy.add(p.id);
    const names = found.map((o) => o.name).join(', ');
    g.know(p.id, 'evidence', `Sur le corps : ${names}.`, { important: true });
    p.dirty = true;
    return `Vous trouvez sur le corps : ${names}.`;
  }

  // ───────────────────────── dossier commun, alibis, opposition ─────────────────────────

  private oppose(fromId: string, toId: string, cause: string) {
    const g = this.g;
    if (fromId === toId || this.oppositions.some((o) => o.fromId === fromId && o.toId === toId)) return;
    this.oppositions.push({ fromId, fromName: g.nameOf(fromId), toId, toName: g.nameOf(toId), cause, at: g.clock() });
    g.log('OPPOSITION_RECORDED', { actorId: fromId, targetId: toId, text: `${g.nameOf(fromId)} s’oppose officiellement à ${g.nameOf(toId)} (${cause})` });
    g.feed(fromId, 'system', `Opposition officielle enregistrée contre ${g.nameOf(toId)} (${cause}). Elle est irrévocable.`);
    if (toId === this.truth.murdererId && this.truth.protectorIds.includes(fromId)) this.freedProtectors.add(fromId);
  }

  isOpponentOfMurderer(id: string) {
    return this.oppositions.some((o) => o.fromId === id && o.toId === this.truth.murdererId);
  }

  present(p: PlayerState, objectId: string, againstId?: string): string {
    this.requireActive(p);
    const g = this.g;
    if (g.phase === 'ARRIVAL') throw new UserError('Laissez d’abord chacun reprendre ses esprits (début de l’enquête dans quelques instants).');
    const ev = this.read.get(p.id)!.get(objectId);
    if (!ev) throw new UserError('Vous n’avez pas lu cette pièce.');
    if (this.publicEvidence.some((x) => x.id === objectId && x.authorId === p.id && x.againstName === (againstId ? g.nameOf(againstId) : undefined)))
      throw new UserError('Pièce déjà versée au dossier.');
    const against = againstId ? g.players.get(againstId) : undefined;
    if (againstId && (!against || against.id === p.id)) throw new UserError('Personne visée invalide.');
    const o = g.objects.get(objectId)!;
    const facts = this.content(o)?.facts ?? [];
    const pe: PublicEvidence = { id: objectId, authorId: p.id, authorName: p.name, title: ev.title, lines: ev.lines, photos: ev.photos, againstName: against?.name, againstId: against?.id, checks: [], at: g.clock(), facts };
    this.publicEvidence.push(pe);
    g.log('EVIDENCE_PRESENTED', { actorId: p.id, objectId, targetId: against?.id, text: `${p.name} verse au dossier : ${ev.title}${against ? ` (contre ${against.name})` : ''}` });
    g.feedAll('announce', `${p.name} verse au dossier commun : « ${ev.title} »${against ? `, contre ${against.name}` : ''}.`);
    if (against) this.oppose(p.id, against.id, 'dénonciation formelle');
    // révélation d'un secret : conséquences
    for (const f of facts) if (f.kind === 'secret') this.revealSecret(f.playerId, p.id);
    g.markAllDirty();
    return 'Pièce versée au dossier commun.';
  }

  private revealSecret(playerId: string, byId: string) {
    const g = this.g;
    if (this.revealedSecrets.has(playerId)) return;
    this.revealedSecrets.add(playerId);
    const pl = g.players.get(playerId);
    if (!pl) return;
    g.feedAll('danger', `Révélation : ${pl.secretReveal}`);
    g.log('SECRET_REVEALED', { actorId: byId, targetId: playerId, text: `Le secret de ${pl.name} est révélé publiquement` });
    // conséquence 1 : crédibilité entamée — une accusation de moins
    pl.accusationsUsed = Math.min(CASE_TIMING.accusationsPerPlayer, pl.accusationsUsed + 1);
    // conséquence 2 : un protecteur n'est plus tenu par le chantage
    if (this.truth.protectorIds.includes(playerId) && !this.freedProtectors.has(playerId)) {
      this.freedProtectors.add(playerId);
      g.feed(playerId, 'announce', 'Votre secret est public : le meurtrier n’a plus de prise sur vous. Vous gagnez désormais avec les innocents.');
    }
    // conséquence 3 : l'auteur de la révélation peut désormais être ciblé par la rancune du révélé
    g.relationships.social('accused', byId, playerId, `${g.nameOf(byId)} a révélé le secret de ${pl.name}`, true);
  }

  declareAlibi(p: PlayerState, place: string, textIn: string): string {
    this.requireActive(p);
    const g = this.g;
    const placeIds = Object.keys(PLACES) as PlaceId[];
    if (!placeIds.includes(place as PlaceId)) throw new UserError('Lieu inconnu.');
    const prev = this.alibis.get(p.id);
    const text = String(textIn ?? '').trim().slice(0, 200);
    this.alibis.set(p.id, { playerId: p.id, playerName: p.name, place, placeName: PLACES[place as PlaceId].name, text, at: g.clock(), status: 'unverified' });
    if (prev && prev.place !== place) g.feedAll('whisper', `${p.name} modifie sa déclaration d’alibi (avant : ${prev.placeName}).`);
    else g.feedAll('narration', `${p.name} déclare avoir été à ${PLACES[place as PlaceId].name} entre 21h et 22h.`);
    g.log('ALIBI_DECLARED', { actorId: p.id, data: { place, truthful: this.truth.players.get(p.id)?.place === place }, text: `${p.name} déclare : ${place}` });
    if (p.pendingTestimony) p.pendingTestimony = null;
    g.markAllDirty();
    return 'Déclaration enregistrée.';
  }

  /** Statut d'un alibi au vu des pièces versées au dossier (recoupement automatique). */
  private alibiChecks(a: AlibiView): { status: AlibiView['status']; notes: PublicEvidenceView['checks'] } {
    const notes: PublicEvidenceView['checks'] = [];
    for (const pe of this.publicEvidence)
      for (const f of pe.facts) {
        if ((f.kind === 'place' || f.kind === 'absent') && f.playerId === a.playerId) {
          const same = f.place === a.place;
          const contradicts = f.kind === 'place' ? !same : same;
          notes.push({
            playerName: a.playerName,
            status: contradicts ? 'contradicts' : 'confirms',
            text:
              f.kind === 'place'
                ? `« ${pe.title} » place ${a.playerName} à ${PLACES[f.place].name} à ${formatClock(f.at)}`
                : `« ${pe.title} » montre que ${a.playerName} n’était pas à ${PLACES[f.place].name} à ${formatClock(f.at)}`,
          });
        }
      }
    const status = notes.some((n) => n.status === 'contradicts') ? 'contradicted' : notes.length ? 'confirmed' : 'unverified';
    return { status, notes };
  }

  // ───────────────────────── accusations et votes ─────────────────────────

  accuseBlock(p: PlayerState): string | null {
    const g = this.g;
    if (this.epilogue) return 'La nuit est terminée.';
    if (!p.alive || p.arrested) return 'Vous ne pouvez plus accuser.';
    if (g.phase === 'ARRIVAL') return 'Les accusations ouvrent dans quelques instants.';
    if (g.phase !== 'INVESTIGATION') return 'La délibération finale est en cours.';
    if (this.vote) return 'Un vote est déjà en cours.';
    if (p.accusationsUsed >= CASE_TIMING.accusationsPerPlayer) return 'Vous avez épuisé vos accusations formelles.';
    const wait = this.lastAccusationAt + CASE_TIMING.accusationCooldownSec * 1000 * g.voteScale - g.now();
    if (wait > 0) return `Prochaine accusation possible dans ${Math.ceil(wait / 1000)} s.`;
    return null;
  }

  accuse(p: PlayerState, targetId: string, evidenceIds: string[], textIn: string): string {
    const g = this.g;
    const block = this.accuseBlock(p);
    if (block) throw new UserError(block);
    const t = g.players.get(targetId);
    if (!t || t.id === p.id || !t.alive || t.arrested) throw new UserError('Personne accusée invalide.');
    const ids = Array.isArray(evidenceIds) ? [...new Set(evidenceIds.map(String))].slice(0, 4) : [];
    const mine = this.read.get(p.id)!;
    const evidence = ids.map((id) => mine.get(id)).filter((x): x is EvidenceView => !!x);
    // « accusation validée » : au moins une pièce réellement lue (sans juger de son sens : aucun oracle)
    if (!evidence.length) throw new UserError('Une accusation formelle exige au moins une pièce que vous avez lue.');
    const text = String(textIn ?? '').trim().slice(0, 280);
    p.accusationsUsed++;
    this.lastAccusationAt = g.now();
    const eligible = new Set(this.freePlayers().filter((x) => x.id !== t.id).map((x) => x.id));
    this.vote = {
      id: shortId('v_'),
      kind: 'accusation',
      trigger: `Accusation formelle de ${p.name}`,
      accusedId: t.id,
      accuserId: p.id,
      text,
      evidence: evidence.map((e) => ({ title: e.title, lines: e.lines, photos: e.photos })),
      eligible,
      ballots: new Map([[p.id, 'guilty']]),
      endsAt: g.now() + CASE_TIMING.accusationVoteSec * 1000 * g.voteScale,
    };
    this.oppose(p.id, t.id, 'accusation formelle');
    g.log('ACCUSATION', { actorId: p.id, targetId: t.id, text: `${p.name} accuse formellement ${t.name}` });
    g.feedAll('danger', `${p.name} accuse formellement ${t.name}. Vote ouvert : coupable ou non coupable ?`);
    g.feed(t.id, 'announce', 'Vous êtes accusé·e. Présentez votre défense dans le panneau de vote.');
    g.markAllDirty();
    return `Vous accusez ${t.name}. Le vote est ouvert.`;
  }

  defend(p: PlayerState, textIn: string): string {
    if (!this.vote || this.vote.accusedId !== p.id) throw new UserError('Vous n’êtes pas accusé·e.');
    this.vote.defense = String(textIn ?? '').trim().slice(0, 400);
    this.g.feedAll('narration', `${p.name} se défend : « ${this.vote.defense} »`);
    this.g.markAllDirty();
    return 'Défense publiée.';
  }

  ballot(p: PlayerState, choice: string): string {
    const v = this.vote;
    if (!v) throw new UserError('Aucun vote en cours.');
    if (!v.eligible.has(p.id)) throw new UserError('Vous ne participez pas à ce vote.');
    if (v.ballots.has(p.id)) throw new UserError('Vote déjà enregistré (définitif).');
    const g = this.g;
    if (v.kind === 'accusation') {
      if (choice !== 'guilty' && choice !== 'innocent') throw new UserError('Choix invalide.');
      v.ballots.set(p.id, choice);
      if (choice === 'guilty') this.oppose(p.id, v.accusedId!, 'vote « coupable »');
    } else {
      const cand = this.freePlayers().find((x) => x.id === choice);
      if (!cand || cand.id === p.id) throw new UserError('Choix invalide.');
      v.ballots.set(p.id, choice);
    }
    g.log('VOTE_CAST', { actorId: p.id, data: { voteId: v.id, choice }, text: `${p.name} vote (${v.trigger})` });
    if ([...v.eligible].every((id) => v.ballots.has(id) || !g.players.get(id)?.connected)) this.closeVote();
    g.markAllDirty();
    return 'Vote enregistré.';
  }

  freePlayers() {
    return [...this.g.players.values()].filter((p) => p.alive && !p.arrested);
  }

  private startFinalVote() {
    const g = this.g;
    g.setPhase('RESOLUTION');
    const free = this.freePlayers();
    this.vote = {
      id: shortId('v_'),
      kind: 'final',
      trigger: 'Délibération finale : la police arrive à l’aube',
      evidence: [],
      eligible: new Set(free.map((p) => p.id)),
      ballots: new Map(),
      endsAt: g.now() + CASE_TIMING.finalVoteSec * 1000 * g.voteScale,
    };
    g.feedAll('danger', 'L’orage se calme : la police arrive. Désignez ensemble la personne à lui livrer.');
    g.markAllDirty();
  }

  private closeVote() {
    const g = this.g;
    const v = this.vote;
    if (!v) return;
    this.vote = null;
    if (v.kind === 'accusation') {
      const guilty = [...v.ballots.values()].filter((c) => c === 'guilty').length;
      const accused = g.players.get(v.accusedId!)!;
      const convicted = guilty > v.eligible.size / 2;
      this.votesHistory.push({ trigger: v.trigger, accusedName: accused.name, result: convicted ? `Arrêté${ag(accused)} (${guilty}/${v.eligible.size} « coupable »)` : `Relâché${ag(accused)} (${guilty}/${v.eligible.size} « coupable », majorité absolue requise)` });
      if (!convicted) {
        g.feedAll('announce', `${accused.name} n’est pas arrêté${ag(accused)} (${guilty} voix « coupable » sur ${v.eligible.size} votants possibles).`);
      } else this.arrest(accused, v.trigger);
    } else {
      const tally = new Map<string, number>();
      for (const c of v.ballots.values()) tally.set(c, (tally.get(c) ?? 0) + 1);
      const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const top = sorted[0] && (sorted.length === 1 || sorted[0][1] > sorted[1][1]) ? sorted[0] : null;
      this.votesHistory.push({ trigger: v.trigger, accusedName: top ? g.nameOf(top[0]) : undefined, result: top ? `Livré${ag(g.players.get(top[0]))} à la police (${top[1]} voix)` : 'Égalité ou aucun vote : personne n’est livré à la police' });
      if (top) this.arrest(g.players.get(top[0])!, v.trigger, true);
      if (!this.epilogue) this.finish('murderer', top ? `${g.nameOf(top[0])} est livré${ag(g.players.get(top[0]))} à la police… à tort. Le vrai coupable reste libre.` : 'Le groupe n’a pas su trancher. Le doute profite au meurtrier.');
    }
    g.markAllDirty();
  }

  private arrest(p: PlayerState, trigger: string, final = false) {
    const g = this.g;
    p.arrested = true;
    p.input = { x: 0, y: 0 };
    this.arrestedOrder.push(p.id);
    g.log('PLAYER_ARRESTED', { targetId: p.id, text: `${p.name} est arrêté${ag(p)} (${trigger})` });
    if (p.id === this.truth.murdererId) {
      this.finish('innocents', `${p.name} est arrêté${ag(p)}. C’était bien ${ag(p) ? 'la meurtrière' : 'le meurtrier'}.`);
      return;
    }
    if (!final) {
      g.feedAll('danger', `${p.name} est arrêté${ag(p)} et enfermé${ag(p)} dans la cave jusqu’à l’aube. Son secret éclate : ${p.secretReveal}`);
      this.revealedSecrets.add(p.id);
      g.feed(p.id, 'announce', 'Vous êtes arrêté·e. Vous restez spectateur·rice jusqu’à la fin de la nuit.');
      this.checkMurdererWin();
    }
  }

  /** Le meurtrier gagne s'il ne reste qu'un seul joueur libre face à lui. */
  checkMurdererWin() {
    if (this.epilogue) return;
    const others = this.freePlayers().filter((p) => p.id !== this.truth.murdererId);
    if (others.length <= 1) this.finish('murderer', `Il ne reste plus assez de monde pour arrêter qui que ce soit. ${this.g.nameOf(this.truth.murdererId)} s’en sort.`);
  }

  // ───────────────────────── éliminations (meurtrier) ─────────────────────────

  /** Occasion : meurtrier, arme en main, opposant officiel à portée, aucun témoin. */
  opportunityFor(p: PlayerState): { target: PlayerState; weapon: GameObject; dark: boolean } | null {
    const g = this.g;
    if (!this.truth || p.id !== this.truth.murdererId || !p.alive || p.arrested || this.epilogue || g.phase === 'ARRIVAL') return null;
    if (g.now() - this.lastEliminationAt < CASE_TIMING.eliminationCooldownSec * 1000 * g.voteScale) return null;
    if (this.vote?.accusedId === p.id) return null;
    const weapon = p.inventory.map((id) => g.objects.get(id)!).find((o) => o.def.tags.includes('weapon') && o.def.tags.includes('lethal'));
    if (!weapon) return null;
    for (const t of this.freePlayers()) {
      if (t.id === p.id || t.roomId !== p.roomId || Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) > GAME_CONFIG.interactRange) continue;
      if (!this.oppositions.some((o) => o.fromId === t.id && o.toId === p.id)) continue;
      const witnesses = this.freePlayers().filter((w) => w.id !== p.id && w.id !== t.id && g.canSee(w, p));
      if (!witnesses.length) return { target: t, weapon, dark: g.isBlackout() };
    }
    return null;
  }

  onElimination() {
    this.lastEliminationAt = this.g.now();
    this.checkMurdererWin();
  }

  // ───────────────────────── outils de spécialité ─────────────────────────

  useTool(p: PlayerState, toolId: string, targetId?: string): string {
    this.requireActive(p);
    const g = this.g;
    if (g.phase === 'EPILOGUE') throw new UserError('Trop tard.');
    const role = p.roleId ? roleById(p.roleId) : undefined;
    const tool = role?.tools.find((t) => t.id === toolId);
    if (!tool) throw new UserError('Vous n’avez pas cet outil.');
    const used = p.toolUses[toolId] ?? 0;
    if (tool.maxUses !== undefined && used >= tool.maxUses) throw new UserError('Vous avez épuisé cet outil.');
    const result = this.runTool(p, toolId, targetId);
    p.toolUses[toolId] = used + 1;
    g.log('TOOL_USED', { actorId: p.id, targetId, data: { toolId }, text: `${p.name} utilise « ${tool.name} »` });
    g.know(p.id, 'role', result, { important: true });
    p.dirty = true;
    return result;
  }

  private nearPlayer(p: PlayerState, targetId?: string) {
    const t = targetId ? this.g.players.get(targetId) : undefined;
    if (!t || t.id === p.id || !t.alive) throw new UserError('Choisissez un joueur.');
    if (t.roomId !== p.roomId || Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) > GAME_CONFIG.interactRange + 0.6) throw new UserError(`Approchez-vous de ${t.name}.`);
    return t;
  }

  private runTool(p: PlayerState, toolId: string, targetId?: string): string {
    const g = this.g;
    const t = this.truth;
    switch (toolId) {
      case 'examine_body': {
        const body = g.bodies.find((b) => b.roomId === p.roomId && Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y) <= GAME_CONFIG.interactRange + 0.6);
        if (!body) throw new UserError('Approchez-vous d’un corps.');
        const isVictim = body.playerId === 'victim';
        const weapon = g.objects.get(body.weaponId);
        const killer = g.players.get(body.killerId)!;
        const at = isVictim ? t.murderAt : body.clock;
        const lo = Math.floor((at - 6) / 5) * 5;
        const hi = Math.ceil((at + 6) / 5) * 5;
        const fiber = castById(killer.character.castId)?.fiber ?? 'tissu sombre';
        return [
          `Autopsie de ${body.npc?.name ?? g.nameOf(body.playerId)} :`,
          `cause — ${WEAPON_CLASS_TEXT[weapon?.def.weaponClass ?? t.weaponClass]} ;`,
          `heure de la mort entre ${formatClock(lo)} et ${formatClock(hi)} ;`,
          `sous les ongles : des fibres de ${fiber}.`,
        ].join(' ');
      }
      case 'analyze_prints': {
        const o = g.actions.reachable(p, targetId ?? '');
        const prints = o.traces.filter((x) => x.kind === 'print');
        const visible = [...new Set(prints.filter((x) => !x.cleaned).map((x) => g.players.get(x.playerId)?.fingerprint).filter(Boolean))];
        const partial = [...new Set(prints.filter((x) => x.cleaned).map((x) => g.players.get(x.playerId)?.fingerprint).filter(Boolean))];
        const blood = o.traces.find((x) => x.kind === 'blood');
        const parts = [`Analyse — ${o.name} :`];
        parts.push(visible.length ? `empreintes #${visible.join(', #')}.` : 'aucune empreinte nette.');
        if (partial.length) parts.push(`L’objet a été essuyé, mais une empreinte partielle subsiste : #${partial[0]}.`);
        if (blood) parts.push(`Traces de sang ${blood.cleaned ? 'lavé mais détectable' : 'visible'} : celui de ${blood.playerId === 'victim' ? t.victim.name : g.nameOf(blood.playerId)}.`);
        return parts.join(' ');
      }
      case 'take_prints': {
        const x = this.nearPlayer(p, targetId);
        g.feed(x.id, 'whisper', `${p.name} a relevé vos empreintes.`);
        return `Empreintes de ${x.name} : #${x.fingerprint}.`;
      }
      case 'inspect_room': {
        const found: string[] = [];
        const foot = new Map<string, number>();
        for (const ev of g.evidence) {
          if (ev.roomId !== p.roomId || ev.cleaned) continue;
          ev.discoveredBy.add(p.id);
          if (ev.kind === 'footprint') {
            const k = `motif ${ev.data.pattern}, pointure ${ev.data.size}`;
            foot.set(k, (foot.get(k) ?? 0) + 1);
          }
          if (ev.kind === 'diluted_blood') found.push(`du sang dilué dans le siphon (vers ${formatClock(ev.clock)})`);
          if (ev.kind === 'smear') found.push(`une zone frottée récemment (vers ${formatClock(ev.clock)})`);
          if (ev.kind === 'forced_lock') found.push('une serrure forcée');
          if (ev.kind === 'ashes') found.push('des cendres de papier');
          if (ev.kind === 'blood_pool') found.push('une flaque de sang');
        }
        for (const [k, n] of foot) found.push(`${n} empreinte${n > 1 ? 's' : ''} de boue (${k})`);
        for (const f of allFurniture().filter((x) => x.roomId === p.roomId && x.hiding && !this.furnitureLocks.has(x.id))) {
          const hidden = [...g.objects.values()].filter((o) => o.location.kind === 'hidden' && o.location.furnitureId === f.id);
          if (hidden.length) {
            hidden.forEach((o) => o.knownBy.add(p.id));
            found.push(`${f.name} a été dérangé·e : ${hidden.map((o) => o.name.toLowerCase()).join(', ')}`);
          }
        }
        p.dirty = true;
        return found.length ? `Inspection — ${roomName(p.roomId)} : ${found.join(' ; ')}.` : `Inspection — ${roomName(p.roomId)} : rien d’anormal.`;
      }
      case 'examine_shoes': {
        const x = this.nearPlayer(p, targetId);
        return `Semelles de ${x.name} : motif ${x.shoe.pattern}, pointure ${x.shoe.size}${x.muddyUntil > g.now() || x.id === t.murdererId ? ', avec des restes de boue séchée' : ''}.`;
      }
      case 'bypass_lock': {
        const o = g.actions.reachable(p, targetId ?? '');
        if (!this.isLocked(o)) throw new UserError('Ce n’est pas verrouillé.');
        return this.release(p, o, 'bypass');
      }
      case 'request_testimony': {
        const x = g.players.get(targetId ?? '');
        if (!x || !x.alive || x.arrested || x.id === p.id) throw new UserError('Choisissez un joueur libre.');
        x.pendingTestimony = { requestId: shortId('q_'), question: 'Où étiez-vous entre 21h00 et 22h00 ? (déclaration publique)', fromId: p.id, fromName: p.name };
        g.feed(x.id, 'announce', `${p.name} exige votre alibi. Déclarez-le (dossier → Alibi).`);
        g.feedAll('narration', `${p.name} demande publiquement à ${x.name} où ${x.character.appearance === 'feminine' ? 'elle' : 'il'} était entre 21h et 22h.`);
        g.markAllDirty();
        return `Question posée à ${x.name}.`;
      }
      case 'verify_testimony': {
        const x = g.players.get(targetId ?? '');
        const al = x ? this.alibis.get(x.id) : undefined;
        if (!x || !al) throw new UserError('Ce joueur n’a pas encore déclaré d’alibi.');
        const tr = t.players.get(x.id)!;
        const verdict = al.place !== tr.place ? 'FAUSSE' : tr.absence ? `PARTIELLEMENT EXACTE : présent${ag(x)} à ce lieu, mais absent${ag(x)} de ${formatClock(tr.absence.from)} à ${formatClock(tr.absence.to)}` : 'EXACTE';
        return `Vérification de l’alibi de ${x.name} (« ${al.placeName} ») : ${verdict}.`;
      }
      case 'social_profile': {
        const lines = g.social.filter((s) => s.public).slice(-10).map((s) => `${formatClock(s.clock)} ${s.text}`);
        const hidden = g.relations.filter((r) => r.status === 'active' && r.type === 'PACT').length;
        const prot = t.protectorIds.length ? ' Quelqu’un dans le groupe semble avoir une raison de couvrir le coupable.' : '';
        return `Profil social : ${lines.join(' · ') || 'peu d’échanges publics'}. Pactes discrets en cours : ${hidden}.${prot}`;
      }
    }
    throw new UserError('Outil inconnu.');
  }

  // ───────────────────────── fin ─────────────────────────

  finish(winner: 'innocents' | 'murderer', headline: string) {
    const g = this.g;
    if (this.epilogue) return;
    if (this.vote) this.vote = null;
    const t = this.truth;
    const camp = (id: string) => {
      const c = t.players.get(id)!.camp;
      return c === 'protector' && (this.freedProtectors.has(id) || this.isOpponentOfMurderer(id)) ? 'innocent' : c;
    };
    this.epilogue = {
      winner,
      headline,
      scenarioTitle: t.scenarioTitle,
      motive: t.motive,
      murdererId: t.murdererId,
      murdererName: g.nameOf(t.murdererId),
      protectorNames: t.protectorIds.map((id) => g.nameOf(id)),
      arrested: this.arrestedOrder.map((id) => ({ name: g.nameOf(id), guilty: id === t.murdererId })),
      victims: [t.victim.name, ...g.bodies.filter((b) => b.playerId !== 'victim').map((b) => g.nameOf(b.playerId))],
      truthTimeline: [
        ...t.timeline.map((x) => ({ at: x.at, text: x.text })),
        ...g.truth
          .filter((e) => ['PLAYER_DIED', 'PLAYER_ARRESTED', 'ACCUSATION', 'EVIDENCE_PRESENTED', 'OBJECT_DESTROYED', 'OBJECT_HIDDEN', 'SECRET_REVEALED', 'OPPOSITION_RECORDED'].includes(e.type) && e.text)
          .slice(-30)
          .map((e) => ({ at: e.clock, text: e.text! })),
      ],
      secrets: [...g.players.values()].map((p) => ({ playerId: p.id, name: p.name, secret: p.secretReveal, camp: { murderer: 'Meurtrier', innocent: 'Innocent·e', protector: 'Protecteur·rice' }[camp(p.id)] })),
      votes: this.votesHistory,
      oppositions: this.oppositions.map((o) => ({ fromName: o.fromName, toName: o.toName })),
      roles: [...g.players.values()].filter((p) => p.roleId).map((p) => ({ name: p.name, role: roleById(p.roleId!)!.name })),
      outcomes: [...g.players.values()].map((p) => ({ playerId: p.id, won: camp(p.id) === 'innocent' ? winner === 'innocents' : winner === 'murderer' })),
    };
    if (winner === 'innocents') for (const id of t.protectorIds) if (camp(id) === 'protector') g.feedAll('danger', `Les preuves saisies sur le meurtrier révèlent : ${g.players.get(id)!.secretReveal}`);
    g.log('GAME_ENDED', { data: { winner }, text: headline });
    g.setPhase('EPILOGUE');
    g.ended = true;
    g.onFinished(this.epilogue);
    g.markAllDirty();
  }

  // ───────────────────────── vues ─────────────────────────

  caseView(p: PlayerState): CaseView {
    const g = this.g;
    const t = this.truth;
    const block = this.accuseBlock(p);
    return {
      scenarioTitle: t.scenarioTitle,
      brief: t.publicBrief,
      victimName: t.victim.name,
      victimCastId: t.victim.castId,
      victimBio: t.victim.bio,
      roomId: t.victim.roomId,
      roomName: roomName(t.victim.roomId),
      places: t.places.map((id) => ({ id, name: PLACES[id].name })).concat([{ id: 'villa', name: PLACES.villa.name }]),
      endsAt: Date.now() + Math.max(0, this.investigationEndsAt - g.now()),
      canAccuse: !block,
      accuseBlockedReason: block ?? undefined,
      accusationsLeft: Math.max(0, CASE_TIMING.accusationsPerPlayer - p.accusationsUsed),
    };
  }

  dossierView(p: PlayerState): DossierView {
    const t = this.truth;
    const pt = t.players.get(p.id)!;
    const freed = this.freedProtectors.has(p.id);
    const camp = pt.camp === 'protector' && freed ? 'innocent' : pt.camp;
    const objective =
      camp === 'murderer'
        ? 'Ne pas être arrêté·e. Brouillez les pistes, détruisez ce qui vous accuse, ralliez des alliés. Vous ne pouvez éliminer que ceux qui se sont officiellement opposés à vous.'
        : camp === 'protector'
          ? (() => {
              const m = this.g.players.get(t.murdererId);
              const f = !!ag(m);
              return `${f ? 'La meurtrière' : 'Le meurtrier'} est ${m?.name}. ${f ? 'Elle' : 'Il'} détient la preuve de votre secret : ${f ? 'si elle est arrêtée' : 's’il est arrêté'}, vous tombez aussi. Vous gagnez si ${m?.name} reste libre. Vous pouvez aussi ${f ? 'la' : 'le'} dénoncer : vous rejoignez alors les innocents.`;
            })()
          : 'Trouver qui a tué et le faire arrêter par un vote, sans envoyer d’innocent en cellule. Protégez votre propre secret si vous le pouvez.';
    return {
      camp,
      objective,
      secret: pt.secret.text,
      memories: pt.memories,
      briefing:
        camp === 'murderer'
          ? murdererBriefing(t, p.id, (id) => this.g.nameOf(id))
          : camp === 'protector'
            ? [t.players.get(t.murdererId) ? `Ce que sait ${this.g.nameOf(t.murdererId)} sur vous : ${pt.secret.text}` : '']
            : pt.absence
              ? [`Vous vous êtes absenté${ag(p)} de ${formatClock(pt.absence.from)} à ${formatClock(pt.absence.to)} (${pt.absence.whereabouts}). On risque de vous le reprocher : une preuve de l’endroit où vous étiez existe quelque part dans la villa.`]
              : [],
      evidence: [...(this.read.get(p.id)?.values() ?? [])].sort((a, b) => a.at - b.at),
      arrested: p.arrested,
    };
  }

  publicEvidenceView(): PublicEvidenceView[] {
    return this.publicEvidence.map(({ facts: _f, againstId: _a, ...pe }) => {
      const checks: PublicEvidenceView['checks'] = [];
      for (const al of this.alibis.values()) for (const n of this.alibiChecks(al).notes) if (n.text.startsWith(`« ${pe.title} »`)) checks.push(n);
      return { ...pe, checks };
    });
  }

  alibiViews(): AlibiView[] {
    return [...this.alibis.values()].map((a) => ({ ...a, status: this.alibiChecks(a).status }));
  }

  voteView(p: PlayerState): VoteView | null {
    const v = this.vote;
    if (!v) return null;
    const g = this.g;
    return {
      id: v.id,
      kind: v.kind,
      trigger: v.trigger,
      accusedId: v.accusedId,
      accusedName: v.accusedId ? g.nameOf(v.accusedId) : undefined,
      accuserName: v.accuserId ? g.nameOf(v.accuserId) : undefined,
      accusationText: v.text,
      evidence: v.evidence,
      defense: v.defense,
      options:
        v.kind === 'accusation'
          ? [
              { id: 'guilty', label: 'Coupable' },
              { id: 'innocent', label: 'Non coupable' },
            ]
          : this.freePlayers().filter((x) => x.id !== p.id).map((x) => ({ id: x.id, label: x.name })),
      eligible: v.eligible.has(p.id),
      myChoice: v.ballots.get(p.id),
      votesCast: v.ballots.size,
      votesNeeded: v.eligible.size,
      endsAt: Date.now() + Math.max(0, v.endsAt - g.now()),
      rules:
        v.kind === 'accusation'
          ? `Arrestation si plus de la moitié des ${v.eligible.size} votants possibles votent « coupable ». Voter « coupable » vous oppose officiellement à l’accusé·e. Vote définitif.`
          : 'Majorité relative : la personne la plus désignée est livrée à la police. Égalité : personne. Vote définitif.',
    };
  }

  roleView(p: PlayerState): RoleView | null {
    const r = p.roleId ? roleById(p.roleId) : undefined;
    if (!r) return null;
    return { id: r.id, name: r.name, description: r.description, tools: r.tools.map((t) => ({ id: t.id, name: t.name, description: t.description, usesLeft: t.maxUses !== undefined ? t.maxUses - (p.toolUses[t.id] ?? 0) : undefined })) };
  }

  /** Interactions proposées pour un objet (le client n'affiche que celles-ci). */
  objectExtras(viewer: PlayerState, o: GameObject): Partial<ObjectView> {
    const caps: string[] = [];
    const lock = o.props.lock as Lock | undefined;
    const locked = this.isLocked(o);
    if (locked && lock?.kind === 'code') caps.push('code');
    if (locked && lock?.kind === 'key') caps.push('key');
    if (!locked && (this.content(o) && o.props.ref !== 'weapon' && !o.def.tags.includes('media'))) caps.push('read');
    if (!locked && ((o.props.inserted as string[]) ?? []).length) caps.push('read', 'eject');
    if (o.def.tags.includes('media')) caps.push('insert');
    if (o.def.tags.includes('destructible')) caps.push('burn');
    if (o.def.tags.includes('gloves')) caps.push('wear');
    if (o.def.tags.includes('light')) caps.push('light');
    const knownIds = [o.id, ...(((o.props.inserted as string[]) ?? []))];
    const known = knownIds.some((id) => this.hasRead(viewer, id));
    if (known) caps.push('present');
    return { locked, known, caps, lockHint: locked && lock?.kind === 'code' ? lock.hint : undefined, worn: o.def.tags.includes('gloves') && viewer.gloves && o.location.kind === 'player' && o.location.playerId === viewer.id };
  }
}
