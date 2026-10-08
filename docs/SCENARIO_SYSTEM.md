# Système de scénarios

Un scénario n’est pas une histoire : c’est une **graine** posée au début de la nuit (`game/director.ts`), plus des **règles** qui réagissent à ce que les joueurs en font (`content/events.ts`).

## Familles (`content/scenarios.ts`)
| Famille | Statut | Graine | Événement majeur possible |
|---|---|---|---|
| MURDER | ✅ toujours possible | armes réparties, mobiles dans certains secrets | découverte d’un corps |
| HEIST | ✅ 60 % | secret « voleur » + Collier Beaumont | disparition constatée si le collier a quitté sa place |
| CONSPIRACY | ✅ 50 % | secret « pacte ancien » → PACT caché entre deux joueurs | (alimente trahisons et alibis croisés) |
| DISAPPEARANCE | ⬜ prévu | — | — |
| SURVIVAL | ⬜ prévu | — | — |

Les graines coexistent : une même nuit peut contenir un voleur, un pacte secret et un meurtre opportuniste. **Hybrides** : si le collier est volé puis un meurtre a lieu, c’est le meurtre qui ouvre l’enquête ; le vol reste visible dans l’épilogue.

## Ce qui varie à chaque partie
Position/présence des objets, attribution et cibles des secrets, graines actives, empreintes et semelles, message du téléphone, cible de la lettre anonyme, moments des événements aléatoires, rôles d’enquête.

## Fins possibles
1. **Meurtre** → enquête → vote → épilogue (coupable démasqué ou non).
2. **Vol** → enquête → vote → épilogue.
3. **Aube calme** → révélation de tous les secrets.

## Ajouter un scénario
1. Une famille dans `SCENARIO_FAMILIES` (+ secrets graines).
2. Des objets / secrets dans le contenu.
3. Des règles : déclencheur → `openCase` (nouveau type si besoin) → `setPhase` → `assignRoles`.
4. Si nouveau type d’affaire : `InvestigationSystem.openCase` (coupable, heure de référence) et l’épilogue.
