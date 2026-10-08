# Système d’événements

## Le journal de vérité
Toute action validée produit un `TruthEvent` :
```ts
{ seq, type, t /*ms réels*/, clock /*minutes de jeu*/, actorId?, targetId?, objectId?, roomId?, text?, data? }
```
Append-only, serveur uniquement. Il sert au moteur de règles, aux outils d’enquête (caméras, vérification des témoignages), aux rôles dynamiques et à l’épilogue (« ce qui s’est vraiment passé »). Liste des types : `TRUTH_EVENT_TYPES` dans `src/shared/content/events.ts`.

## Règles (data-driven)
```ts
{
  id: 'escalation_by_conflict',
  on: ['RELATION_CREATED', 'BETRAYAL'],          // faits écoutés (ou 'TICK' chaque seconde)
  when: [ { type: 'phaseIn', phases: [...] },     // toutes les conditions doivent être vraies
          { type: 'eventField', field: 'relType', in: ['ENEMY', 'VENDETTA', 'BETRAYAL'] } ],
  effects: [ { type: 'setPhase', phase: 'ESCALATION' },
             { type: 'announce', style: 'danger', text: '…' } ],
  once: true, cooldown?: 45,
}
```

### Conditions disponibles
`phaseIn`, `elapsedAtLeast`, `phaseElapsedAtLeast`, `noCase`, `hasCase`, `flag`, `eventField`, `objectHasTag`, `random`, `bodyUndiscoveredFor`, `objectMovedFromSpawn`, `relationCountAtLeast`, `alivePlayersAtLeast`.

### Effets disponibles
`announce`, `whisper` (actor / target / room / adjacent / all), `setPhase`, `setFlag`, `blackout`, `openCase`, `assignRoles`, `spawnSecretLetter`, `discoverBodyByNpc`, `startVote`, `endGame`, `delay` (effets différés).

Gabarits : `{actor} {target} {object} {room} {victim} {clock}`.

## Moteur (`src/server/game/events/engine.ts`)
- Deux tables de handlers typés : `CONDITIONS` et `EFFECTS`. Ajouter un type = ajouter un handler.
- `onEvent()` est appelé à chaque `log()` ; `tick()` chaque seconde (effets différés + règles `TICK`).
- Garde-fou de profondeur (6) contre les chaînes infinies ; `once` / `cooldown` mémorisés.
- Les durées sont multipliées par `timeScale` (variable `EHAS_TIME_SCALE`) pour les tests.

## Perception (comment la vérité devient connaissance)
- `perceive(actor, text)` : témoins vivants **de la même pièce capables de voir** l’acteur (lumière pendant une coupure).
- `hearFrom(room, text)` : joueurs des pièces adjacentes (+ ceux qui ne voient rien dans la même pièce).
- Observations périodiques (« Vu Thomas — Cuisine, 00:12 ») avec un intervalle minimal de 15 minutes de jeu par paire et par pièce : c’est la matière des alibis.

## Phases
ARRIVAL → EXPLORATION → SOCIAL → ESCALATION → MAJOR_EVENT → INVESTIGATION → RESOLUTION → EPILOGUE. Les transitions sont elles-mêmes des règles : on peut en ajouter, en sauter, ou en déclencher par des comportements plutôt que par le temps.
