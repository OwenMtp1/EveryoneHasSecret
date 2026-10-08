/**
 * Secrets — un par joueur, tirés au hasard à chaque partie.
 * {target} est remplacé par le nom d'un autre joueur.
 * grants : objets confiés au joueur au début.
 * motiveAgainstTarget : donne un mobile (débloque la vendetta immédiate envers la cible).
 */
export interface SecretDef {
  id: string;
  text: string;
  /** Formulation à la 3e personne, révélée par une lettre/photo ou à l'épilogue. */
  reveal: string;
  needsTarget?: boolean;
  grants?: string[];
  motiveAgainstTarget?: boolean;
  /** Le secret appartient à la graine HEIST (voleur). */
  heistThief?: boolean;
  /** Le secret initie une conspiration (pacte caché avec la cible). */
  conspiracy?: boolean;
  weight?: number;
}

export const SECRETS: SecretDef[] = [
  { id: 'debt', text: 'Vous devez 50 000 € à {target}. S’il ou elle en parle, vous êtes ruiné·e.', reveal: '{self} doit 50 000 € à {target}.', needsTarget: true, motiveAgainstTarget: true },
  { id: 'heir', text: 'Vous êtes l’héritier·ère caché·e de Victor Beaumont. Personne ne doit le savoir avant la lecture du testament.', reveal: '{self} est l’héritier·ère caché·e de Victor Beaumont.' },
  { id: 'thief', text: 'Vous êtes venu·e pour le Collier Beaumont (Chambre de maître). Volez-le et cachez-le avant que quelqu’un ne remarque sa disparition.', reveal: '{self} était venu·e voler le Collier Beaumont.', heistThief: true },
  { id: 'key_copy', text: 'Vous avez gardé une copie de la clé de la cave. Ce qui s’y trouve vous concerne.', reveal: '{self} possédait une copie de la clé de la cave.', grants: ['key_cellar'] },
  { id: 'blackmail', text: 'Vous détenez une photo compromettante de {target}. Elle vous rapporte beaucoup d’argent.', reveal: '{self} faisait chanter {target} avec une photo.', needsTarget: true, grants: ['photo'] },
  { id: 'false_identity', text: 'Vous n’êtes pas qui vous prétendez être. Votre vrai nom figure dans un vieux dossier de police.', reveal: '{self} vit sous une fausse identité.' },
  { id: 'revenge', text: '{target} a ruiné votre famille il y a dix ans. Vous n’avez jamais pardonné.', reveal: '{self} voulait se venger de {target}, qui a ruiné sa famille.', needsTarget: true, motiveAgainstTarget: true },
  { id: 'sleeping_pills', text: 'Vous avez apporté des somnifères. Vous n’avez dit à personne pourquoi.', reveal: '{self} avait apporté des somnifères.', grants: ['medicine'] },
  { id: 'old_pact', text: 'Vous et {target} avez conclu un pacte il y a des années. Personne ne doit apprendre que vous vous connaissez.', reveal: '{self} et {target} étaient liés par un pacte secret.', needsTarget: true, conspiracy: true },
  { id: 'affair', text: 'Vous avez eu une liaison avec Victor Beaumont. Sa disparition ce soir vous terrifie.', reveal: '{self} avait une liaison avec Victor Beaumont.' },
  { id: 'witness', text: 'Vous avez vu {target} sortir de la cave la nuit où l’ancien jardinier a disparu.', reveal: '{self} a été témoin d’un ancien crime de {target}.', needsTarget: true },
  { id: 'journalist', text: 'Vous êtes journaliste sous couverture. Vous enquêtez sur Beaumont Industries.', reveal: '{self} était journaliste sous couverture.' },
];

export const secretById = (id: string) => SECRETS.find((s) => s.id === id);
