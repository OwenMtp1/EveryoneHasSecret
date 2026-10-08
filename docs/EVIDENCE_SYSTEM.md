# Système de preuves

Les preuves sont **systémiques** : elles naissent des actions, pas d’un script.

## Identités physiques cachées (tirées à chaque partie)
- `fingerprint` : code unique (`E-47`) — seul le Scientifique peut le relever sur un joueur.
- `shoe` : motif + pointure — seul l’Inspecteur peut examiner des semelles.
- tenue → `fiber` (ex. « laine anthracite ») — visible de tous, mais seule l’autopsie révèle les fibres.

## Traces sur les objets (`GameObject.traces`)
| Trace | Créée par | Nettoyage |
|---|---|---|
| `print` (joueur, heure) | prendre, recevoir, utiliser, attaquer | torchon → `cleaned`, l’analyse détecte « essuyé récemment » |
| `blood` (victime, heure) | arme tranchante/contondante | torchon → détectable (« nettoyé mais détectable ») ; le torchon se tache |

`examine` (tous) : sang visible à l’œil nu, « des traces de doigts » sans identification. `analyze_prints` (Scientifique) : codes dans l’ordre, sang attribué.

## Traces dans le monde (`Evidence`)
| Type | Origine | Visible à l’œil nu | Révélée par |
|---|---|---|---|
| `footprint` | chaussures boueuses (jardin) en intérieur | oui (forme) | Inspecteur (motif, pointure, heure) |
| `blood_pool` | agression (hors strangulation) | oui | — |
| `diluted_blood` | se laver les mains tachées à un évier | non | Inspecteur |
| `smear` | nettoyer une trace au sol | non | Inspecteur |
| `forced_lock` | forcer une porte au tournevis (+ bruit) | oui | — |
| `ashes` | brûler un document (briquet / cheminée) | oui | — |

## Autres sources
- **Corps** : cause (classe d’arme), fenêtre horaire ±5 min, fibres de la tenue du tueur.
- **Caméras** : passages dans le hall et l’allée, interrompus pendant les coupures.
- **Témoignages** : publics ; l’Enquêteur peut vérifier leur cohérence contre `roomHistory` (vérité).
- **Historique des objets** et **journal de vérité** : base de l’épilogue.
- **Vêtements tachés** : remarqués par quiconque voit le tueur avant qu’il ne se lave.

## Règle
Une preuve ne peut être nettoyée, détruite ou déplacée que si le monde le permet (outil, lieu, objet) — et ces gestes laissent à leur tour des traces.

## Prévu
ADN, téléphones (journaux d’appels), falsification, dégradation temporelle, contamination de scène.
