/**
 * Directeur de scénario : pose les « graines » d'une partie (objets, secrets, identités physiques).
 * Il ne décide jamais de ce qui va se passer — il crée seulement les conditions initiales.
 * Tout est tiré aléatoirement : deux parties ne commencent jamais de la même façon.
 */
import { OBJECT_TYPES, objectTypeDef } from '@shared/content/objects';
import { SECRETS, type SecretDef } from '@shared/content/secrets';
import { SCENARIO_FAMILIES, SHOE_PATTERNS, SHOE_SIZES } from '@shared/content/scenarios';
import { randomFreeTile, roomName } from '@shared/content/villa';
import type { GameInstance } from './GameInstance';
import type { GameObject, PlayerState } from './state';
import { pick, shortId, shuffle } from '../util';

const PHONE_MESSAGES = [
  'Message de « V. » : « Ne dis rien à {p} ce soir. Je m’en occupe. »',
  'Message de « Inconnu » : « Tu as l’argent ? {p} commence à poser des questions. »',
  'Message de « Maman » : « Rentre avant minuit. Et méfie-toi de {p}. »',
  'Message de « V. » : « La cave. 00h30. Viens seul·e. »',
  'Brouillon non envoyé : « {p}, je sais ce que tu as fait l’été dernier. »',
];

export class ScenarioDirector {
  readonly seeds: string[] = [];

  constructor(private g: GameInstance) {}

  setup() {
    const g = this.g;
    const players = [...g.players.values()];
    // Identités physiques uniques (empreintes, semelles)
    const patterns = shuffle(SHOE_PATTERNS, g.rnd);
    const usedPrints = new Set<string>();
    players.forEach((p, i) => {
      p.shoe = { pattern: patterns[i % patterns.length], size: pick(SHOE_SIZES, g.rnd) };
      let code = '';
      do code = `${String.fromCharCode(65 + Math.floor(g.rnd() * 26))}-${10 + Math.floor(g.rnd() * 89)}`;
      while (usedPrints.has(code));
      usedPrints.add(code);
      p.fingerprint = code;
    });

    // Graines de scénario
    for (const fam of SCENARIO_FAMILIES) if (fam.implemented && g.rnd() < fam.seedChance) this.seeds.push(fam.id);

    // Objets du monde
    for (const def of OBJECT_TYPES) {
      if (def.eventOnly || def.spawnRooms.length === 0) continue;
      if (g.rnd() > def.spawnChance) continue;
      const room = pick(def.spawnRooms, g.rnd);
      this.spawnObject(def.type, room);
    }

    this.assignSecrets(players);
  }

  private assignSecrets(players: PlayerState[]) {
    const g = this.g;
    let pool: SecretDef[] = shuffle(SECRETS, g.rnd);
    const forced: SecretDef[] = [];
    for (const fam of SCENARIO_FAMILIES) {
      if (!this.seeds.includes(fam.id) || !fam.seedSecrets) continue;
      for (const id of fam.seedSecrets) {
        const s = pool.find((x) => x.id === id);
        if (s) forced.push(s);
      }
    }
    // Les secrets « graines » d'abord, sans dépasser le nombre de joueurs
    const chosen = [...forced, ...pool.filter((s) => !forced.includes(s))].slice(0, players.length);
    const shuffledPlayers = shuffle(players, g.rnd);
    // Un secret à cible nécessite au moins 2 joueurs
    pool = chosen;
    shuffledPlayers.forEach((p, i) => {
      let s = pool[i];
      if (s.needsTarget && players.length < 2) s = SECRETS.find((x) => !x.needsTarget)!;
      let target: PlayerState | undefined;
      if (s.needsTarget) target = pick(players.filter((o) => o.id !== p.id), g.rnd);
      const fill = (t: string) => t.replaceAll('{target}', target?.name ?? '').replaceAll('{self}', p.name);
      p.secretId = s.id;
      p.secretText = fill(s.text);
      p.secretReveal = fill(s.reveal);
      p.secretTargetId = target?.id;
      g.know(p.id, 'secret', `Votre secret : ${p.secretText}`, { important: true });
      if (s.motiveAgainstTarget && target) p.motiveAgainst.add(target.id);
      for (const type of s.grants ?? []) {
        const o = this.spawnObject(type, null, p.id);
        if (type === 'photo' && target) {
          o.props.aboutPlayerId = target.id;
          o.props.ownerSecretOf = p.id;
        }
        g.know(p.id, 'self', `Vous avez apporté : ${o.name}.`);
      }
      if (s.conspiracy && target) {
        // Pacte ancien et caché : il existe dès le départ, connu des deux seuls intéressés
        g.relationships.createHidden('PACT', p.id, target.id, 'Pacte ancien (secret de départ)');
        g.know(target.id, 'secret', `${p.name} et vous êtes liés par un pacte ancien. Personne ne doit le savoir.`, { important: true });
      }
    });
  }

  spawnObject(type: string, roomId: string | null, ownerId?: string): GameObject {
    const g = this.g;
    const def = objectTypeDef(type);
    if (!def) throw new Error(`Type d'objet inconnu: ${type}`);
    const id = shortId('o_');
    const obj: GameObject = {
      id,
      type,
      def,
      name: def.name,
      location: ownerId
        ? { kind: 'player', playerId: ownerId }
        : { kind: 'floor', roomId: roomId!, pos: this.freeSpot(roomId!) },
      spawnRoomId: roomId,
      history: [],
      traces: [],
      lit: false,
      knownBy: new Set(),
      props: {},
    };
    if (type === 'phone') {
      const others = [...g.players.values()];
      obj.props.message = pick(PHONE_MESSAGES, g.rnd).replaceAll('{p}', others.length ? pick(others, g.rnd).name : 'quelqu’un');
    }
    g.objects.set(id, obj);
    if (ownerId) {
      g.players.get(ownerId)!.inventory.push(id);
      obj.traces.push({ kind: 'print', playerId: ownerId, clock: g.clock(), cleaned: false });
      obj.history.push({ clock: g.clock(), text: `Apporté par ${g.nameOf(ownerId)}` });
    } else {
      obj.history.push({ clock: g.clock(), text: `Présent — ${roomName(roomId!)}` });
    }
    g.log('OBJECT_SPAWNED', { objectId: id, roomId: roomId ?? undefined, actorId: ownerId, text: `${def.name} ${ownerId ? `apporté par ${g.nameOf(ownerId)}` : `placé — ${roomName(roomId!)}`}` });
    return obj;
  }

  /** Case libre, sans autre objet déjà posé dessus (léger décalage pour le naturel). */
  private freeSpot(roomId: string) {
    const g = this.g;
    for (let i = 0; i < 30; i++) {
      const t = randomFreeTile(g.grid, roomId, g.rnd);
      const taken = [...g.objects.values()].some((o) => o.location.kind === 'floor' && Math.floor(o.location.pos.x) === Math.floor(t.x) && Math.floor(o.location.pos.y) === Math.floor(t.y));
      if (!taken) return { x: t.x + (g.rnd() - 0.5) * 0.3, y: t.y + (g.rnd() - 0.5) * 0.3 };
    }
    return randomFreeTile(g.grid, roomId, g.rnd);
  }

  /** Lettre anonyme révélant le secret d'un joueur vivant au hasard. */
  spawnSecretLetter(roomId: string) {
    const g = this.g;
    const candidates = g.alivePlayers();
    if (!candidates.length) return;
    const victim = pick(candidates, g.rnd);
    const o = this.spawnObject('letter', roomId);
    o.props.secretOf = victim.id;
    o.name = 'Lettre anonyme';
  }
}
