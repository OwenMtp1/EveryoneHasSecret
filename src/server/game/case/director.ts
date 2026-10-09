/**
 * Directeur d'affaire : génère la VÉRITÉ d'une partie à partir d'un scénario, du nombre réel de
 * joueurs, de leurs identifiants et des personnages choisis. Tout est tiré une seule fois :
 * la vérité ne change plus de la partie.
 *
 * Chaînes d'enquête générées (chacune exige de recouper plusieurs pièces) :
 *  - corps → clé → boîte cadenassée → journal intime → code du téléphone & mot de passe de l'ordinateur
 *  - téléphone → messages signés d'un surnom → photo de groupe (surnoms au dos)
 *  - ordinateur → mobile + code du coffret → clé USB → (ordinateur) preuve décisive
 *  - appareil photo + carte mémoire → photos horodatées de la soirée (qui était où)
 *  - tickets de caisse → alibis confirmés ou contredits
 *  - autopsie / empreintes / semelles / sang dilué → arme, heure, fibres, traces du retour à la villa
 * Chaque innocent a un secret prouvé par un document (fausse piste à expliquer) ; certains se sont
 * absentés pendant la soirée (alibi à démontrer).
 */
import { castById } from '@shared/content/cast';
import { formatClock } from '@shared/config';
import { objectTypeDef } from '@shared/content/objects';
import { roomById } from '@shared/content/villa';
import { NICKNAMES, PLACES, SCENARIOS, scenarioById, a, e, type ScenarioCtx, type ScenarioDef, type Who } from './scenarios';
import type { CaseItemSpec, CaseTruth, Fact, PlaceId, PlayerTruth } from './model';
import { pick, shuffle } from '../../util';

export interface DirectorInput {
  players: { id: string; name: string; castId: string; feminine: boolean }[];
  victimCastId: string;
  rnd: () => number;
  scenarioId?: string;
}

const T = (h: number, m: number) => h * 60 + m;
const between = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

/** Première pièce existante parmi des candidates (la villa peut évoluer). */
function room(candidates: string[], fallback = 'living'): string {
  return candidates.find((r) => roomById(r)) ?? fallback;
}

export function buildCase(input: DirectorInput): CaseTruth {
  const { rnd } = input;
  if (input.players.length < 2) throw new Error('Une affaire exige au moins deux joueurs.');
  const scenario: ScenarioDef = (input.scenarioId && scenarioById(input.scenarioId)) || pick(SCENARIOS, rnd);
  const vc = castById(input.victimCastId)!;
  const who = (p: DirectorInput['players'][number]): Who => {
    const c = castById(p.castId);
    const [first, ...rest] = p.name.split(' ');
    return { id: p.id, first: c?.firstName ?? first, last: c?.lastName ?? rest.join(' '), full: p.name, castId: p.castId, feminine: p.feminine };
  };
  const all = input.players.map(who);
  const v: Who = { id: 'victim', first: vc.firstName, last: vc.lastName, full: `${vc.firstName} ${vc.lastName}`, castId: vc.id, feminine: vc.gender === 'feminine' };
  const order = shuffle(all, rnd);
  const m = order[0];
  const innocents = order.slice(1);
  let seedN = Math.floor(rnd() * 1e6);
  const ctx: ScenarioCtx = { v, m, all, innocents, rnd, fmt: formatClock, seed: () => ++seedN };

  // ── protecteurs : à partir de 6 joueurs, un innocent a intérêt à protéger le meurtrier ──
  const protectorCount = all.length >= 8 ? 2 : all.length >= 6 ? 1 : 0;
  const protectors = innocents.slice(0, protectorCount);

  // ── la soirée : groupes répartis entre deux ou trois lieux ──
  const social: PlaceId[] = all.length <= 4 ? ['phare', 'boussole'] : ['phare', 'boussole', 'plage'];
  const placeOf = new Map<string, PlaceId>();
  // le meurtrier n'est jamais seul dans son groupe : quelqu'un a remarqué son absence
  const mPlace = pick(social, rnd);
  placeOf.set(m.id, mPlace);
  const companion = innocents.find((p) => !protectors.includes(p)) ?? innocents[0];
  placeOf.set(companion.id, mPlace);
  shuffle(innocents.filter((p) => p !== companion), rnd).forEach((p, i) => placeOf.set(p.id, social[(social.indexOf(mPlace) + 1 + i) % social.length]));

  const leaveAt = between(rnd, T(21, 8), T(21, 12));
  const stationAt = leaveAt + between(rnd, 3, 5);
  const murderAt = between(rnd, T(21, 25), T(21, 36));
  const backAt = between(rnd, T(21, 47), T(21, 52));

  // ── secrets des innocents (rôles narratifs d'abord) ──
  const pool = shuffle(scenario.innocentSecrets.filter((s) => !s.slot), rnd);
  const slotted = scenario.innocentSecrets.filter((s) => s.slot);
  const secretOf = new Map<string, (typeof scenario.innocentSecrets)[number]>();
  const freeInnocents = shuffle(innocents, rnd);
  for (const s of slotted) {
    const p = freeInnocents.shift();
    if (p) secretOf.set(p.id, s);
  }
  for (const p of freeInnocents) secretOf.set(p.id, pool.length ? pool.shift()! : scenario.innocentSecrets[0]);
  const secretHolders = new Map<string, string>([...secretOf].map(([id, s]) => [id, s.id]));

  // ── absences : la moitié des innocents s'est éclipsée (fausses pistes à démontrer) ──
  const absent = new Map<string, { from: number; to: number; place: PlaceId; proof: 'photo' | 'receipt' }>();
  for (const p of shuffle(innocents, rnd).slice(0, Math.max(1, Math.floor(innocents.length / 2)))) {
    const from = between(rnd, T(21, 14), T(21, 22));
    absent.set(p.id, { from, to: from + between(rnd, 15, 24), place: pick(['plage', 'epicerie', 'belvedere'] as PlaceId[], rnd), proof: rnd() < 0.5 ? 'photo' : 'receipt' });
  }

  const nick = new Map<string, string>(shuffle(NICKNAMES, rnd).slice(0, all.length).map((n, i) => [all[i].id, n]));
  const truthOf = new Map<string, PlayerTruth>();
  const items: CaseItemSpec[] = [];
  const add = (it: CaseItemSpec) => (items.push(it), it);
  const placeName = (id: PlaceId) => PLACES[id].name;

  // ── souvenirs de la soirée ──
  for (const p of all) {
    const pl = placeOf.get(p.id)!;
    const group = all.filter((o) => o.id !== p.id && placeOf.get(o.id) === pl);
    const mem: string[] = [];
    mem.push(`20h45 — vous quittez la villa avec les autres. ${v.first} reste seul${a(v)}, « fatigué${a(v)} ».`);
    mem.push(group.length ? `21h00 — vous êtes à ${placeName(pl)} avec ${group.map((o) => o.full).join(', ')}.` : `21h00 — vous êtes à ${placeName(pl)}, seul${a(p)}.`);
    for (const o of group) {
      if (o.id === m.id && p.id !== m.id) mem.push(`Vers ${formatClock(leaveAt)}, ${o.first} est sorti${a(o)} en disant « je vais chercher des cigarettes ». ${e(o, 'Il', 'Elle')} n’est revenu${a(o)} que vers ${formatClock(backAt)}, les chaussures pleines de boue.`);
      const ab = absent.get(o.id);
      if (ab) mem.push(`Vers ${formatClock(ab.from)}, ${o.first} s’est éclipsé${a(o)} « prendre l’air » ; ${e(o, 'il', 'elle')} est revenu${a(o)} vers ${formatClock(ab.to)}.`);
    }
    mem.push(`22h00 — tout le monde rentre à la villa. Vous découvrez ${v.first}.`);
    const s = secretOf.get(p.id);
    const isM = p.id === m.id;
    const ms = scenario.murdererSecret(ctx);
    truthOf.set(p.id, {
      playerId: p.id,
      camp: isM ? 'murderer' : protectors.includes(p) ? 'protector' : 'innocent',
      place: pl,
      absence: isM
        ? { from: leaveAt, to: backAt, whereabouts: 'la villa', to_villa: true }
        : absent.has(p.id)
          ? { from: absent.get(p.id)!.from, to: absent.get(p.id)!.to, whereabouts: placeName(absent.get(p.id)!.place), to_villa: false }
          : undefined,
      secret: isM ? { text: ms.text, reveal: ms.reveal, givesMotive: true } : { text: s!.text(ctx, p), reveal: s!.reveal(ctx, p), givesMotive: s!.givesMotive },
      memories: mem,
      nickname: nick.get(p.id)!,
    });
  }

  // ── lieux : pièce du crime, chambre de la victime, cachette de l'arme ──
  const murderRoom = room(shuffle(scenario.murderRooms, rnd), 'office');
  const victimRoom = room(['suite', 'bedroom2', 'guestroom']);
  const weaponType = pick(scenario.weapons, rnd);

  // ── 1. le corps : clé de la boîte, téléphone ──
  const pin = String(between(rnd, 1000, 9999));
  const password = `${pick(['luciole', 'albatros', 'saphir', 'marelle', 'tilleul', 'boussole'], rnd)}${between(rnd, 10, 99)}`;
  const boxCode = String(between(rnd, 1000, 9999));
  const victimMessages = scenario.murdererMessages(ctx).map((x) => `${formatClock(x.at)} — ${x.from === 'm' ? `« ${nick.get(m.id)} »` : 'Moi'} : ${x.text}`);
  const herrings = innocents
    .map((p) => ({ p, msg: secretOf.get(p.id)?.phoneMessage?.(ctx, p) }))
    .filter((x) => x.msg)
    .map((x, i) => `${formatClock(T(19, 10) + i * 17)} — « ${nick.get(x.p.id)} » : ${x.msg}`);
  add({
    ref: 'victim_phone',
    type: 'phone',
    name: `Téléphone de ${v.first}`,
    placement: { kind: 'body' },
    lock: { kind: 'code', code: pin, hint: 'Code à quatre chiffres' },
    content: {
      title: `Téléphone de ${v.full} — messages`,
      lines: [...herrings, ...victimMessages, `${formatClock(murderAt - 2)} — Appel entrant de « ${nick.get(m.id)} » (non décroché).`],
      facts: [{ kind: 'motive', playerId: m.id }],
      weight: 'key',
    },
  });
  add({ ref: 'box_key', type: 'key', name: 'Petite clé dorée', description: 'Une petite clé dorée, retrouvée dans la poche de la victime.', placement: { kind: 'body' }, opens: 'diary_box' });

  // ── 2. boîte cadenassée → journal intime (codes) ──
  add({ ref: 'diary_box', type: 'locked_box', name: `Boîte cadenassée de ${v.first}`, placement: { kind: 'hidden', roomId: victimRoom }, lock: { kind: 'key', keyId: 'box_key' } });
  add({
    ref: 'diary',
    type: 'diary',
    name: `Journal de ${v.first}`,
    placement: { kind: 'inside', containerRef: 'diary_box' },
    content: {
      title: `Journal intime de ${v.full}`,
      lines: [
        `« J’oublie toujours le code de mon téléphone, alors je l’écris ici : ${pin}. »`,
        `« L’ordinateur, toujours le même mot de passe : ${password}. »`,
        `« Ce week-end, je leur dis tout. Ils ont tous menti à un moment, moi aussi. Mais l’un d’eux a fait bien pire. »`,
        ...innocents.slice(0, 3).map((p) => `« ${p.first} me cache quelque chose. Je l’ai vu${a(p)} pâlir quand j’en ai parlé. »`),
      ],
      facts: [{ kind: 'code', targetId: 'victim_phone' }, { kind: 'code', targetId: 'laptop' }],
      weight: 'key',
    },
  });

  // ── 3. photo de groupe : les surnoms ──
  add({
    ref: 'group_photo',
    type: 'photo',
    name: 'Photo de groupe encadrée',
    placement: { kind: 'room', roomId: room(['living', 'hall']) },
    content: {
      title: 'Photo de groupe — l’été d’avant',
      lines: ['Tout le groupe, bras dessus bras dessous, devant la villa.', `Au dos, de l’écriture de ${v.first} : ${all.map((p) => `« ${nick.get(p.id)} » = ${p.first}`).join(', ')}.`],
      photos: [{ castIds: [v.castId, ...all.map((p) => p.castId)], scene: 'group', caption: 'L’été d’avant', seed: ctx.seed() }],
      facts: [],
      weight: 'social',
    },
  });

  // ── 4. ordinateur → coffret → clé USB (mobile) ──
  const secretFacts: Fact[] = innocents.map((p) => ({ kind: 'secret', playerId: p.id }));
  add({
    ref: 'laptop',
    type: 'laptop',
    name: `Ordinateur de ${v.first}`,
    placement: { kind: 'room', roomId: room(['office', 'library']) },
    lock: { kind: 'code', code: password, hint: 'Mot de passe' },
    content: {
      title: `Ordinateur de ${v.full}`,
      lines: [
        ...scenario.laptopLines(ctx, secretHolders),
        `Fichier « à ne pas oublier.txt » : « La clé USB est dans le coffret à code. Code : ${boxCode}. »`,
        ...innocents.map((p) => `Note sur ${p.first} : ${truthOf.get(p.id)!.secret.reveal.replace(/^./, (c) => c.toUpperCase())} — « à lui faire avouer avant lundi ».`),
      ],
      facts: [...secretFacts, { kind: 'code', targetId: 'usb_box' }],
      weight: 'key',
    },
  });
  add({ ref: 'usb_box', type: 'code_box', name: 'Coffret à code', placement: { kind: 'hidden', roomId: room(shuffle(['attic', 'cellar', 'garage', 'studio', 'library', 'office'], rnd)) }, lock: { kind: 'code', code: boxCode, hint: 'Molette à quatre chiffres' } });
  const dp = scenario.decisiveProof(ctx);
  add({ ref: 'usb', type: 'usb_key', name: 'Clé USB', placement: { kind: 'inside', containerRef: 'usb_box' }, content: { ...dp, facts: [{ kind: 'motive', playerId: m.id }], weight: 'key' } });

  // ── 5. appareil photo + carte : la soirée en images ──
  const shooter = companion;
  const presentAtM = all.filter((p) => placeOf.get(p.id) === mPlace && p.id !== m.id);
  const photoAt = between(rnd, Math.max(murderAt - 6, leaveAt + 8), murderAt + 4);
  const cardLines = [`${formatClock(photoAt)} — ${PLACES[mPlace].name} : ${presentAtM.map((p) => p.first).join(', ')} trinquent. La chaise de ${m.first} est vide.`];
  const cardPhotos = [{ castIds: presentAtM.map((p) => p.castId), scene: PLACES[mPlace].photoScene, caption: `${formatClock(photoAt)}`, seed: ctx.seed() }];
  const cardFacts: Fact[] = [...presentAtM.map((p) => ({ kind: 'place' as const, playerId: p.id, place: mPlace, at: photoAt })), { kind: 'absent', playerId: m.id, place: mPlace, at: photoAt }];
  add({ ref: 'camera', type: 'camera', name: `Appareil photo de ${shooter.first}`, placement: { kind: 'room', roomId: room(['living', 'guestroom', 'hall']) }, insertedRef: 'card' });
  add({
    ref: 'card',
    type: 'memory_card',
    name: 'Carte mémoire',
    placement: { kind: 'inside', containerRef: 'camera' },
    content: { title: `Carte mémoire de l’appareil de ${shooter.first}`, lines: cardLines, photos: cardPhotos as never, facts: cardFacts, weight: 'key' },
  });

  // ── 6. tickets : le meurtrier sur la route de la villa ──
  add({
    ref: 'm_receipt',
    type: 'receipt',
    name: 'Ticket de caisse',
    placement: { kind: 'hidden', roomId: room(['hall']), furnitureHint: ['coat', 'manteau', 'porte-manteau', 'console'] },
    content: {
      title: 'Ticket — Station-service du col',
      lines: [`${formatClock(stationAt)} — 1 paquet de mouchoirs, 1 bouteille d’eau. Payé par carte — titulaire : ${m.first[0]}. ${m.last.toUpperCase()}.`, 'La station est à trois minutes de la villa, dans la direction opposée au port.'],
      facts: [{ kind: 'place', playerId: m.id, place: 'station', at: stationAt }],
      weight: 'key',
    },
  });
  // alibis des absents (photo ou ticket), et des autres groupes
  for (const [id, ab] of absent) {
    const p = all.find((x) => x.id === id)!;
    const at = ab.from + 5;
    add({
      ref: `alibi_${id}`,
      type: ab.proof === 'photo' ? 'photo' : 'receipt',
      name: ab.proof === 'photo' ? 'Selfie imprimé' : 'Ticket froissé',
      placement: { kind: 'hidden', roomId: room(['guestroom', 'bedroom1', 'bedroom2', 'hall', 'living']) },
      content: {
        title: ab.proof === 'photo' ? `Selfie de ${p.first}` : `Ticket — ${PLACES[ab.place].name}`,
        lines: ab.proof === 'photo' ? [`${p.first}, seul${a(p)}, ${PLACES[ab.place].name}, horodaté ${formatClock(at)}.`] : [`${formatClock(at)} — achat réglé par carte, titulaire : ${p.first[0]}. ${p.last.toUpperCase()}.`],
        photos: ab.proof === 'photo' ? [{ castIds: [p.castId], scene: PLACES[ab.place].photoScene, caption: formatClock(at), seed: ctx.seed() } as never] : undefined,
        facts: [{ kind: 'place', playerId: id, place: ab.place, at }],
        weight: 'herring',
      },
    });
  }
  const otherPlaces = [...new Set(innocents.map((p) => placeOf.get(p.id)!))].filter((pl) => pl !== mPlace);
  for (const pl of otherPlaces) {
    const group = all.filter((p) => placeOf.get(p.id) === pl);
    const at = between(rnd, T(21, 20), T(21, 40));
    add({
      ref: `bill_${pl}`,
      type: 'receipt',
      name: 'Addition',
      placement: { kind: 'hidden', roomId: room(['kitchen', 'living', 'hall']) },
      content: {
        title: `Addition — ${PLACES[pl].name}`,
        lines: [`${formatClock(at)} — ${group.length} couvert${group.length > 1 ? 's' : ''}. Signé : ${group.map((p) => p.first).join(', ')}.`],
        facts: group.map((p) => ({ kind: 'place' as const, playerId: p.id, place: pl, at })),
        weight: 'support',
      },
    });
  }

  // ── 7. l'arme, cachée par le meurtrier (empreinte partielle mal essuyée) ──
  add({
    ref: 'weapon',
    type: weaponType,
    name: '',
    placement: { kind: 'hidden', roomId: room(shuffle(['garden', 'garage', 'cellar', 'laundry', 'basement', 'kitchen'], rnd)) },
    traces: [
      { kind: 'blood', playerId: 'victim', cleaned: true },
      { kind: 'print', playerId: m.id, cleaned: true },
    ],
    content: { title: 'Arme du crime', lines: [], facts: [{ kind: 'weapon' }], weight: 'key' },
  });

  // ── 8. histoire passée + secrets prouvés ──
  for (const b of scenario.backstoryItems(ctx, secretHolders)) add({ ref: `story_${items.length}`, type: b.type, name: b.name, placement: { kind: 'hidden', roomId: room(shuffle(b.room, rnd)) }, content: { ...b.content, weight: 'support' } });
  for (const p of innocents) {
    const pr = secretOf.get(p.id)!.proof(ctx, p);
    add({
      ref: `secret_${p.id}`,
      type: pr.type,
      name: pr.name,
      placement: protectors.includes(p) ? { kind: 'player', playerId: m.id } : { kind: 'hidden', roomId: room(shuffle(['office', 'library', 'guestroom', 'bedroom1', 'bedroom2', 'studio', 'attic'], rnd)) },
      content: { ...pr.content, facts: [{ kind: 'secret', playerId: p.id }], weight: 'herring' },
    });
  }

  // ── chronologie vraie ──
  const timeline = [
    ...scenario.pastTimeline(ctx).map((text) => ({ at: -1, text })),
    { at: T(20, 45), text: `Le groupe part en ville. ${v.full} reste seul${a(v)} à la villa.` },
    ...scenario.murdererMessages(ctx).map((x) => ({ at: x.at, text: `${x.from === 'm' ? `${m.first} → ${v.first}` : `${v.first} → ${m.first}`} : « ${x.text} »` })),
    { at: leaveAt, text: `${m.full} quitte ${PLACES[mPlace].name} (« cigarettes »).` },
    { at: stationAt, text: `${m.full} s’arrête à la station-service du col.` },
    ...[...absent].map(([id, ab]) => ({ at: ab.from, text: `${all.find((x) => x.id === id)!.full} s’éclipse vers ${PLACES[ab.place].name} — sans rapport avec le crime.` })),
    { at: murderAt, text: `${m.full} tue ${v.full} — ${roomById(murderRoom)?.name ?? murderRoom}, avec : ${objectTypeDef(weaponType)?.name.toLowerCase() ?? weaponType}.` },
    { at: murderAt + 4, text: `${m.full} essuie l’arme, la cache, se lave les mains et repart par le jardin.` },
    { at: backAt, text: `${m.full} rejoint ${PLACES[mPlace].name}, les chaussures boueuses.` },
    { at: T(22, 0), text: 'Le groupe rentre et découvre le corps.' },
  ].sort((x, y) => x.at - y.at);

  return {
    scenarioId: scenario.id,
    scenarioTitle: `${scenario.title} — ${scenario.subtitle}`,
    publicBrief: scenario.publicBrief(ctx),
    victim: { castId: v.castId, name: v.full, feminine: v.feminine, roomId: murderRoom, bio: scenario.victimBio(ctx) },
    murdererId: m.id,
    protectorIds: protectors.map((p) => p.id),
    murderAt,
    weaponRef: 'weapon',
    weaponClass: objectTypeDef(weaponType)?.weaponClass ?? 'blunt',
    motive: scenario.motive(ctx),
    timeline,
    players: truthOf,
    items,
    places: [...new Set([...social, 'station' as PlaceId, ...[...absent.values()].map((x) => x.place)])],
  };
}

/** Conseils privés du meurtrier (dossier) : sa version et les preuves qui peuvent le trahir. */
export function murdererBriefing(c: CaseTruth, murdererId: string, nameOf: (id: string) => string): string[] {
  const t = c.players.get(murdererId)!;
  const prot = c.protectorIds.map(nameOf);
  return [
    `Votre version : vous êtes resté·e à ${PLACES[t.place].name} toute la soirée (sauf une courte sortie « cigarettes »).`,
    'Ce qui peut vous trahir :',
    '• votre ticket de la station-service du col, oublié dans votre veste (hall) ;',
    '• les messages que vous avez échangés avec la victime, dans son téléphone ;',
    '• la photo prise au restaurant/bar pendant votre absence, sur la carte mémoire d’un appareil photo ;',
    '• l’arme, que vous avez essuyée à la hâte et cachée hors de la pièce du crime ;',
    '• vos empreintes de boue entre le jardin et la pièce du crime, et le sang dilué dans un évier ;',
    '• la clé USB de la victime, quelque part dans la villa, qui établit votre mobile.',
    prot.length ? `Alliés objectifs : ${prot.join(', ')} — vous détenez la preuve de leur secret. Ils ont intérêt à vous couvrir.` : 'Personne ne vous doit rien : à vous de vous faire des alliés.',
    'Vous pouvez éliminer un joueur qui s’est officiellement opposé à vous (accusation formelle, vote « coupable » ou dénonciation), s’il est seul avec vous et sans témoin.',
  ];
}

export { PLACES };
