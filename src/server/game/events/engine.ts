/**
 * Moteur d'événements générique.
 * Écoute le journal de vérité, évalue les règles data-driven (shared/content/events.ts)
 * et applique leurs conséquences. Ne contient AUCUNE histoire : uniquement des handlers.
 */
import { EVENT_RULES, type Condition, type Effect, type EventRule } from '@shared/content/events';
import { roomName } from '@shared/content/villa';
import { formatClock } from '@shared/config';
import type { GameInstance } from '../GameInstance';
import type { TruthEvent } from '../state';

type ConditionHandler<C extends Condition = Condition> = (g: GameInstance, c: C, ev: TruthEvent) => boolean;
type EffectHandler<E extends Effect = Effect> = (g: GameInstance, e: E, ev: TruthEvent) => void;

const CONDITIONS: { [K in Condition['type']]: ConditionHandler<Extract<Condition, { type: K }>> } = {
  phaseIn: (g, c) => c.phases.includes(g.phase),
  elapsedAtLeast: (g, c) => g.elapsedSec() >= g.scaled(c.seconds),
  phaseElapsedAtLeast: (g, c) => (g.now() - g.phaseStartedAt) / 1000 >= g.scaled(c.seconds),
  noCase: (g) => !g.case,
  hasCase: (g) => !!g.case,
  flag: (g, c) => !!g.flags[c.name] === c.value,
  eventField: (_g, c, ev) => {
    const v = (ev.data?.[c.field] ?? (ev as unknown as Record<string, unknown>)[c.field]) as string | number | boolean | undefined;
    return v !== undefined && c.in.includes(v);
  },
  objectHasTag: (g, c, ev) => {
    const o = ev.objectId ? g.objects.get(ev.objectId) : undefined;
    return !!o && (o.def.tags as string[]).includes(c.tag);
  },
  random: (g, c) => g.rnd() < c.chance,
  bodyUndiscoveredFor: (g, c) => g.bodies.some((b) => !b.discovered && (g.now() - b.diedAt) / 1000 >= g.scaled(c.seconds)),
  objectMovedFromSpawn: (g, c) => {
    for (const o of g.objects.values()) {
      if (o.type !== c.objectType) continue;
      if (o.location.kind === 'destroyed' || o.location.kind === 'player' || o.location.kind === 'hidden') return true;
      if (o.location.kind === 'floor' && o.location.roomId !== o.spawnRoomId) return true;
    }
    return false;
  },
  relationCountAtLeast: (g, c) => g.relations.filter((r) => r.status === 'active' && c.relTypes.includes(r.type)).length >= c.count,
  alivePlayersAtLeast: (g, c) => [...g.players.values()].filter((p) => p.alive).length >= c.count,
};

const EFFECTS: { [K in Effect['type']]: EffectHandler<Extract<Effect, { type: K }>> } = {
  announce: (g, e, ev) => g.feedAll(e.style ?? 'announce', renderText(g, e.text, ev)),
  whisper: (g, e, ev) => {
    const text = renderText(g, e.text, ev);
    let ids: string[] = [];
    if (e.to === 'actor' && ev.actorId) ids = [ev.actorId];
    else if (e.to === 'target' && ev.targetId) ids = [ev.targetId];
    else if (e.to === 'all') ids = [...g.players.keys()];
    else if (e.to === 'room' && ev.roomId) ids = g.alivePlayers().filter((p) => p.roomId === ev.roomId).map((p) => p.id);
    else if (e.to === 'adjacent') {
      // pièce de l'événement ou, à défaut, le bureau (téléphone)
      const room = ev.roomId ?? 'office';
      ids = g.alivePlayers().filter((p) => p.roomId === room || g.adjacent(room).includes(p.roomId)).map((p) => p.id);
    }
    for (const id of ids) {
      g.feed(id, 'whisper', text);
      g.know(id, 'heard', text);
    }
  },
  setPhase: (g, e) => g.setPhase(e.phase),
  setFlag: (g, e) => {
    g.flags[e.name] = e.value;
  },
  blackout: (g, e) => g.startBlackout(g.scaled(e.seconds)),
  openCase: (g, e, ev) => g.investigation.openCase(e.caseType, ev),
  assignRoles: (g) => g.investigation.assignRoles(),
  spawnSecretLetter: (g, e) => g.director.spawnSecretLetter(e.roomId),
  discoverBodyByNpc: (g, e) => {
    const body = g.bodies.find((b) => !b.discovered);
    if (body) g.discoverBody(body, null, e.npcName);
  },
  startVote: (g) => g.investigation.startVote(),
  endGame: (g) => g.investigation.finish(),
  delay: (g, e, ev) => g.engine.schedule(g.scaled(e.seconds), e.effects, ev),
};

export function renderText(g: GameInstance, text: string, ev: TruthEvent): string {
  const body = g.bodies.find((b) => b.playerId === (ev.data?.victimId as string)) ?? g.bodies[0];
  const victim = (ev.data?.victimId as string) ?? g.case?.victimId ?? body?.playerId;
  const actorName = (ev.data?.actorName as string) ?? (ev.actorId ? g.nameOf(ev.actorId) : 'Quelqu’un');
  return text
    .replaceAll('{actor}', actorName)
    .replaceAll('{target}', ev.targetId ? g.nameOf(ev.targetId) : 'quelqu’un')
    .replaceAll('{object}', ev.objectId ? (g.objects.get(ev.objectId)?.name.toLowerCase() ?? 'l’objet') : 'l’objet')
    .replaceAll('{room}', roomName(ev.roomId ?? g.case?.roomId))
    .replaceAll('{victim}', victim ? g.nameOf(victim) : 'quelqu’un')
    .replaceAll('{clock}', formatClock(g.clock()));
}

export class EventEngine {
  private fired = new Map<string, number>();
  private scheduled: { at: number; effects: Effect[]; ev: TruthEvent }[] = [];
  private depth = 0;

  constructor(
    private g: GameInstance,
    private rules: EventRule[] = EVENT_RULES,
  ) {}

  onEvent(ev: TruthEvent) {
    if (this.depth > 6) return; // garde-fou contre les chaînes infinies
    this.depth++;
    try {
      for (const rule of this.rules) {
        if (!rule.on.includes(ev.type)) continue;
        if (rule.once && this.fired.has(rule.id)) continue;
        const last = this.fired.get(rule.id);
        if (rule.cooldown && last !== undefined && (this.g.now() - last) / 1000 < this.g.scaled(rule.cooldown)) continue;
        if (!(rule.when ?? []).every((c) => (CONDITIONS[c.type] as ConditionHandler)(this.g, c, ev))) continue;
        this.fired.set(rule.id, this.g.now());
        if (ev.type !== 'TICK' || rule.once) this.g.log('EVENT_TRIGGERED', { data: { ruleId: rule.id }, text: `Règle « ${rule.description} »` });
        this.apply(rule.effects, ev);
      }
    } finally {
      this.depth--;
    }
  }

  apply(effects: Effect[], ev: TruthEvent) {
    for (const e of effects) (EFFECTS[e.type] as EffectHandler)(this.g, e, ev);
  }

  schedule(seconds: number, effects: Effect[], ev: TruthEvent) {
    this.scheduled.push({ at: this.g.now() + seconds * 1000, effects, ev });
  }

  /** Appelé chaque seconde : exécute les effets différés puis évalue les règles TICK. */
  tick() {
    const now = this.g.now();
    const due = this.scheduled.filter((s) => s.at <= now);
    this.scheduled = this.scheduled.filter((s) => s.at > now);
    for (const s of due) this.apply(s.effects, s.ev);
    this.onEvent({ seq: -1, type: 'TICK', t: now - this.g.startedAt, clock: this.g.clock() });
  }

  hasFired(ruleId: string) {
    return this.fired.has(ruleId);
  }
}
