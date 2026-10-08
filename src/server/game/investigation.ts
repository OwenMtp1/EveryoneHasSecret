/**
 * Enquête : ouverture d'une affaire, distribution dynamique des rôles, outils exclusifs,
 * témoignages, tableau public, vote et épilogue (révélation de la vérité).
 *
 * Asymétrie : chaque rôle n'accède qu'à une partie de la vérité. Exemple :
 * le Scientifique lit des CODES d'empreintes, mais ne sait à qui ils appartiennent qu'en
 * prélevant celles des joueurs ; l'Inspecteur lit des MOTIFS de semelles, etc.
 */
import type { CaseView, EpilogueView, RoleView } from '@shared/types';
import { ROLES, roleById, type RoleMetric } from '@shared/content/roles';
import { FURNITURE, ROOMS, allFurniture, roomById, roomName } from '@shared/content/villa';
import { findOutfit } from '@shared/content/character';
import { VOTE_DURATION_SEC } from '@shared/content/events';
import { GAME_CONFIG, formatClock } from '@shared/config';
import type { GameInstance } from './GameInstance';
import type { PlayerState, TruthEvent } from './state';
import { shortId, UserError } from '../util';

const WEAPON_CLASS_TEXT: Record<string, string> = {
  sharp: 'une plaie profonde, nette : une lame',
  blunt: 'un traumatisme crânien : un objet lourd et contondant',
  strangle: 'des marques de strangulation : un lien, une corde peut-être',
};

const IMPORTANT_TRUTH = new Set([
  'OBJECT_PICKED_UP',
  'OBJECT_HIDDEN',
  'OBJECT_GIVEN',
  'OBJECT_CLEANED',
  'OBJECT_DESTROYED',
  'DOOR_UNLOCKED',
  'DOOR_FORCED',
  'RELATION_CREATED',
  'BETRAYAL',
  'SECRET_DISCOVERED',
  'PLAYER_WASHED',
  'PLAYER_ATTACKED',
  'PLAYER_DIED',
  'BODY_DISCOVERED',
  'BLACKOUT_STARTED',
  'EVIDENCE_DESTROYED',
  'CASE_OPENED',
]);

export class InvestigationSystem {
  voteEndsAt = 0;
  epilogue: EpilogueView | null = null;

  constructor(private g: GameInstance) {}

  // ───────────── affaire ─────────────

  openCase(type: 'murder' | 'heist' | 'quiet', ev: TruthEvent) {
    const g = this.g;
    if (g.case) return;
    if (type === 'murder') {
      const body = g.bodies.find((b) => b.playerId === ev.data?.victimId) ?? g.bodies[0];
      if (!body) return;
      g.case = {
        type,
        victimId: body.playerId,
        roomId: body.roomId,
        discoveredAt: body.discoveredAt,
        discoveredBy: body.discoveredBy,
        culpritId: body.killerId,
        weaponId: body.weaponId,
        refClock: body.clock,
        openedAt: g.now(),
      };
    } else if (type === 'heist') {
      const necklace = [...g.objects.values()].find((o) => o.type === 'necklace');
      g.case = {
        type,
        roomId: necklace?.spawnRoomId ?? 'bedroom2',
        discoveredAt: g.clock(),
        culpritId: (necklace?.props.firstTakerId as string) ?? undefined,
        weaponId: necklace?.id,
        refClock: (necklace?.props.firstTakenAt as number) ?? g.clock() - 10,
        openedAt: g.now(),
      };
    } else {
      g.case = { type, openedAt: g.now() };
    }
    g.log('CASE_OPENED', { data: { caseType: type }, text: `Affaire ouverte : ${{ murder: 'meurtre', heist: 'vol du collier', quiet: 'aucune' }[type]}` });
    if (g.case.type !== 'quiet') g.addBoard('system', null, this.caseSummary(), true);
    g.markAllDirty();
  }

  caseSummary(): string {
    const c = this.g.case;
    if (!c) return '';
    if (c.type === 'murder')
      return `${this.g.nameOf(c.victimId!)} a été retrouvé·e mort·e — ${roomName(c.roomId)}. Corps découvert à ${formatClock(c.discoveredAt ?? 0)} par ${c.discoveredBy ? this.g.nameOf(c.discoveredBy) : 'le chien de la villa'}.`;
    if (c.type === 'heist') return `Le Collier Beaumont a disparu de la ${roomName(c.roomId).toLowerCase()}. Disparition constatée à ${formatClock(c.discoveredAt ?? 0)}.`;
    return 'La nuit s’achève sans drame… en apparence.';
  }

  caseView(): CaseView | null {
    const c = this.g.case;
    if (!c) return null;
    return {
      type: c.type,
      title: c.type === 'murder' ? 'MEURTRE À LA VILLA' : c.type === 'heist' ? 'LE VOL DU COLLIER' : 'UNE NUIT TRANQUILLE',
      victimId: c.victimId,
      victimName: c.victimId ? this.g.nameOf(c.victimId) : undefined,
      roomId: c.roomId,
      roomName: c.roomId ? roomName(c.roomId) : undefined,
      discoveredAt: c.discoveredAt,
      discoveredBy: c.discoveredBy ? this.g.nameOf(c.discoveredBy) : undefined,
      summary: this.caseSummary(),
    };
  }

  // ───────────── rôles ─────────────

  private metric(p: PlayerState, m: RoleMetric): number {
    const g = this.g;
    switch (m) {
      case 'discoveredBody':
        return g.case?.discoveredBy === p.id ? 1 : 0;
      case 'objectsTouched':
        return p.metrics.objectsTouched / 4;
      case 'timeInOffice':
        return (p.roomTime.office ?? 0) / 30;
      case 'timeInCrimeRoom':
        return g.case?.roomId ? (p.roomTime[g.case.roomId] ?? 0) / 30 : 0;
      case 'socialActions':
        return p.metrics.socialActions / 2;
      case 'relationsCount':
        return g.relations.filter((r) => r.status === 'active' && (r.from === p.id || r.to === p.id)).length;
      case 'examinations':
        return p.metrics.examinations / 2;
    }
  }

  /** Distribution dynamique : les rôles dépendent de ce que chacun a fait pendant la nuit. */
  assignRoles() {
    const g = this.g;
    const alive = g.alivePlayers();
    const roles = [...ROLES].sort((a, b) => a.priority - b.priority).slice(0, alive.length);
    // Affectation gloutonne globale : la paire (joueur, rôle) la plus « naturelle » d'abord
    const pairs: { p: PlayerState; role: (typeof roles)[number]; score: number }[] = [];
    for (const p of alive)
      for (const role of roles) {
        let score = g.rnd() * 0.5 - role.priority * 0.01;
        for (const [m, w] of Object.entries(role.affinity)) score += this.metric(p, m as RoleMetric) * (w ?? 0);
        pairs.push({ p, role, score });
      }
    pairs.sort((a, b) => b.score - a.score);
    const taken = new Set<string>();
    const done = new Set<string>();
    for (const { p: best, role } of pairs) {
      if (taken.has(role.id) || done.has(best.id)) continue;
      taken.add(role.id);
      done.add(best.id);
      best.roleId = role.id;
      best.toolUses = {};
      g.log('ROLE_ASSIGNED', { actorId: best.id, data: { roleId: role.id }, text: `${best.name} devient ${role.name}` });
      g.feed(best.id, 'announce', `Vous êtes ${role.name}. ${role.description}`);
      g.know(best.id, 'role', `Rôle attribué : ${role.name}.`, { important: true });
      g.addBoard('system', null, `${best.name} : ${role.name}.`, true);
    }
    g.markAllDirty();
  }

  roleView(p: PlayerState): RoleView | null {
    const r = p.roleId ? roleById(p.roleId) : undefined;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      tools: r.tools.map((t) => ({ id: t.id, name: t.name, description: t.description, usesLeft: t.maxUses !== undefined ? t.maxUses - (p.toolUses[t.id] ?? 0) : undefined })),
    };
  }

  // ───────────── outils ─────────────

  useTool(p: PlayerState, toolId: string, targetId?: string): string {
    const g = this.g;
    if (!g.case || !['INVESTIGATION', 'MAJOR_EVENT'].includes(g.phase)) throw new UserError('Il n’y a rien à enquêter pour l’instant.');
    const role = p.roleId ? roleById(p.roleId) : undefined;
    const tool = role?.tools.find((t) => t.id === toolId);
    if (!tool) throw new UserError('Vous n’avez pas cet outil.');
    const used = p.toolUses[toolId] ?? 0;
    if (tool.maxUses !== undefined && used >= tool.maxUses) throw new UserError('Vous avez épuisé cet outil.');
    const result = this.runTool(p, toolId, targetId);
    p.toolUses[toolId] = used + 1;
    p.metrics.examinations++;
    g.log('TOOL_USED', { actorId: p.id, targetId, data: { toolId }, text: `${p.name} utilise « ${tool.name} »` });
    g.markDirty(p.id);
    return result;
  }

  private nearPlayer(p: PlayerState, targetId?: string) {
    const t = targetId ? this.g.players.get(targetId) : undefined;
    if (!t || t.id === p.id || !t.alive) throw new UserError('Choisissez un joueur.');
    if (t.roomId !== p.roomId || Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) > GAME_CONFIG.interactRange + 0.6)
      throw new UserError(`Approchez-vous de ${t.name}.`);
    return t;
  }

  private runTool(p: PlayerState, toolId: string, targetId?: string): string {
    const g = this.g;
    const c = g.case!;
    switch (toolId) {
      case 'request_testimony': {
        const t = g.players.get(targetId ?? '');
        if (!t || !t.alive) throw new UserError('Choisissez un joueur vivant.');
        const when = formatClock(Math.round((c.refClock ?? g.clock()) / 15) * 15);
        t.pendingTestimony = { requestId: shortId('q_'), question: `Où étiez-vous vers ${when} ?`, fromId: p.id, fromName: p.name };
        g.feed(t.id, 'announce', `${p.name} vous interroge : « Où étiez-vous vers ${when} ? »`);
        g.markDirty(t.id);
        return `Question posée à ${t.name}.`;
      }
      case 'verify_testimony': {
        const tm = g.testimonies.find((x) => x.boardId === targetId || x.id === targetId);
        if (!tm) throw new UserError('Choisissez un témoignage du tableau.');
        const actual = g.roomAtClock(tm.playerId, c.refClock ?? g.clock());
        const ok = actual === tm.roomId;
        const text = `Vérification : le témoignage de ${g.nameOf(tm.playerId)} (« ${roomName(tm.roomId)} ») est ${ok ? 'COHÉRENT avec les faits' : 'INCOHÉRENT avec les faits'}.`;
        g.know(p.id, 'role', text, { important: true });
        return text;
      }
      case 'examine_body': {
        const body = g.bodies.find((b) => b.playerId === c.victimId);
        if (!body) throw new UserError('Il n’y a pas de corps à examiner.');
        if (p.roomId !== body.roomId || Math.hypot(body.pos.x - p.pos.x, body.pos.y - p.pos.y) > GAME_CONFIG.interactRange + 0.6)
          throw new UserError('Approchez-vous du corps.');
        const weapon = g.objects.get(body.weaponId);
        const killer = g.players.get(body.killerId)!;
        const lo = Math.floor((body.clock - 5) / 5) * 5;
        const hi = Math.ceil((body.clock + 5) / 5) * 5;
        const fiber = findOutfit(killer.character.outfitId).fiber;
        const lines = [
          `Autopsie de ${g.nameOf(body.playerId)} :`,
          `cause — ${WEAPON_CLASS_TEXT[weapon?.def.weaponClass ?? 'blunt']} ;`,
          `heure de la mort entre ${formatClock(lo)} et ${formatClock(hi)} ;`,
          `la victime s’est débattue : fibres de ${fiber} sous les ongles.`,
        ];
        const text = lines.join(' ');
        g.know(p.id, 'role', text, { important: true });
        return text;
      }
      case 'analyze_prints': {
        const o = g.actions.reachable(p, targetId ?? '');
        const prints = o.traces.filter((t) => t.kind === 'print');
        const visible = [...new Set(prints.filter((t) => !t.cleaned).map((t) => g.players.get(t.playerId)!.fingerprint))];
        const bloodTrace = o.traces.find((t) => t.kind === 'blood');
        const parts = [`Analyse — ${o.name} :`];
        parts.push(visible.length ? `empreintes ${visible.map((v) => `#${v}`).join(', ')} (de la plus ancienne à la plus récente).` : 'aucune empreinte exploitable.');
        if (prints.some((t) => t.cleaned)) parts.push('Des résidus montrent que l’objet a été essuyé : des empreintes plus anciennes ont été effacées.');
        if (bloodTrace) parts.push(`Sang ${bloodTrace.cleaned ? 'nettoyé mais détectable' : 'présent'} : il appartient à ${g.nameOf(bloodTrace.playerId)}.`);
        const text = parts.join(' ');
        g.know(p.id, 'role', text, { important: true });
        return text;
      }
      case 'take_prints': {
        const t = this.nearPlayer(p, targetId);
        const text = `Empreintes de ${t.name} : #${t.fingerprint}.`;
        g.know(p.id, 'role', text, { important: true });
        g.feed(t.id, 'whisper', `${p.name} a relevé vos empreintes.`);
        return text;
      }
      case 'inspect_room': {
        const room = p.roomId;
        const found: string[] = [];
        for (const ev of g.evidence) {
          if (ev.roomId !== room) continue;
          ev.discoveredBy.add(p.id);
          if (ev.kind === 'footprint' && !ev.cleaned) found.push(`empreinte de boue (motif ${ev.data.pattern}, pointure ${ev.data.size}) vers ${formatClock(ev.clock)}`);
          if (ev.kind === 'diluted_blood') found.push(`traces de sang dilué dans le siphon (${formatClock(ev.clock)} env.)`);
          if (ev.kind === 'smear') found.push(`une zone frottée récemment : quelqu’un a nettoyé ici (${formatClock(ev.clock)} env.)`);
          if (ev.kind === 'forced_lock' && !ev.cleaned) found.push('une serrure forcée');
          if (ev.kind === 'ashes') found.push('des cendres de papier');
          if (ev.kind === 'blood_pool' && !ev.cleaned) found.push('une flaque de sang');
        }
        const footCount = found.filter((f) => f.startsWith('empreinte')).length;
        const condensed = footCount > 4 ? [...found.filter((f) => !f.startsWith('empreinte')), ...this.summarizeFootprints(room)] : found;
        for (const f of allFurniture().filter((x) => x.roomId === room && x.hiding)) {
          const hidden = [...g.objects.values()].filter((o) => o.location.kind === 'hidden' && o.location.furnitureId === f.id);
          if (hidden.length) {
            hidden.forEach((o) => o.knownBy.add(p.id));
            condensed.push(`${f.name} a été dérangé·e : ${hidden.map((o) => o.name.toLowerCase()).join(', ')} y est caché`);
          }
        }
        const text = condensed.length ? `Inspection — ${roomName(room)} : ${condensed.join(' ; ')}.` : `Inspection — ${roomName(room)} : rien d’anormal.`;
        g.know(p.id, 'role', text, { important: condensed.length > 0 });
        g.markDirty(p.id);
        return text;
      }
      case 'examine_shoes': {
        const t = this.nearPlayer(p, targetId);
        const muddy = t.muddyUntil > g.now();
        const text = `Semelles de ${t.name} : motif ${t.shoe.pattern}, pointure ${t.shoe.size}${muddy ? ', encore couvertes de boue fraîche' : ''}.`;
        g.know(p.id, 'role', text, { important: true });
        return text;
      }
      case 'camera_logs': {
        const term = FURNITURE.find((f) => f.kind === 'terminal')!;
        if (p.roomId !== term.roomId || Math.hypot(term.x + 0.5 - p.pos.x, term.y + 0.5 - p.pos.y) > GAME_CONFIG.interactRange + 0.6)
          throw new UserError('Il faut être devant le moniteur du bureau.');
        const camRooms = new Set(ROOMS.filter((r) => r.camera).map((r) => r.id));
        const entries = g.truth
          .filter((e) => e.type === 'PLAYER_ENTERED_ROOM' && camRooms.has(e.roomId ?? '') && !e.data?.dark)
          .slice(-24)
          .map((e) => `${formatClock(e.clock)} ${g.nameOf(e.actorId!)} → ${roomName(e.roomId)}`);
        const gaps = g.truth.filter((e) => e.type === 'BLACKOUT_STARTED').map((e) => `coupure à ${formatClock(e.clock)}`);
        const text = `Caméras (hall & allée) : ${entries.length ? entries.join(' · ') : 'aucun passage enregistré'}${gaps.length ? ` — ${gaps.join(', ')} : enregistrement interrompu` : ''}.`;
        g.know(p.id, 'role', text, { important: true });
        return text;
      }
      case 'social_profile': {
        const lines = g.social.map((s) => {
          if (s.public) return `${formatClock(s.clock)} ${s.text}`;
          if (s.kind === 'betrayed') return `${formatClock(s.clock)} ${g.nameOf(s.actorId)} semble avoir rompu un engagement secret`;
          if (s.kind === 'pact') return `${formatClock(s.clock)} ${g.nameOf(s.actorId)} entretient un lien discret avec quelqu’un`;
          if (s.kind === 'vendetta') return `${formatClock(s.clock)} ${g.nameOf(s.actorId)} nourrit une rancune profonde`;
          return null;
        });
        const tension = [...g.players.values()]
          .map((pl) => ({ pl, n: g.social.filter((s) => (s.actorId === pl.id || s.targetId === pl.id) && ['declared_enemy', 'betrayed', 'vendetta', 'argued'].includes(s.kind)).length }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)
          .map((x) => `${x.pl.name} (${x.n})`);
        const text = `Profil social : ${lines.filter(Boolean).slice(-14).join(' · ') || 'soirée étrangement calme'}. Tensions : ${tension.join(', ') || 'aucune visible'}.`;
        g.know(p.id, 'role', text, { important: true });
        return text;
      }
    }
    throw new UserError('Outil inconnu.');
  }

  private summarizeFootprints(room: string): string[] {
    const by = new Map<string, number>();
    for (const ev of this.g.evidence) {
      if (ev.roomId !== room || ev.kind !== 'footprint' || ev.cleaned) continue;
      const k = `motif ${ev.data.pattern}, pointure ${ev.data.size}`;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    return [...by.entries()].map(([k, n]) => `${n} empreintes de boue (${k})`);
  }

  // ───────────── témoignages & tableau ─────────────

  testify(p: PlayerState, requestId: string, roomId: string, text: string): string {
    const g = this.g;
    if (!p.pendingTestimony || p.pendingTestimony.requestId !== requestId) throw new UserError('Aucune question en attente.');
    if (!roomById(roomId)) throw new UserError('Pièce inconnue.');
    const clean = String(text ?? '').trim().slice(0, 200);
    const boardText = `Témoignage de ${p.name} : « J’étais — ${roomName(roomId)}. ${clean} »`;
    const entry = g.addBoard('testimony', p.id, boardText, false);
    g.testimonies.push({ id: shortId('t_'), playerId: p.id, roomId, text: clean, clock: g.clock(), boardId: entry.id });
    g.log('TESTIMONY_GIVEN', { actorId: p.id, roomId, data: { truthful: g.roomAtClock(p.id, g.case?.refClock ?? g.clock()) === roomId }, text: `${p.name} affirme avoir été — ${roomName(roomId)}` });
    p.pendingTestimony = null;
    g.markAllDirty();
    return 'Témoignage enregistré.';
  }

  // ───────────── vote & épilogue ─────────────

  startVote() {
    const g = this.g;
    if (!g.case || g.case.type === 'quiet') return this.finish();
    if (this.voteEndsAt) return;
    this.voteEndsAt = g.now() + g.scaled(VOTE_DURATION_SEC) * 1000;
    if (g.phase !== 'RESOLUTION') g.setPhase('RESOLUTION');
    g.feedAll('announce', 'Le moment est venu. Désignez la personne que vous accusez.');
    g.markAllDirty();
  }

  candidates() {
    const g = this.g;
    return [...g.players.values()].filter((p) => p.id !== g.case?.victimId).map((p) => ({ id: p.id, name: p.name }));
  }

  vote(p: PlayerState, suspectId: string): string {
    const g = this.g;
    if (g.phase !== 'RESOLUTION' || !this.voteEndsAt) throw new UserError('Ce n’est pas le moment de voter.');
    if (!p.alive) throw new UserError('Les morts ne votent pas.');
    if (!this.candidates().some((c) => c.id === suspectId)) throw new UserError('Suspect invalide.');
    p.vote = suspectId;
    g.log('VOTE_CAST', { actorId: p.id, targetId: suspectId, text: `${p.name} accuse ${g.nameOf(suspectId)}` });
    g.relationships.social('accused', p.id, suspectId, `${p.name} accuse ${g.nameOf(suspectId)}`, true);
    g.markAllDirty();
    if (g.alivePlayers().every((x) => x.vote)) this.finish();
    return `Vous accusez ${g.nameOf(suspectId)}.`;
  }

  tick() {
    if (this.voteEndsAt && !this.epilogue && this.g.now() >= this.voteEndsAt) this.finish();
  }

  finish() {
    const g = this.g;
    if (this.epilogue) return;
    const c = g.case ?? { type: 'quiet' as const, openedAt: g.now() };
    const tally = new Map<string, number>();
    for (const p of g.alivePlayers()) if (p.vote) tally.set(p.vote, (tally.get(p.vote) ?? 0) + 1);
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const accusedId = sorted.length && (sorted.length === 1 || sorted[0][1] > sorted[1][1]) ? sorted[0][0] : undefined;
    const caught = !!accusedId && accusedId === c.culpritId;
    let headline: string;
    if (c.type === 'quiet') headline = 'Personne n’est mort cette nuit. Mais chacun avait un secret.';
    else if (!c.culpritId) headline = 'Le coupable n’a jamais été identifié… même par la villa.';
    else if (caught) headline = `${g.nameOf(c.culpritId)} est démasqué·e.`;
    else headline = `${g.nameOf(c.culpritId)} s’en sort. ${accusedId ? `${g.nameOf(accusedId)} paiera à sa place.` : 'Le groupe n’a pas su trancher.'}`;

    this.epilogue = {
      caseType: c.type,
      headline,
      culpritId: c.culpritId,
      culpritName: c.culpritId ? g.nameOf(c.culpritId) : undefined,
      accusedId,
      accusedName: accusedId ? g.nameOf(accusedId) : undefined,
      culpritCaught: caught,
      truthTimeline: g.truth
        .filter((e) => IMPORTANT_TRUTH.has(e.type) && e.text && !(e.type === 'OBJECT_PICKED_UP' && !this.isNotableObject(e.objectId)))
        .slice(-40)
        .map((e) => ({ at: e.clock, text: e.text! })),
      secrets: [...g.players.values()].map((p) => ({ playerId: p.id, name: p.name, secret: p.secretReveal })),
      votes: g.alivePlayers()
        .filter((p) => p.vote)
        .map((p) => ({ voterName: p.name, suspectName: g.nameOf(p.vote!), correct: p.vote === c.culpritId })),
      roles: [...g.players.values()].filter((p) => p.roleId).map((p) => ({ name: p.name, role: roleById(p.roleId!)!.name })),
    };
    g.log('GAME_ENDED', { data: { caught, accusedId }, text: headline });
    g.setPhase('EPILOGUE');
    g.ended = true;
    g.onFinished(this.epilogue);
    g.markAllDirty();
  }

  private isNotableObject(objectId?: string) {
    const o = objectId ? this.g.objects.get(objectId) : undefined;
    return !!o && (o.def.tags.includes('weapon') || o.def.tags.includes('valuable') || o.def.tags.includes('key') || o.def.tags.includes('document'));
  }
}
