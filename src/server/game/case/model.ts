/**
 * Affaire — modèle de la VÉRITÉ (serveur uniquement).
 *
 * La vérité est générée une fois au lancement (CaseDirector) et ne change plus : meurtrier,
 * mobile, chronologie, alibis, arme, preuves et codes. Le client n'en reçoit que ce qu'un joueur
 * a réellement découvert, lu, ou ce qui a été versé publiquement au dossier.
 */

/** Lieux de la soirée (fenêtre du crime : 21:00–22:00). */
export type PlaceId = 'villa' | 'phare' | 'boussole' | 'plage' | 'station' | 'epicerie' | 'belvedere';

export interface Place {
  id: PlaceId;
  name: string;
  /** décor des photos prises sur place */
  photoScene: 'restaurant' | 'party' | 'beach' | 'street' | 'villa' | 'cliff';
}

/**
 * Faits portés par une preuve : ce qu'elle établit objectivement. Le serveur s'en sert pour
 * signaler qu'une pièce versée au dossier confirme ou contredit une déclaration d'alibi, et
 * pour l'épilogue. Ils ne sont jamais envoyés au client.
 */
export type Fact =
  | { kind: 'place'; playerId: string; place: PlaceId; at: number }
  | { kind: 'absent'; playerId: string; place: PlaceId; at: number }
  | { kind: 'atVilla'; playerId: string; at: number }
  | { kind: 'motive'; playerId: string }
  | { kind: 'secret'; playerId: string }
  | { kind: 'weapon' }
  | { kind: 'deathTime' }
  | { kind: 'code'; targetId: string };

/** Spécification d'une photo : rendue par le client avec les VRAIS personnages de la partie. */
export interface PhotoSpec {
  castIds: string[];
  scene: 'portrait' | 'group' | 'restaurant' | 'beach' | 'cliff' | 'party' | 'office' | 'street' | 'car' | 'villa';
  caption: string;
  seed: number;
}

/** Contenu d'une preuve (lisible une fois l'objet examiné, déverrouillé ou lu dans un lecteur). */
export interface EvidenceContent {
  title: string;
  lines: string[];
  photos?: PhotoSpec[];
  facts: Fact[];
  /** importance pour l'enquête : clé (indispensable), appui, fausse piste, social */
  weight: 'key' | 'support' | 'herring' | 'social';
}

/** Verrou d'un objet : code (téléphone, ordinateur, coffret) ou clé physique. */
export type Lock = { kind: 'code'; code: string; hint: string } | { kind: 'key'; keyId: string };

/** Emplacement initial d'un objet d'affaire. */
export type Placement =
  | { kind: 'room'; roomId: string }
  | { kind: 'hidden'; roomId: string; furnitureHint?: string[] }
  | { kind: 'inside'; containerRef: string }
  | { kind: 'player'; playerId: string }
  | { kind: 'body' };

/** Objet d'affaire à créer (référence locale `ref` pour les liens entre objets). */
export interface CaseItemSpec {
  ref: string;
  type: string;
  name: string;
  description?: string;
  placement: Placement;
  content?: EvidenceContent;
  lock?: Lock;
  /** pour une clé : référence de l'objet qu'elle ouvre */
  opens?: string;
  /** traces initiales (arme : sang, empreinte essuyée…) */
  traces?: { kind: 'print' | 'blood'; playerId: string; cleaned: boolean }[];
  /** appareil : supports lisibles (carte insérée d'office, etc.) */
  insertedRef?: string;
}

export type Camp = 'murderer' | 'innocent' | 'protector';

export interface PlayerTruth {
  playerId: string;
  camp: Camp;
  /** où le joueur était vraiment pendant la fenêtre du crime */
  place: PlaceId;
  /** absence réelle de son lieu (meurtrier : retour à la villa) */
  absence?: { from: number; to: number; whereabouts: string; to_villa: boolean };
  secret: { text: string; reveal: string; givesMotive: boolean };
  /** souvenirs de la soirée donnés au joueur au départ */
  memories: string[];
  /** version conseillée (mensonge du meurtrier, discrétion d'un innocent) */
  cover?: string;
  /** surnom utilisé dans le téléphone de la victime */
  nickname: string;
}

export interface CaseTruth {
  scenarioId: string;
  scenarioTitle: string;
  /** histoire publique, connue de tous au début */
  publicBrief: string;
  victim: { castId: string; name: string; feminine: boolean; roomId: string; bio: string };
  murdererId: string;
  protectorIds: string[];
  /** heure réelle du meurtre (minutes) */
  murderAt: number;
  weaponRef: string;
  weaponClass: 'sharp' | 'blunt' | 'strangle';
  motive: string;
  /** chronologie vraie complète, révélée à l'épilogue */
  timeline: { at: number; text: string }[];
  players: Map<string, PlayerTruth>;
  items: CaseItemSpec[];
  /** lieux de la soirée utilisés dans cette partie */
  places: PlaceId[];
}
