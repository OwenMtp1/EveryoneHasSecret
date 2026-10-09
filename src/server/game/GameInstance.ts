/**
 * GameInstance — une partie en cours. Serveur autoritaire.
 *
 *  Client → demande (input / action)   Serveur → valide → applique → journalise → diffuse
 *
 * Trois niveaux d'information coexistent :
 *  1. VÉRITÉ   : this.truth (journal append-only, horodaté, jamais envoyé aux clients)
 *  2. CONNAISSANCE : player.knowledge (ce que chacun a vu, entendu, déduit, reçu)
 *  3. VUE      : buildSelfView() — ce que l'écran d'un joueur a le droit d'afficher
 */
import type {
  BoardEntry,
  ChatChannel,
  ChatMessage,
  EpilogueView,
  FeedMessage,
  GamePlayerView,
  GameSelfView,
  GameSnapshot,
  KnowledgeEntry,
  ObjectView,
  Phase,
  TraceView,
  Character,
  GestureKind,
} from '@shared/types';
import { OBJECT_TYPES, objectTypeDef } from '@shared/content/objects';
import { SHOE_PATTERNS, SHOE_SIZES } from '@shared/content/scenarios';
import type { GameAction } from '@shared/protocol';
import { GAME_CONFIG, META_CONFIG, formatClock } from '@shared/config';
import {
  PLAYER_SPAWNS,
  adjacentRooms,
  applyPortal,
  stepAllowed,
  buildWorldGrid,
  doorAt,
  roomAt,
  roomById,
  roomName,
  randomFreeTile,
  type WorldGrid,
} from '@shared/content/villa';
import type { TruthEventType } from '@shared/content/events';
import type {
  Body,
  Evidence,
  EvidenceKind,
  GameObject,
  PlayerState,
  Relation,
  SocialEvent,
  StoredChat,
  Testimony,
  TruthEvent,
} from './state';
import { RelationshipSystem } from './relationships';
import { ActionSystem } from './actions';
import { CaseSystem } from './case/system';
import { doorsBetween } from './pathfinding';
import { pick, seededRandom, shortId, shuffle, UserError } from '../util';

export interface GameInit {
  id: string;
  lobbyId: string;
  title: string;
  players: { userId: string; name: string; character: Character }[];
  emit: (userId: string, event: 'game:full' | 'game:snapshot' | 'game:ended', payload?: unknown) => void;
  onFinished?: (epilogue: EpilogueView, game: GameInstance) => void;
  /** échelle de durée de la nuit (durée choisie × accélération de test) */
  timeScale?: number;
  /** échelle des votes et délais d'action (accélération de test seulement) */
  voteScale?: number;
  /** personnage (catalogue) de la victime, non choisi par les joueurs */
  victimCastId?: string;
  /** scénario imposé (sinon tiré au sort) */
  scenarioId?: string;
  seed?: number;
  /** horloge injectable (tests) */
  now?: () => number;
  /** pas de boucle automatique (tests : appeler tick()) */
  manual?: boolean;
}

const FEED_LIMIT = 80;
const CHAT_LIMIT = 300;
const SIGHTING_COOLDOWN_MIN = 15;

export class GameInstance {
  readonly id: string;
  readonly lobbyId: string;
  readonly title: string;
  readonly grid: WorldGrid = buildWorldGrid();
  readonly rnd: () => number;
  readonly timeScale: number;
  readonly voteScale: number;
  readonly maxMurders = 99;

  players = new Map<string, PlayerState>();
  objects = new Map<string, GameObject>();
  evidence: Evidence[] = [];
  bodies: Body[] = [];
  relations: Relation[] = [];
  social: SocialEvent[] = [];
  truth: TruthEvent[] = [];
  board: BoardEntry[] = [];
  chat: StoredChat[] = [];
  testimonies: Testimony[] = [];
  unlockedDoors = new Set<string>();
  flags: Record<string, boolean> = {};
  phase: Phase = 'ARRIVAL';
  phaseStartedAt: number;
  startedAt: number;
  blackoutUntil = 0;
  murders = 0;
  ended = false;

  readonly relationships: RelationshipSystem;
  readonly actions: ActionSystem;
  readonly caseSystem: CaseSystem;

  private seq = 0;
  private gestureSeq = 0;

  /** Geste visible d'un joueur (ramasser, fouiller…) : pur retour visuel pour les témoins. */
  gesture(p: PlayerState, kind: GestureKind, ms = 1500) {
    p.gesture = { kind, seq: ++this.gestureSeq, until: this.now() + ms };
  }
  private timers: NodeJS.Timeout[] = [];
  private lastSecondTick = 0;
  private lastSimAt = 0;
  private readonly emitFn: GameInit['emit'];
  private readonly finishedFn?: GameInit['onFinished'];
  readonly now: () => number;

  constructor(init: GameInit) {
    this.id = init.id;
    this.lobbyId = init.lobbyId;
    this.title = init.title;
    this.emitFn = init.emit;
    this.finishedFn = init.onFinished;
    this.timeScale = init.timeScale ?? 1;
    this.voteScale = init.voteScale ?? 1;
    this.rnd = seededRandom(init.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.now = init.now ?? (() => Date.now());
    this.startedAt = this.now();
    this.phaseStartedAt = this.startedAt;

    init.players.forEach((pl, i) => {
      const spawn = PLAYER_SPAWNS[i % PLAYER_SPAWNS.length];
      const p: PlayerState = {
        id: pl.userId,
        name: pl.name,
        character: pl.character,
        alive: true,
        connected: true,
        pos: { ...spawn },
        input: { x: 0, y: 0 },
        running: false,
        facing: 0,
        roomId: roomAt(this.grid, spawn.x, spawn.y)?.id ?? 'hall',
        inventory: [],
        secretId: '',
        secretText: '',
        secretReveal: '',
        fingerprint: '',
        shoe: { pattern: '', size: 0 },
        muddyUntil: 0,
        lastFootprintAt: 0,
        stained: false,
        knowledge: [],
        feed: [],
        toolUses: {},
        sightings: new Map(),
        roomHistory: [],
        roomTime: {},
        metrics: { objectsTouched: 0, socialActions: 0, examinations: 0 },
        motiveAgainst: new Set(),
        pendingTestimony: null,
        gesture: null,
        arrested: false,
        accusationsUsed: 0,
        gloves: false,
        dirty: true,
      };
      p.roomHistory.push({ clock: this.clock(), roomId: p.roomId });
      this.players.set(p.id, p);
    });

    this.relationships = new RelationshipSystem(this);
    this.actions = new ActionSystem(this);
    this.caseSystem = new CaseSystem(this);

    this.assignIdentities();
    this.spawnAmbientObjects();
    this.caseSystem.setup({ victimCastId: init.victimCastId, scenarioId: init.scenarioId });
    if (!init.manual) this.start();
    this.log('GAME_STARTED', { text: `La nuit commence — ${this.title}` });
  }

  /** Identités physiques uniques et cachées : empreintes digitales, motif et pointure des semelles. */
  private assignIdentities() {
    const patterns = shuffle(SHOE_PATTERNS, this.rnd);
    const used = new Set<string>();
    [...this.players.values()].forEach((p, i) => {
      p.shoe = { pattern: patterns[i % patterns.length], size: pick(SHOE_SIZES, this.rnd) };
      let code = '';
      do code = `${String.fromCharCode(65 + Math.floor(this.rnd() * 26))}-${10 + Math.floor(this.rnd() * 89)}`;
      while (used.has(code));
      used.add(code);
      p.fingerprint = code;
    });
  }

  /** Objets utilitaires (lampes, briquets, torchons, gants, couteau, clé de la cave…) : chacun a un usage. */
  private spawnAmbientObjects() {
    for (const def of OBJECT_TYPES) {
      if (def.eventOnly || !def.spawnRooms.length || this.rnd() > def.spawnChance) continue;
      const roomId = pick(def.spawnRooms.filter((r) => roomById(r)), this.rnd);
      if (!roomId) continue;
      const t = randomFreeTile(this.grid, roomId, this.rnd);
      const o: GameObject = {
        id: shortId('o_'),
        type: def.type,
        def: objectTypeDef(def.type)!,
        name: def.name,
        location: { kind: 'floor', roomId, pos: { x: t.x + (this.rnd() - 0.5) * 0.3, y: t.y + (this.rnd() - 0.5) * 0.3 } },
        spawnRoomId: roomId,
        history: [{ clock: this.clock(), text: `Présent — ${roomName(roomId)}` }],
        traces: [],
        lit: false,
        knownBy: new Set(),
        props: {},
      };
      this.objects.set(o.id, o);
    }
  }

  // ───────────────────────── temps ─────────────────────────

  start() {
    this.lastSimAt = this.now();
    const simMs = 1000 / GAME_CONFIG.tickRate;
    this.timers.push(setInterval(() => this.tick(), simMs));
    this.timers.push(setInterval(() => this.broadcast(), 1000 / GAME_CONFIG.snapshotRate));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  elapsedSec() {
    return (this.now() - this.startedAt) / 1000;
  }

  scaled(seconds: number) {
    return seconds * this.timeScale;
  }

  /** Horloge de jeu en minutes depuis minuit (23:47 → …). */
  clock() {
    return GAME_CONFIG.startClockMinutes + (this.elapsedSec() * GAME_CONFIG.gameMinutesPerSecond) / this.timeScale;
  }

  /** Avance la simulation. dt calculé depuis l'horloge (injectable). */
  tick() {
    const now = this.now();
    const dt = Math.min(0.25, Math.max(0, (now - (this.lastSimAt || now)) / 1000));
    this.lastSimAt = now;
    if (!this.ended) for (const p of this.players.values()) this.simulatePlayer(p, dt);
    if (now - this.lastSecondTick >= 1000) {
      this.lastSecondTick = now;
      this.secondTick();
    }
  }

  private secondTick() {
    if (this.blackoutUntil && this.now() >= this.blackoutUntil) {
      this.blackoutUntil = 0;
      this.log('BLACKOUT_ENDED', { text: 'Le courant revient' });
      this.feedAll('narration', 'Le courant revient dans un grésillement. Les lumières clignotent.');
      this.markAllDirty();
    }
    if (!this.ended) {
      this.recordSightings();
      this.checkBodyDiscovery();
      this.caseSystem.tick();
    }
  }

  // ───────────────────────── journal de vérité ─────────────────────────

  log(
    type: TruthEventType,
    f: { actorId?: string; targetId?: string; objectId?: string; roomId?: string; text?: string; data?: Record<string, unknown> } = {},
  ): TruthEvent {
    const ev: TruthEvent = { seq: ++this.seq, type, t: this.now() - this.startedAt, clock: this.clock(), ...f };
    this.truth.push(ev);
    return ev;
  }

  // ───────────────────────── helpers ─────────────────────────

  nameOf(id: string) {
    return this.players.get(id)?.name ?? 'Inconnu';
  }

  alivePlayers() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  adjacent(roomId: string) {
    return adjacentRooms(roomId);
  }

  isBlackout() {
    return this.blackoutUntil > this.now();
  }

  hasLight(p: PlayerState) {
    return p.inventory.some((id) => {
      const o = this.objects.get(id);
      return !!o && o.lit && o.def.tags.includes('light');
    });
  }

  /** Le joueur voit-il l'intérieur de sa pièce ? */
  canSeeRoom(p: PlayerState) {
    return !this.isBlackout() || this.hasLight(p) || !!roomById(p.roomId)?.outdoor;
  }

  /**
   * L'observateur voit-il la cible ? Même pièce (avec lumière pendant une coupure),
   * ou pièce voisine à travers une porte ouverte, si les deux sont près de cette porte.
   */
  canSee(observer: PlayerState, target: PlayerState) {
    if (observer.roomId !== target.roomId) {
      if (this.isBlackout()) return false;
      return doorsBetween(observer.roomId, target.roomId, this.unlockedDoors).some(
        (d) => Math.hypot(d.x + 0.5 - observer.pos.x, d.y + 0.5 - observer.pos.y) < 7 && Math.hypot(d.x + 0.5 - target.pos.x, d.y + 0.5 - target.pos.y) < 7,
      );
    }
    if (!this.isBlackout()) return true;
    if (roomById(observer.roomId)?.outdoor) return Math.hypot(observer.pos.x - target.pos.x, observer.pos.y - target.pos.y) < 3;
    return this.hasLight(observer) || this.hasLight(target);
  }

  markDirty(...ids: string[]) {
    for (const id of ids) {
      const p = this.players.get(id);
      if (p) p.dirty = true;
    }
  }

  markAllDirty() {
    for (const p of this.players.values()) p.dirty = true;
  }

  feed(playerId: string, style: FeedMessage['style'], text: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.feed.push({ id: shortId('f_'), at: this.clock(), style, text });
    if (p.feed.length > FEED_LIMIT) p.feed.splice(0, p.feed.length - FEED_LIMIT);
    p.dirty = true;
  }

  feedAll(style: FeedMessage['style'], text: string) {
    for (const id of this.players.keys()) this.feed(id, style, text);
  }

  know(playerId: string, kind: KnowledgeEntry['kind'], text: string, opts: { important?: boolean; sourceId?: string } = {}): KnowledgeEntry | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const e: KnowledgeEntry = {
      id: shortId('k_'),
      at: this.clock(),
      kind,
      text,
      important: opts.important,
      sourceId: opts.sourceId,
      sourceName: opts.sourceId ? this.nameOf(opts.sourceId) : undefined,
    };
    p.knowledge.push(e);
    p.dirty = true;
    return e;
  }

  /** Les témoins (vivants, même pièce, capables de voir l'acteur) apprennent ce qu'ils voient. */
  perceive(actorId: string, text: string, opts: { exclude?: string[]; important?: boolean } = {}) {
    const actor = this.players.get(actorId);
    if (!actor) return;
    const stamp = formatClock(this.clock());
    for (const w of this.alivePlayers()) {
      if (w.id === actorId || opts.exclude?.includes(w.id)) continue;
      if (!this.canSee(w, actor)) continue;
      this.know(w.id, 'seen', `${stamp} — ${text} (${roomName(actor.roomId)})`, { important: opts.important });
      this.feed(w.id, 'whisper', text);
    }
  }

  /** Les joueurs des pièces voisines (et ceux qui ne voient rien dans la même pièce) entendent. */
  hearFrom(roomId: string, text: string, actorId?: string, exclude: string[] = []) {
    const adj = this.adjacent(roomId);
    const actor = actorId ? this.players.get(actorId) : undefined;
    for (const p of this.alivePlayers()) {
      if (p.id === actorId || exclude.includes(p.id)) continue;
      const sameRoomBlind = p.roomId === roomId && actor && !this.canSee(p, actor);
      if (!adj.includes(p.roomId) && !sameRoomBlind) continue;
      this.know(p.id, 'heard', `${formatClock(this.clock())} — ${text}`, { important: true });
      this.feed(p.id, 'whisper', text);
    }
  }

  addEvidence(kind: EvidenceKind, roomId: string, pos: { x: number; y: number }, data: Record<string, unknown>, visible: boolean, sourceId?: string) {
    const ev: Evidence = { id: shortId('e_'), kind, roomId, pos: { ...pos }, clock: this.clock(), sourceId, data, visible, cleaned: false, discoveredBy: new Set() };
    this.evidence.push(ev);
    // borne la mémoire : on retire les plus vieilles empreintes de pas
    const prints = this.evidence.filter((e) => e.kind === 'footprint');
    if (prints.length > 260) this.evidence.splice(this.evidence.indexOf(prints[0]), 1);
    if (kind !== 'footprint') this.log('EVIDENCE_CREATED', { roomId, actorId: sourceId, data: { kind, evidenceId: ev.id } });
    return ev;
  }

  addBoard(kind: BoardEntry['kind'], authorId: string | null, text: string, verified: boolean): BoardEntry {
    const e: BoardEntry = {
      id: shortId('bd_'),
      authorId: authorId ?? 'system',
      authorName: authorId ? this.nameOf(authorId) : 'Villa Beaumont',
      kind,
      text,
      verified,
      at: this.clock(),
    };
    this.board.push(e);
    this.markAllDirty();
    return e;
  }

  roomAtClock(playerId: string, clock: number): string | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    let room: string | null = p.roomHistory[0]?.roomId ?? null;
    for (const h of p.roomHistory) {
      if (h.clock <= clock) room = h.roomId;
      else break;
    }
    return room;
  }

  setPhase(phase: Phase) {
    if (this.phase === phase) return;
    const prev = this.phase;
    this.phase = phase;
    this.phaseStartedAt = this.now();
    this.log('PHASE_CHANGED', { data: { from: prev, to: phase }, text: `Phase : ${prev} → ${phase}` });
    this.markAllDirty();
  }

  startBlackout(seconds: number) {
    this.blackoutUntil = this.now() + seconds * 1000;
    this.log('BLACKOUT_STARTED', { text: `Coupure de courant (${formatClock(this.clock())})` });
    this.markAllDirty();
  }

  onFinished(epilogue: EpilogueView) {
    this.finishedFn?.(epilogue, this);
  }

  // ───────────────────────── simulation ─────────────────────────

  private passable(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.grid.w || ty >= this.grid.h) return false;
    const idx = ty * this.grid.w + tx;
    if (!this.grid.rooms[idx] || this.grid.blocked[idx]) return false;
    const door = doorAt(this.grid, tx, ty);
    if (door?.lockedBy && !this.unlockedDoors.has(door.id)) return false;
    return true;
  }

  private fits(x: number, y: number) {
    const r = GAME_CONFIG.playerRadius;
    return this.passable(x - r, y - r) && this.passable(x + r, y - r) && this.passable(x - r, y + r) && this.passable(x + r, y + r);
  }

  private simulatePlayer(p: PlayerState, dt: number) {
    if (!p.alive || !p.connected || p.arrested) return;
    const len = Math.hypot(p.input.x, p.input.y);
    if (len > 0.01) {
      const speed = p.running ? GAME_CONFIG.runSpeed : GAME_CONFIG.walkSpeed;
      const vx = (p.input.x / len) * speed * dt;
      const vy = (p.input.y / len) * speed * dt;
      if (this.fits(p.pos.x + vx, p.pos.y) && stepAllowed(p.pos.x, p.pos.y, p.pos.x + vx, p.pos.y)) p.pos.x += vx;
      if (this.fits(p.pos.x, p.pos.y + vy) && stepAllowed(p.pos.x, p.pos.y, p.pos.x, p.pos.y + vy)) p.pos.y += vy;
      p.facing = Math.atan2(vy, vx);
      // haut de l'escalier : passage au palier de l'étage (et retour)
      const portal = applyPortal(p.pos.x, p.pos.y);
      if (portal && this.fits(portal.x, portal.y)) p.pos = portal;
    }
    p.roomTime[p.roomId] = (p.roomTime[p.roomId] ?? 0) + dt;
    const room = roomAt(this.grid, p.pos.x, p.pos.y);
    if (room && room.id !== p.roomId) this.changeRoom(p, room.id);
    const now = this.now();
    const cur = roomById(p.roomId);
    if (cur?.muddy) p.muddyUntil = now + GAME_CONFIG.mudDurationSec * 1000 * Math.max(this.timeScale, 0.05);
    else if (p.muddyUntil > now && !cur?.outdoor && len > 0.01 && now - p.lastFootprintAt > GAME_CONFIG.footprintIntervalSec * 1000) {
      p.lastFootprintAt = now;
      this.addEvidence('footprint', p.roomId, { x: p.pos.x, y: p.pos.y }, { pattern: p.shoe.pattern, size: p.shoe.size, angle: p.facing }, true, p.id);
    }
  }

  private changeRoom(p: PlayerState, roomId: string) {
    const from = p.roomId;
    p.roomId = roomId;
    p.roomHistory.push({ clock: this.clock(), roomId });
    const dark = this.isBlackout();
    this.log('PLAYER_LEFT_ROOM', { actorId: p.id, roomId: from });
    this.log('PLAYER_ENTERED_ROOM', { actorId: p.id, roomId, data: { from, dark }, text: `${p.name} entre — ${roomName(roomId)}` });
    // Ceux qui voient entrer quelqu'un en gardent une trace immédiate
    for (const w of this.alivePlayers()) {
      if (w.id === p.id || w.roomId !== roomId || !this.canSee(w, p)) continue;
      this.recordSighting(w, p, true);
      this.recordSighting(p, w, true);
    }
    p.dirty = true;
  }

  private recordSighting(observer: PlayerState, target: PlayerState, force = false) {
    const key = `${target.id}|${target.roomId}`;
    const last = observer.sightings.get(key);
    const clock = this.clock();
    if (!force && last !== undefined && clock - last < SIGHTING_COOLDOWN_MIN) return;
    if (force && last !== undefined && clock - last < 3) return;
    observer.sightings.set(key, clock);
    const stained = target.stained ? ' Ses vêtements portent une tache sombre.' : '';
    this.know(observer.id, 'seen', `${formatClock(clock)} — Vu ${target.name} (${roomName(target.roomId)}).${stained}`, { important: !!stained });
  }

  private recordSightings() {
    const alive = this.alivePlayers();
    for (const a of alive) for (const b of alive) if (a.id !== b.id && this.canSee(a, b)) this.recordSighting(a, b);
  }

  private checkBodyDiscovery() {
    for (const body of this.bodies) {
      if (body.discovered) continue;
      const finder = this.alivePlayers().find(
        (p) => p.id !== body.killerId && p.roomId === body.roomId && this.canSeeRoom(p),
      );
      if (finder) this.discoverBody(body, finder.id);
    }
  }

  discoverBody(body: Body, finderId: string | null, npcName?: string) {
    if (body.discovered) return;
    body.discovered = true;
    body.discoveredBy = finderId ?? undefined;
    body.discoveredAt = this.clock();
    if (finderId) this.know(finderId, 'seen', `${formatClock(this.clock())} — J’ai découvert le corps de ${this.nameOf(body.playerId)} (${roomName(body.roomId)}).`, { important: true });
    this.feedAll('danger', `${finderId ? this.nameOf(finderId) : npcName} découvre le corps de ${this.nameOf(body.playerId)} — ${roomName(body.roomId)}. Le meurtrier a frappé à nouveau.`);
    this.log('BODY_DISCOVERED', {
      actorId: finderId ?? undefined,
      targetId: body.playerId,
      roomId: body.roomId,
      data: { victimId: body.playerId, actorName: finderId ? this.nameOf(finderId) : npcName },
      text: `${finderId ? this.nameOf(finderId) : npcName} découvre le corps de ${this.nameOf(body.playerId)} — ${roomName(body.roomId)}`,
    });
    this.markAllDirty();
  }

  // ───────────────────────── entrées client ─────────────────────────

  setInput(userId: string, dx: number, dy: number, run = false) {
    const p = this.players.get(userId);
    if (!p || !p.alive || p.arrested) return;
    const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    p.input = { x: clamp(dx), y: clamp(dy) };
    p.running = run;
  }

  setConnected(userId: string, connected: boolean) {
    const p = this.players.get(userId);
    if (!p) return;
    p.connected = connected;
    if (!connected) p.input = { x: 0, y: 0 };
    p.dirty = true;
    if (connected) this.emitFn(userId, 'game:full', this.buildSelfView(p));
  }

  action(userId: string, a: GameAction): string | undefined {
    const p = this.players.get(userId);
    if (!p) throw new UserError('Vous ne participez pas à cette partie.');
    if (!a || typeof a !== 'object' || typeof (a as { type?: unknown }).type !== 'string') throw new UserError('Action invalide.');
    let msg: string | undefined;
    switch (a.type) {
      case 'relation':
        this.caseSystem.requireActive(p);
        if (!['propose', 'accept', 'decline', 'break'].includes(a.op)) throw new UserError('Action invalide.');
        if (a.op === 'propose' && !['FRIEND', 'ALLY', 'PACT', 'ENEMY'].includes(a.relType as string)) throw new UserError('Relation inconnue.');
        if (a.op === 'propose') msg = this.relationships.propose(p.id, a.relType!, a.targetId!);
        else if (a.op === 'accept' || a.op === 'decline') msg = this.relationships.respond(p.id, a.relationId!, a.op === 'accept');
        else msg = this.relationships.breakRelation(p.id, a.relationId!);
        break;
      case 'share':
        msg = this.share(p, a.knowledgeId, a.to, a.targetId);
        break;
      case 'claim':
        msg = this.claim(p, a.text);
        break;
      case 'tool':
        msg = this.caseSystem.useTool(p, String(a.toolId), a.targetId === undefined ? undefined : String(a.targetId));
        break;
      case 'unlock':
        this.caseSystem.requireActive(p);
        msg = this.caseSystem.unlock(p, this.actions.reachable(p, String(a.objectId)), String(a.code ?? ''));
        break;
      case 'open': {
        this.caseSystem.requireActive(p);
        const o = this.actions.reachable(p, String(a.objectId));
        msg = o.def.tags.includes('container') ? this.caseSystem.open(p, o) : (this.caseSystem.eject(p, o) ?? 'Rien à retirer.');
        break;
      }
      case 'insert':
        msg = this.caseSystem.insert(p, String(a.mediaId), String(a.deviceId));
        break;
      case 'search_body':
        msg = this.caseSystem.searchBody(p, String(a.bodyId));
        break;
      case 'present':
        msg = this.caseSystem.present(p, String(a.objectId), a.againstId ? String(a.againstId) : undefined);
        break;
      case 'alibi':
        msg = this.caseSystem.declareAlibi(p, String(a.place), String(a.text ?? ''));
        break;
      case 'accuse':
        msg = this.caseSystem.accuse(p, String(a.targetId), a.evidenceIds, String(a.text ?? ''));
        break;
      case 'defend':
        msg = this.caseSystem.defend(p, String(a.text ?? ''));
        break;
      case 'ballot':
        if (!p.alive) throw new UserError('Les morts ne votent pas.');
        msg = this.caseSystem.ballot(p, String(a.choice));
        break;
      default:
        msg = this.actions.handle(p, a);
    }
    p.dirty = true;
    return msg;
  }

  private share(p: PlayerState, knowledgeId: string, to: 'board' | 'player' | 'allies', targetId?: string) {
    this.caseSystem.requireActive(p);
    const k = p.knowledge.find((x) => x.id === knowledgeId);
    if (!k) throw new UserError('Information introuvable.');
    if (to === 'board') {
      this.addBoard('evidence', p.id, k.text, k.kind !== 'received');
      this.log('KNOWLEDGE_SHARED', { actorId: p.id, data: { to, knowledgeId }, text: `${p.name} partage publiquement : ${k.text}` });
      return 'Partagé sur le tableau d’enquête.';
    }
    const recipients = to === 'allies' ? this.relationships.alliesOf(p.id) : targetId ? [targetId] : [];
    if (!recipients.length) throw new UserError(to === 'allies' ? 'Vous n’avez pas d’allié.' : 'Destinataire manquant.');
    for (const r of recipients) {
      const t = this.players.get(r);
      if (!t) continue;
      this.know(r, 'received', k.text, { sourceId: p.id, important: k.important });
      this.feed(r, 'whisper', `${p.name} vous transmet une information. (Carnet)`);
    }
    this.log('KNOWLEDGE_SHARED', { actorId: p.id, data: { to, recipients }, text: `${p.name} transmet à ${recipients.map((r) => this.nameOf(r)).join(', ')} : ${k.text}` });
    return 'Information transmise.';
  }

  private claim(p: PlayerState, text: string) {
    this.caseSystem.requireActive(p);
    const t = String(text ?? '').trim().slice(0, 240);
    if (t.length < 3) throw new UserError('Déclaration trop courte.');
    this.addBoard('claim', p.id, t, false);
    this.log('CLAIM_MADE', { actorId: p.id, text: `${p.name} déclare : ${t}` });
    return 'Déclaration publiée.';
  }

  // ───────────────────────── chat ─────────────────────────

  sendChat(userId: string, channel: ChatChannel, textIn: string) {
    const p = this.players.get(userId);
    if (!p) throw new UserError('Hors partie.');
    if (typeof channel !== 'string') throw new UserError('Canal inconnu.');
    const text = String(textIn ?? '').trim().slice(0, META_CONFIG.chatMaxLength);
    if (!text) throw new UserError('Message vide.');
    let stored: StoredChat;
    const base = { id: shortId('c_'), fromId: p.id, fromName: p.name, text, at: this.clock() };
    if ((!p.alive || p.arrested) && channel !== 'dead') {
      if (this.ended) channel = 'general';
      else throw new UserError('Hors jeu : vous ne pouvez parler qu’aux autres spectateurs.');
    }
    if (channel === 'general' || channel === 'dead') {
      stored = { ...base, channel, audience: null };
    } else if (channel.startsWith('dm:')) {
      const other = this.players.get(channel.slice(3));
      if (!other || other.id === p.id) throw new UserError('Destinataire introuvable.');
      if (!other.alive && !this.ended) throw new UserError('Cette personne ne vous répondra plus.');
      stored = { ...base, channel: `dm:${[p.id, other.id].sort().join('|')}`, audience: [p.id, other.id] };
      if (other.roomId === p.roomId) this.perceive(p.id, `${p.name} murmure quelque chose à l’oreille de ${other.name}.`, { exclude: [other.id] });
    } else if (channel.startsWith('ally:')) {
      const rel = this.relations.find((r) => r.id === channel.slice(5));
      if (!rel || rel.status !== 'active' || (rel.from !== p.id && rel.to !== p.id) || !['ALLY', 'PACT'].includes(rel.type))
        throw new UserError('Canal d’alliance indisponible.');
      stored = { ...base, channel, audience: [rel.from, rel.to] };
    } else throw new UserError('Canal inconnu.');
    this.chat.push(stored);
    if (this.chat.length > CHAT_LIMIT) this.chat.splice(0, this.chat.length - CHAT_LIMIT);
    for (const id of stored.audience ?? this.players.keys()) this.markDirty(id);
  }

  private chatFor(p: PlayerState): ChatMessage[] {
    const out: ChatMessage[] = [];
    for (const m of this.chat) {
      if (m.channel === 'dead' && p.alive && !p.arrested && !this.ended) continue;
      if (m.audience && !m.audience.includes(p.id)) continue;
      let channel = m.channel as ChatChannel;
      if (m.channel.startsWith('dm:')) {
        const other = m.channel.slice(3).split('|').find((id) => id !== p.id)!;
        channel = `dm:${other}`;
      }
      out.push({ id: m.id, channel, fromId: m.fromId, fromName: m.fromName, text: m.text, at: m.at });
    }
    return out.slice(-150);
  }

  // ───────────────────────── vues (filtrage vérité → joueur) ─────────────────────────

  private visiblePlayers(viewer: PlayerState): GamePlayerView[] {
    const spectator = !viewer.alive || viewer.arrested || this.ended;
    const allies = new Set(this.relationships.alliesOf(viewer.id));
    return [...this.players.values()].map((p) => {
      const base: GamePlayerView = { id: p.id, name: p.name, character: p.character, alive: p.alive, connected: p.connected };
      if (!p.alive) return base; // le corps est rendu séparément
      const visible = p.id === viewer.id || spectator || this.canSee(viewer, p);
      if (visible)
        return {
          ...base,
          pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2) },
          facing: +p.facing.toFixed(2),
          roomId: p.roomId,
          hasLight: this.hasLight(p),
          stained: p.stained,
          gesture: p.gesture && p.gesture.until > this.now() ? { kind: p.gesture.kind, seq: p.gesture.seq } : undefined,
        };
      if (allies.has(p.id)) return { ...base, pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2) }, roomId: p.roomId, viaAlliance: true };
      return base;
    });
  }

  private objectView(o: GameObject, viewer: PlayerState): ObjectView {
    const v: ObjectView = { id: o.id, type: o.type, name: o.name, icon: o.def.icon, ...this.caseSystem.objectExtras(viewer, o) };
    if (o.location.kind === 'floor' || o.location.kind === 'hidden') {
      v.pos = o.location.pos;
      v.roomId = o.location.roomId;
    }
    if (o.location.kind === 'player') v.inInventory = true;
    if (o.traces.some((t) => t.kind === 'blood' && !t.cleaned)) v.bloody = true;
    if (o.lit) v.lit = true;
    return v;
  }

  private visibleObjects(viewer: PlayerState): ObjectView[] {
    const spectator = !viewer.alive || viewer.arrested || this.ended;
    const seeRoom = this.canSeeRoom(viewer);
    const out: ObjectView[] = [];
    for (const o of this.objects.values()) {
      if (o.location.kind === 'floor' && (spectator || (o.location.roomId === viewer.roomId && seeRoom))) out.push(this.objectView(o, viewer));
      else if (o.location.kind === 'hidden' && (spectator ? false : o.knownBy.has(viewer.id) && o.location.roomId === viewer.roomId))
        out.push({ ...this.objectView(o, viewer), name: `${o.name} (${o.location.furnitureId.startsWith('body:') ? 'sur le corps' : 'caché'})` });
    }
    return out;
  }

  private visibleTraces(viewer: PlayerState): TraceView[] {
    const spectator = !viewer.alive || viewer.arrested || this.ended;
    const seeRoom = this.canSeeRoom(viewer);
    const out: TraceView[] = [];
    for (const e of this.evidence) {
      if (e.cleaned) continue;
      const inRoom = e.roomId === viewer.roomId && seeRoom;
      if (!((e.visible && (inRoom || spectator)) || (e.discoveredBy.has(viewer.id) && inRoom))) continue;
      const label =
        e.kind === 'footprint' ? 'Empreinte de boue' : e.kind === 'blood_pool' ? 'Sang' : e.kind === 'ashes' ? 'Cendres' : e.kind === 'forced_lock' ? 'Serrure forcée' : e.kind === 'diluted_blood' ? 'Sang dilué' : 'Zone frottée';
      out.push({ id: e.id, kind: e.kind, pos: e.pos, roomId: e.roomId, label });
    }
    return out;
  }

  private visibleBodies(viewer: PlayerState) {
    const spectator = !viewer.alive || viewer.arrested || this.ended;
    return this.bodies
      .filter((b) => spectator || b.discovered || (b.roomId === viewer.roomId && this.canSeeRoom(viewer)) || b.killerId === viewer.id)
      .map((b) => {
        if (b.npc) return { id: b.id, playerId: b.playerId, npc: true, name: b.npc.name, character: b.npc.character, pos: b.pos, roomId: b.roomId };
        const p = this.players.get(b.playerId)!;
        return { id: b.id, playerId: b.playerId, name: p.name, character: p.character, pos: b.pos, roomId: b.roomId };
      });
  }

  private opportunityView(p: PlayerState) {
    const o = this.caseSystem.opportunityFor(p);
    if (!o) return null;
    return {
      targetId: o.target.id,
      targetName: o.target.name,
      objectId: o.weapon.id,
      objectName: o.weapon.name,
      text: o.dark
        ? `Dans le noir, personne ne vous voit. ${o.target.name} est tout près. ${o.weapon.name} est dans votre main.`
        : `${o.target.name} s’est officiellement opposé·e à vous, et vous êtes seuls. ${o.weapon.name} pèse dans votre main.`,
    };
  }

  buildSnapshot(p: PlayerState): GameSnapshot {
    return {
      clock: this.clock(),
      phase: this.phase,
      blackout: this.isBlackout(),
      players: this.visiblePlayers(p),
      objects: this.visibleObjects(p),
      bodies: this.visibleBodies(p),
      traces: this.visibleTraces(p),
      opportunity: this.opportunityView(p),
    };
  }

  buildSelfView(p: PlayerState): GameSelfView {
    const snap = this.buildSnapshot(p);
    const inv = p.inventory.map((id) => this.objectView(this.objects.get(id)!, p));
    const cs = this.caseSystem;
    return {
      gameId: this.id,
      lobbyId: this.lobbyId,
      title: this.title,
      you: p.id,
      alive: p.alive,
      ...snap,
      inventory: inv,
      relations: this.relationships.viewFor(p.id),
      knowledge: p.knowledge.slice(-200),
      role: cs.roleView(p),
      caseInfo: cs.caseView(p),
      dossier: cs.dossierView(p),
      publicEvidence: cs.publicEvidenceView(),
      alibis: cs.alibiViews(),
      oppositions: cs.oppositions,
      board: this.board.slice(-120),
      feed: p.feed,
      chat: this.chatFor(p),
      vote: cs.voteView(p),
      epilogue: cs.epilogue,
      unlockedDoors: [...this.unlockedDoors],
      muddy: p.muddyUntil > this.now(),
      testimonyRequest: p.pendingTestimony
        ? { requestId: p.pendingTestimony.requestId, question: p.pendingTestimony.question, fromName: p.pendingTestimony.fromName }
        : null,
      arrested: [...this.players.values()].filter((x) => x.arrested).map((x) => x.id),
    };
  }

  fullView(userId: string): GameSelfView | null {
    const p = this.players.get(userId);
    return p ? this.buildSelfView(p) : null;
  }

  broadcast() {
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      if (p.dirty) {
        p.dirty = false;
        this.emitFn(p.id, 'game:full', this.buildSelfView(p));
      } else {
        this.emitFn(p.id, 'game:snapshot', this.buildSnapshot(p));
      }
    }
  }
}
