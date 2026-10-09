/**
 * Les trois scénarios (SERVEUR UNIQUEMENT : rien de ceci n'est envoyé au navigateur).
 *
 * Un scénario fournit l'histoire passée, le mobile du meurtrier, les secrets personnels
 * possibles des innocents et les documents qui permettent de reconstituer la vérité.
 * Le directeur (director.ts) l'applique au nombre réel de joueurs, à leurs identifiants et aux
 * personnages choisis : aucun nombre de joueurs n'est codé en dur.
 */
import type { EvidenceContent, PhotoSpec } from './model';

export interface Who {
  id: string;
  first: string;
  last: string;
  full: string;
  castId: string;
  feminine: boolean;
}

export interface ScenarioCtx {
  v: Who; // victime (personnage non joueur du cercle d'amis)
  m: Who; // meurtrier
  all: Who[];
  innocents: Who[];
  rnd: () => number;
  fmt: (min: number) => string;
  seed: () => number;
}

/** accord : e(p, 'il', 'elle') ; a(p) → '' | 'e' */
export const e = (p: { feminine: boolean }, masc: string, fem: string) => (p.feminine ? fem : masc);
export const a = (p: { feminine: boolean }) => (p.feminine ? 'e' : '');

/** Secret personnel d'un innocent, et la preuve matérielle qui le révèle. */
export interface InnocentSecret {
  id: string;
  /** rôle narratif obligatoire (attribué en priorité) */
  slot?: 'cheated' | 'kisser';
  text: (c: ScenarioCtx, p: Who) => string;
  reveal: (c: ScenarioCtx, p: Who) => string;
  givesMotive: boolean;
  /** document qui prouve ce secret (placé dans la villa) */
  proof: (c: ScenarioCtx, p: Who) => { type: string; name: string; content: Omit<EvidenceContent, 'facts' | 'weight'> };
  /** message reçu par la victime de la part de ce joueur (fausse piste dans son téléphone) */
  phoneMessage?: (c: ScenarioCtx, p: Who) => string;
}

export interface ScenarioDef {
  id: 'pacte' | 'mensonges' | 'testament';
  title: string;
  subtitle: string;
  murderRooms: string[];
  weapons: string[];
  victimBio: (c: ScenarioCtx) => string;
  publicBrief: (c: ScenarioCtx) => string;
  murdererSecret: (c: ScenarioCtx) => { text: string; reveal: string };
  motive: (c: ScenarioCtx) => string;
  /** messages échangés entre le meurtrier et la victime juste avant le crime */
  murdererMessages: (c: ScenarioCtx) => { from: 'm' | 'v'; at: number; text: string }[];
  innocentSecrets: InnocentSecret[];
  /** documents de l'histoire passée (impliquent plusieurs personnes : à recouper) */
  backstoryItems: (c: ScenarioCtx, secretHolders: Map<string, string>) => { type: string; name: string; content: Omit<EvidenceContent, 'weight'>; room: string[] }[];
  /** contenu de l'ordinateur de la victime (sans le code du coffret, ajouté par le directeur) */
  laptopLines: (c: ScenarioCtx, secretHolders: Map<string, string>) => string[];
  /** pièce maîtresse (clé USB) : établit le mobile du meurtrier */
  decisiveProof: (c: ScenarioCtx) => { title: string; lines: string[]; photos?: PhotoSpec[] };
  /** levier du meurtrier sur un protecteur */
  leverage: (c: ScenarioCtx, protector: Who) => string;
  /** chronologie passée (épilogue) */
  pastTimeline: (c: ScenarioCtx) => string[];
}

// ───────────────────────────────────────── A — Le Pacte ─────────────────────────────────────────

const pacte: ScenarioDef = {
  id: 'pacte',
  title: 'Le Pacte',
  subtitle: 'Le Prix du Silence',
  murderRooms: ['library', 'office'],
  weapons: ['statuette', 'candlestick', 'fire_poker'],
  victimBio: ({ v }) =>
    `${v.full}, l’ami${a(v)} de toujours, celui ou celle qui organisait chaque été les retrouvailles du groupe. Depuis l’accident de Théo, ${e(v, 'il', 'elle')} ne dormait plus.`,
  publicBrief: ({ v }) =>
    `Il y a trois ans, la nuit du 14 juillet, Théo Marchal — l’un des vôtres — est tombé de la falaise de la Pointe de l’Aiguille après une fête. ` +
    `Douze mètres. Il a survécu, mais ne remarchera jamais. L’enquête a conclu à un accident : il aurait glissé seul. ` +
    `Ce week-end, ${v.full} vous avait tous réunis à la villa « pour parler de Théo ». À 20h45, vous êtes sortis en ville ; ${v.first} est resté${a(v)} seul${a(v)}. ` +
    `À votre retour, vers 22h, ${e(v, 'il', 'elle')} gisait sans vie. La route est coupée par l’orage : la gendarmerie n’arrivera qu’au matin. L’un de vous a tué ${v.first}.`,
  murdererSecret: ({ v }) => ({
    text:
      `C’est vous. Il y a trois ans, au bord de la falaise, vous vous êtes disputé·e avec Théo : il menaçait de révéler que vous aviez falsifié les comptes de la fête de fin d’études. ` +
      `Vous l’avez poussé. Vous avez ensuite convaincu les autres de raconter que tout le monde était à la voiture. ` +
      `${v.first} avait retrouvé une photo de cette nuit-là et comptait tout donner à la gendarmerie lundi. Ce soir, vous êtes revenu·e à la villa.`,
    reveal: 'avait poussé Théo du haut de la falaise il y a trois ans, puis organisé le silence du groupe',
  }),
  motive: ({ v, m }) => `${m.full} avait poussé Théo Marchal du haut de la falaise trois ans plus tôt. ${v.full} détenait une photo qui le prouvait et voulait la remettre à la gendarmerie lundi.`,
  murdererMessages: ({ m, v }) => [
    { from: 'm', at: 21 * 60 + 3, text: 'Ne fais pas ça lundi. Pense à ce que ça va détruire. Pour nous tous.' },
    { from: 'v', at: 21 * 60 + 5, text: `Ma décision est prise. Théo mérite la vérité.` },
    { from: 'm', at: 21 * 60 + 6, text: `J’arrive. On en parle face à face. N’appelle personne.` },
    { from: 'v', at: 21 * 60 + 7, text: `Je suis seul${a(v)} à la villa. Viens si tu veux, ça ne changera rien.` },
    { from: 'm', at: 0, text: '' },
  ].filter((x) => x.text) as { from: 'm' | 'v'; at: number; text: string }[],
  innocentSecrets: [
    {
      id: 'false_statement',
      text: () => `Il y a trois ans, vous avez déclaré aux gendarmes que tout le monde était à la voiture à 23h30. C’était faux : vous n’avez rien vu, mais vous avez signé la version commune.`,
      reveal: () => 'avait menti aux gendarmes sur l’heure et l’endroit où se trouvait le groupe la nuit de la chute de Théo',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'report', name: 'Procès-verbal d’audition', content: { title: `Procès-verbal d’audition de ${p.full} (15 juillet, il y a 3 ans)`, lines: [`« À 23h30, nous étions tous à la voiture. Personne n’était au bord de la falaise. » — signé ${p.full}.`, `Annotation au crayon de ${'la victime'} : « Faux. Théo est tombé à 23h43. Qui était à la voiture ? »`] } }),
      phoneMessage: () => 'Tu ne vas pas ressortir ma déposition, hein ? On était d’accord.',
    },
    {
      id: 'phone_sea',
      text: () => `Cette nuit-là, vous avez ramassé le téléphone de Théo au bord de la falaise et vous l’avez jeté à la mer, paniqué·e. Personne ne le sait.`,
      reveal: () => 'avait fait disparaître le téléphone de Théo la nuit de sa chute',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'letter', name: 'Lettre de la sœur de Théo', content: { title: 'Lettre de Clara Marchal', lines: [`« Le téléphone de Théo n’a jamais été retrouvé. ${p.first} était le seul à être redescendu au bord avant les secours, je l’ai vu de loin. Pourquoi ne m’en a-t-il jamais parlé ? »`.replace('il', p.feminine ? 'elle' : 'il')] } }),
    },
    {
      id: 'deleted_photos',
      text: () => `Le lendemain de l’accident, vous avez effacé toutes les photos de la fête sur votre téléphone, « pour éviter les ennuis ». On vous l’avait demandé, mais vous n’avez jamais dit qui.`,
      reveal: () => 'avait effacé les photos de la fête au lendemain de la chute de Théo',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'note', name: 'Note de la victime', content: { title: 'Note épinglée dans le bureau', lines: [`« ${p.first} a supprimé ses photos le 15 juillet au matin. Qui le lui a demandé ? Lui reposer la question. »`] } }),
    },
    {
      id: 'secret_love',
      text: () => `Vous étiez en couple en secret avec Théo à l’époque. Depuis l’accident, vous lui versez de l’argent chaque mois sans rien dire à personne.`,
      reveal: () => 'était en couple en secret avec Théo et lui versait de l’argent chaque mois',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'bank_statement', name: 'Relevé de virements', content: { title: `Relevé de compte de ${p.full}`, lines: ['Virement permanent — 400,00 € — bénéficiaire : T. MARCHAL — chaque 5 du mois depuis 3 ans.'] } }),
    },
    {
      id: 'insurance',
      text: () => `Vous étiez l’organisateur·rice officiel·le de la fête. Vous avez touché 10 000 € de l’assurance après l’accident et n’en avez jamais rien reversé à Théo.`,
      reveal: () => 'avait encaissé l’assurance de la fête sans rien reverser à Théo',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'letter', name: 'Courrier d’assurance', content: { title: 'Courrier de la compagnie d’assurance', lines: [`« Indemnité versée : 10 000 € — bénéficiaire : ${p.full}, organisateur·rice de l’événement du 14 juillet. »`] } }),
      phoneMessage: () => 'On peut parler de l’argent de l’assurance avant que tu en parles aux autres ?',
    },
    {
      id: 'saw_argument',
      text: () => `Cette nuit-là, de loin, vous avez entendu deux voix se disputer au bord de la falaise, juste avant le cri. Vous n’avez jamais osé le dire, ni chercher à savoir qui c’était.`,
      reveal: () => 'avait entendu une dispute au bord de la falaise et s’était tu·e',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'diary', name: 'Carnet', content: { title: `Carnet de ${p.first}`, lines: ['« Deux voix. Une dispute. Puis le cri de Théo. Je n’ai rien dit. Je ne dirai jamais rien. »'] } }),
    },
    {
      id: 'moved_car',
      text: () => `Après la chute, vous avez déplacé la voiture du groupe pour que l’histoire « tout le monde était à la voiture » tienne debout devant les gendarmes.`,
      reveal: () => 'avait déplacé la voiture pour couvrir la version commune',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'map', name: 'Plan du parking', content: { title: 'Croquis du parking de la Pointe', lines: [`Croquis de la victime : « La voiture était garée en haut à 23h. À 0h10 elle était en bas. ${p.first} avait les clés. »`] } }),
    },
  ],
  backstoryItems: ({ v }) => [
    {
      type: 'newspaper',
      name: 'Coupure de presse',
      room: ['library', 'office', 'living'],
      content: {
        title: '« Chute à la Pointe de l’Aiguille » — L’Écho du Littoral, 15 juillet',
        lines: ['« Un jeune homme de 24 ans, Théo M., a fait une chute de douze mètres cette nuit après une fête. Ses amis, présents sur le parking, ont donné l’alerte vers 23h50. »', `Entouré au stylo par ${v.first} : « 23h50 ? Le cri était à 23h43. »`],
        facts: [],
      },
    },
    {
      type: 'map',
      name: 'Carte de randonnée annotée',
      room: ['library', 'office', 'attic', 'studio'],
      content: {
        title: 'Carte IGN — Pointe de l’Aiguille',
        lines: ['Une croix au bord de la falaise : « Théo, 23h43 ». Une flèche vers le parking : « tout le monde ? ». Une question soulignée : « QUI était au bord avec lui ? »'],
        facts: [],
      },
    },
  ],
  laptopLines: ({ v }) => [
    `Brouillon d’e-mail à la gendarmerie (non envoyé) : « Objet : Réouverture — chute de Théo Marchal. La version commune est fausse. J’ai une photo prise par Théo à 23h42. Je vous l’apporte lundi, avec les noms de ceux qui ont menti. — ${v.full} »`,
    'Dossier « Pointe » : auditions des témoins (copies), heures relevées par les secours, notes sur chaque membre du groupe.',
  ],
  decisiveProof: ({ m, seed }) => ({
    title: 'Clé USB — dossier « 14 juillet »',
    lines: [
      'Photo récupérée sur l’ancien compte en ligne de Théo, prise à 23h42 la nuit de la chute.',
      `On y voit ${m.full} au bord de la falaise, face à Théo, à moins d’un mètre du vide. Une minute avant la chute.`,
      `Note de la victime : « Tout le monde disait que ${m.first} était à la voiture. C’est ${m.first}. Lundi, je donne tout. »`,
    ],
    photos: [{ castIds: [m.castId], scene: 'cliff', caption: '14 juillet — 23:42', seed: seed() }],
  }),
  leverage: (_c, pr) => `Vous gardez la preuve du secret de ${pr.full}. Si vous tombez, ${pr.first} tombe aussi — et ${e(pr, 'il', 'elle')} le sait.`,
  pastTimeline: ({ m }) => ['Il y a 3 ans, 14 juillet, 23h42 — au bord de la Pointe de l’Aiguille, dispute entre Théo et ' + m.full + '.', '23h43 — Théo chute. Le groupe s’accorde sur une version : « tout le monde était à la voiture ».'],
};

// ──────────────────────────────────── B — La Nuit des mensonges ────────────────────────────────────

const EX = { masc: 'Lucas Vidal', fem: 'Léna Vidal' };

const mensonges: ScenarioDef = {
  id: 'mensonges',
  title: 'La Nuit des mensonges',
  subtitle: 'Les Dernières Confidences',
  murderRooms: ['living', 'musicroom', 'library'],
  weapons: ['candlestick', 'letter_opener', 'statuette'],
  victimBio: ({ v }) => `${v.full}, la confidente du groupe : tout le monde lui racontait tout. ${e(v, 'Il', 'Elle')} gardait les secrets… jusqu’à ce soir.`,
  publicBrief: ({ v }) =>
    `Il y a huit mois, une vidéo publiée par un compte anonyme, « @verite_nue », a fait le tour du groupe : on y voyait ${EX.masc.split(' ')[0]}/${EX.fem.split(' ')[0]} Vidal embrasser quelqu’un d’autre à une soirée. ` +
    `Le couple a explosé, le mariage a été annulé. Personne n’a jamais su qui avait filmé ni qui avait publié. ` +
    `Ce week-end, ${v.full} vous avait réunis à la villa. ${e(v, 'Il', 'Elle')} avait confié à plusieurs d’entre vous : « Je sais qui a publié la vidéo. » ` +
    `À 20h45, vous êtes sortis en ville ; ${v.first} est resté${a(v)}. À votre retour, vers 22h, ${e(v, 'il', 'elle')} était mort${a(v)}. La route est coupée : personne ne partira avant l’aube.`,
  murdererSecret: ({ v }) => ({
    text:
      `C’est vous. Amoureux·se en secret depuis des années de l’un des membres du couple, vous avez filmé le baiser à la soirée, puis publié la vidéo sous le compte « @verite_nue » pour briser leur couple. ` +
      `${v.first} avait retrouvé le fichier original et l’adresse de récupération du compte : ${e(v, 'il', 'elle')} allait tout dire demain. Ce soir, vous êtes revenu·e à la villa.`,
    reveal: 'avait filmé et publié la vidéo sous le compte anonyme « @verite_nue »',
  }),
  motive: ({ v, m }) => `${m.full} avait filmé et publié la vidéo qui avait détruit le couple. ${v.full} en avait la preuve et voulait révéler son nom.`,
  murdererMessages: ({ v }) => [
    { from: 'm', at: 21 * 60 + 2, text: 'Supprime ce que tu as trouvé. Je t’en supplie. Tu ne sais pas pourquoi je l’ai fait.' },
    { from: 'v', at: 21 * 60 + 4, text: 'Je le dirai demain. Tout le monde mérite de savoir.' },
    { from: 'm', at: 21 * 60 + 5, text: 'J’arrive. Dix minutes. Attends-moi.' },
    { from: 'v', at: 21 * 60 + 6, text: `Je suis seul${a(v)}. La porte du jardin est ouverte.` },
  ],
  innocentSecrets: [
    {
      id: 'cheated',
      slot: 'cheated',
      text: () => `Il y a huit mois, la vidéo a brisé votre couple et annulé votre mariage. Depuis, vous lisez en cachette les messages de vos amis pour trouver qui l’a publiée. La semaine dernière, vous avez fouillé le téléphone de la victime.`,
      reveal: () => 'était l’ex-fiancé·e trahi·e et fouillait en secret les téléphones de ses amis',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'note', name: 'Liste griffonnée', content: { title: 'Liste de noms barrés', lines: [`Une liste des membres du groupe, la plupart barrés, de l’écriture de ${p.first}. En bas : « Il reste qui ? Fouiller le téléphone de V. — fait mardi. »`] } }),
      phoneMessage: () => 'Pourquoi tu ne veux pas me dire qui c’est ? J’ai le droit de savoir !',
    },
    {
      id: 'kisser',
      slot: 'kisser',
      text: () => `C’est vous qu’on voit embrasser ${EX.masc.split(' ')[0]}/${EX.fem.split(' ')[0]} Vidal sur la vidéo — de dos, personne n’a reconnu votre visage. Si cela se sait, vous perdez vos amis.`,
      reveal: () => 'était la personne qu’on voit de dos sur la vidéo',
      givesMotive: true,
      proof: (c, p) => ({ type: 'photo', name: 'Capture de la vidéo', content: { title: 'Capture d’écran de la vidéo', lines: [`Le baiser, de dos. Au poignet, un bracelet reconnaissable : celui que porte toujours ${p.first}.`], photos: [{ castIds: [p.castId], scene: 'party', caption: 'Capture — 0:14', seed: c.seed() }] } }),
      phoneMessage: () => 'Tu m’as promis de ne jamais le dire. Promis.',
    },
    {
      id: 'shared_first',
      text: () => `C’est vous qui avez partagé la vidéo dans le groupe de discussion, le premier, en riant. Vous avez supprimé votre message une heure plus tard, trop tard.`,
      reveal: () => 'avait été le premier à diffuser la vidéo dans le groupe',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'report', name: 'Captures du groupe de discussion', content: { title: 'Impression du groupe « La bande »', lines: [`23:51 — ${p.first} : « 😂😂 regardez ça » [vidéo]`, '00:52 — « Ce message a été supprimé »'] } }),
    },
    {
      id: 'tabloid',
      text: () => `Vous avez vendu la vidéo en haute définition à un site à scandale pour 2 000 €. Personne ne doit l’apprendre.`,
      reveal: () => 'avait vendu la vidéo à un site à scandale',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'bank_statement', name: 'Relevé bancaire', content: { title: `Relevé de ${p.full}`, lines: ['Virement reçu : 2 000,00 € — émetteur : BUZZMEDIA SAS — libellé « droits vidéo »'] } }),
      phoneMessage: () => 'Ne parle pas de l’argent, s’il te plaît. J’ai tout remboursé, presque.',
    },
    {
      id: 'affair_ex',
      text: () => `Depuis la rupture, vous voyez en secret ${EX.masc.split(' ')[0]}/${EX.fem.split(' ')[0]} Vidal, l’ex-fiancé·e.`,
      reveal: () => 'entretenait une liaison secrète avec l’ex-fiancé·e',
      givesMotive: false,
      proof: (c, p) => ({ type: 'photo', name: 'Photo froissée', content: { title: 'Photo d’un dîner aux chandelles', lines: [`${p.first}, souriant${a(p)}, à un dîner en tête-à-tête. Au dos : « Notre premier vrai rendez-vous. Personne ne doit savoir. »`], photos: [{ castIds: [p.castId], scene: 'restaurant', caption: 'Mars', seed: c.seed() }] } }),
    },
    {
      id: 'knew_filmer',
      text: () => `Le soir de la vidéo, vous avez vu quelqu’un filmer avec son téléphone, dans la pénombre, mais sans le reconnaître. Vous n’avez jamais rien dit de peur d’accuser la mauvaise personne.`,
      reveal: () => 'avait vu quelqu’un filmer la scène et s’était tu·e',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'diary', name: 'Agenda', content: { title: `Agenda de ${p.first}`, lines: ['« Quelqu’un filmait près de la baie vitrée. Pull sombre. Je n’ai pas vu le visage. Je ne dirai rien tant que je ne suis pas sûr·e. »'] } }),
    },
    {
      id: 'wedding_money',
      text: () => `Vous étiez le témoin du mariage annulé et vous avez gardé l’argent de la cagnotte des invités (3 500 €).`,
      reveal: () => 'avait gardé la cagnotte du mariage annulé',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'letter', name: 'Lettre d’un invité', content: { title: 'Lettre d’un invité du mariage', lines: [`« ${p.first}, tu devais rembourser la cagnotte à chacun. Nous attendons toujours. »`] } }),
    },
  ],
  backstoryItems: ({ m }) => [
    {
      type: 'report',
      name: 'Captures du compte @verite_nue',
      room: ['office', 'living', 'library'],
      content: { title: 'Compte « @verite_nue » — impression', lines: ['Publié il y a 8 mois : la vidéo, 41 000 vues. Un seul autre message : « Certains mariages sont des mensonges. »', 'Annoté par la victime : « Compte créé la veille de la publication. Qui ? »'], facts: [] },
    },
    {
      type: 'letter',
      name: 'Lettre jamais envoyée',
      room: ['library', 'musicroom', 'guestroom', 'bedroom1'],
      content: { title: 'Lettre jamais envoyée', lines: ['« Je t’aime depuis des années et tu ne le vois pas. Tu vas l’épouser, et moi je regarde. Un jour tu comprendras qui il ou elle est vraiment. »', `Signée d’une initiale : « ${m.first[0]}. »`], facts: [{ kind: 'motive', playerId: m.id }] },
    },
  ],
  laptopLines: ({ v }) => [
    `Note : « Le fichier original de la vidéo a des métadonnées. L’adresse de récupération de @verite_nue aussi. J’ai tout copié sur la clé USB. Je le dirai demain, au petit-déjeuner. — ${v.first} »`,
    'Dossier « Confidences » : ce que chacun lui a raconté ces derniers mois (notes datées).',
  ],
  decisiveProof: ({ m }) => ({
    title: 'Clé USB — « original.mov » et compte @verite_nue',
    lines: [
      `Fichier original de la vidéo — métadonnées : « Appareil : iPhone de ${m.first} » — enregistré à 23:38.`,
      `Compte @verite_nue — adresse de récupération : ${m.first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${m.last.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@mail.fr`,
      `Note de la victime : « C’était ${m.first}. Depuis le début. »`,
    ],
  }),
  leverage: (_c, pr) => `Vous savez ce que ${pr.full} cache, et vous en avez la preuve sur vous. Si vous êtes arrêté·e, son secret sort avec le vôtre.`,
  pastTimeline: ({ m }) => [`Il y a 8 mois — à une soirée, ${m.full} filme un baiser, puis publie la vidéo sous le compte anonyme « @verite_nue ».`, 'Le couple se sépare, le mariage est annulé.'],
};

// ──────────────────────────────────── C — Le Dernier Testament ────────────────────────────────────

const testament: ScenarioDef = {
  id: 'testament',
  title: 'Le Dernier Testament',
  subtitle: '180 000 euros disparus',
  murderRooms: ['office', 'library'],
  weapons: ['letter_opener', 'statuette', 'candlestick'],
  victimBio: ({ v }) => `${v.full}, trésorier·ère des « Ateliers du Phare », l’association que vous aviez fondée avec Bernard Aubert, votre mentor à tous.`,
  publicBrief: ({ v }) =>
    `Il y a six mois, Bernard Aubert, fondateur des « Ateliers du Phare » et mentor de toute la bande, est mort d’une crise cardiaque. ` +
    `Cinq jours plus tard, 180 000 € ont disparu du fonds de l’association : un virement vers l’étranger, signé de son nom. La banque a parlé d’une erreur ; l’affaire a été classée. ` +
    `${v.full}, co-trésorier·ère, n’y a jamais cru. Ce week-end, ${e(v, 'il', 'elle')} vous avait réunis : « Lundi, je vais à la police. » ` +
    `À 20h45, vous êtes sortis en ville ; ${v.first} est resté${a(v)}. À votre retour vers 22h, ${e(v, 'il', 'elle')} était mort${a(v)}. La route est coupée jusqu’au matin.`,
  murdererSecret: ({ v }) => ({
    text:
      `C’est vous. Cinq jours après la mort de Bernard, vous avez utilisé ses identifiants pour virer les 180 000 € du fonds vers un compte à l’étranger, et vous avez imité sa signature sur l’ordre de virement. ` +
      `${v.first} avait retrouvé l’ordre falsifié et les journaux de connexion. ${e(v, 'Il', 'Elle')} allait à la police lundi. Ce soir, vous êtes revenu·e à la villa.`,
    reveal: 'avait détourné les 180 000 € du fonds avec les identifiants de Bernard Aubert',
  }),
  motive: ({ v, m }) => `${m.full} avait détourné les 180 000 € du fonds avec les identifiants de Bernard Aubert, mort cinq jours plus tôt. ${v.full} allait remettre les preuves à la police.`,
  murdererMessages: () => [
    { from: 'm', at: 21 * 60 + 1, text: 'Tu ne sais pas tout. Laisse-moi t’expliquer avant lundi.' },
    { from: 'v', at: 21 * 60 + 3, text: 'J’ai l’ordre de virement et les connexions. Il n’y a rien à expliquer.' },
    { from: 'm', at: 21 * 60 + 4, text: 'Je rembourserai. Je passe à la villa. Ne fais rien.' },
  ],
  innocentSecrets: [
    {
      id: 'credentials',
      text: () => `Bernard vous avait confié ses identifiants bancaires pour un virement urgent. Vous ne les avez jamais rendus, et vous les aviez notés dans un carnet… que vous avez perdu.`,
      reveal: () => 'détenait les identifiants bancaires de Bernard et les avait perdus',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'note', name: 'Page de carnet', content: { title: 'Page arrachée d’un carnet', lines: [`De l’écriture de ${p.first} : « Banque B.A. — identifiant 774120 — mot de passe : phare1987 ». La page a été arrachée.`] } }),
    },
    {
      id: 'anonymous_5000',
      text: () => `Un mois après la disparition des fonds, vous avez reçu 5 000 € d’un virement anonyme. Vous les avez gardés sans poser de questions.`,
      reveal: () => 'avait reçu et gardé 5 000 € d’un virement anonyme',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'bank_statement', name: 'Relevé bancaire', content: { title: `Relevé de compte de ${p.full}`, lines: ['Virement reçu : 5 000,00 € — émetteur : « N/A » — compte LT…'] } }),
      phoneMessage: () => 'Je n’ai rien demandé, cet argent est arrivé tout seul. Ne me mêle pas à ça.',
    },
    {
      id: 'forged_once',
      text: () => `Une fois, avant sa mort, vous avez imité la signature de Bernard sur une facture, pour aller plus vite. Si ça se sait, on vous accusera du reste.`,
      reveal: () => 'avait déjà imité la signature de Bernard Aubert',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'report', name: 'Facture signée', content: { title: 'Facture « Imprimerie du Port »', lines: [`Signée « B. Aubert » — mais l’écriture de la mention manuscrite est celle de ${p.first}.`] } }),
    },
    {
      id: 'heir',
      text: () => `Bernard vous a désigné·e comme héritier·ère dans son testament, que personne n’a encore lu. Vous l’avez découvert par hasard chez le notaire.`,
      reveal: () => 'était l’héritier·ère désigné·e de Bernard Aubert',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'letter', name: 'Testament de Bernard', content: { title: 'Copie du testament de Bernard Aubert', lines: [`« Je lègue ma maison du port et mes parts des Ateliers à ${p.full}, qui a cru en moi quand personne n’y croyait plus. »`] } }),
    },
    {
      id: 'cash_box',
      text: () => `Il y a un an, vous avez emprunté 3 000 € dans la caisse de l’association et les avez remboursés en douce, trois mois plus tard.`,
      reveal: () => 'avait emprunté en douce 3 000 € dans la caisse de l’association',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'receipt', name: 'Reçu de caisse', content: { title: 'Cahier de caisse — photocopie', lines: [`« Sortie 3 000 € — motif : ? — paraphe : ${p.first[0]}. » Puis, trois mois plus tard : « Retour 3 000 € ».`] } }),
    },
    {
      id: 'quarrel_bernard',
      text: () => `La veille de sa mort, vous vous êtes violemment disputé·e avec Bernard au sujet de l’association. Vous ne l’avez jamais dit.`,
      reveal: () => 's’était violemment disputé·e avec Bernard la veille de sa mort',
      givesMotive: false,
      proof: (_c, p) => ({ type: 'letter', name: 'Dernière lettre de Bernard', content: { title: 'Lettre de Bernard Aubert (non postée)', lines: [`« ${p.first}, je regrette nos mots d’hier. Viens dîner dimanche. — B. »`] } }),
    },
    {
      id: 'audit_hidden',
      text: () => `Vous avez reçu le rapport d’audit qui signalait le virement suspect… et vous l’avez rangé dans un tiroir pour ne pas « faire de vagues ».`,
      reveal: () => 'avait caché le rapport d’audit signalant le virement suspect',
      givesMotive: true,
      proof: (_c, p) => ({ type: 'report', name: 'Rapport d’audit', content: { title: 'Rapport d’audit — Ateliers du Phare', lines: ['« Virement de 180 000 € le 14/04 : ordre signé postérieurement au décès du signataire. Investigation recommandée. »', `Tampon : « Reçu par ${p.full} — classé ».`] } }),
      phoneMessage: () => 'Je t’ai dit que je n’avais jamais vu ce rapport. Arrête.',
    },
  ],
  backstoryItems: ({ m }) => [
    {
      type: 'bank_statement',
      name: 'Relevé du fonds',
      room: ['office', 'library', 'studio'],
      content: { title: 'Relevé du compte « Fonds Ateliers du Phare »', lines: ['09/04 — décès de B. Aubert (annotation manuscrite).', '14/04 — VIREMENT ÉMIS — 180 000,00 € — vers IBAN LT27 3250 …', 'Solde après opération : 412,18 €'], facts: [] },
    },
    {
      type: 'report',
      name: 'Ordre de virement',
      room: ['office', 'attic', 'library', 'cellar'],
      content: {
        title: 'Ordre de virement — copie',
        lines: ['Montant : 180 000 €. Date : 14/04. Signature : « B. Aubert ».', `La boucle du « B » est tracée à l’envers, comme dans l’écriture de ${m.first}. Annotation de la victime : « Bernard était mort depuis 5 jours. »`],
        facts: [{ kind: 'motive', playerId: m.id }],
      },
    },
  ],
  laptopLines: ({ v }) => [
    `Brouillon à la brigade financière : « Je vous remets lundi l’ordre de virement falsifié et les journaux de connexion au compte du fonds. Le coupable est l’un de nous. — ${v.full} »`,
    'Tableur « Fonds Phare » : toutes les opérations des deux dernières années, avec les noms de ceux qui avaient accès.',
  ],
  decisiveProof: ({ m }) => ({
    title: 'Clé USB — journaux de connexion de la banque',
    lines: [
      `14/04, 02:13 — connexion au compte du fonds avec les identifiants de B. Aubert — appareil : « PC-${m.first.toUpperCase()} » — adresse IP du domicile de ${m.full}.`,
      '14/04, 02:16 — ordre de virement de 180 000 € validé.',
      `Note de la victime : « ${m.first}. Je n’arrive pas à y croire. »`,
    ],
  }),
  leverage: (_c, pr) => `Vous savez ce que cache ${pr.full}, preuve à l’appui. Si vous êtes arrêté·e, vous parlerez — ${e(pr, 'il', 'elle')} le sait.`,
  pastTimeline: ({ m }) => ['Il y a 6 mois, 09/04 — mort de Bernard Aubert.', `14/04, 02:13 — ${m.full} utilise ses identifiants et vire 180 000 € à l’étranger, avec une signature imitée.`],
};

export const SCENARIOS: ScenarioDef[] = [pacte, mensonges, testament];
export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);

/** Noms de lieux de la soirée. */
export const PLACES = {
  villa: { id: 'villa', name: 'la villa', photoScene: 'villa' },
  phare: { id: 'phare', name: 'le restaurant « Le Phare », sur le port', photoScene: 'restaurant' },
  boussole: { id: 'boussole', name: 'le bar « La Boussole »', photoScene: 'party' },
  plage: { id: 'plage', name: 'la plage des Sables', photoScene: 'beach' },
  station: { id: 'station', name: 'la station-service du col, à trois minutes de la villa', photoScene: 'street' },
  epicerie: { id: 'epicerie', name: 'l’épicerie de nuit du village', photoScene: 'street' },
  belvedere: { id: 'belvedere', name: 'le belvédère de la corniche', photoScene: 'cliff' },
} as const;

/** Surnoms (téléphone de la victime) : identifier un expéditeur demande la photo de groupe. */
export const NICKNAMES = ['Capitaine', 'Bambi', 'Le Phare', 'Moustique', 'Princesse', 'Le Prof', 'Tornade', 'Petit Loup', 'Coco', 'Ninja', 'Doudou', 'Picasso'];
