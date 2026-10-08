# Système social

## Méta (hors partie)
- **Amis** (`meta/friends.ts`) : recherche par pseudo, demande, acceptation/refus, suppression ; une demande croisée vaut acceptation.
- **Présence** (`meta/presence.ts`) : OFFLINE / ONLINE (≥ 1 socket) / IN_LOBBY / IN_GAME (dérivés des lobbies).
- **Notifications** (`meta/notifications.ts`) : persistées ou éphémères, poussées en temps réel, toasts animés côté client.
- **Invitations** : depuis le lobby vers un ami ; ACCEPT rejoint directement le lobby.

## En partie — relations (`game/relationships.ts`)
| Type | Création | Conséquences |
|---|---|---|
| FRIEND | proposition + acceptation, même pièce | historique ; signal pour le profileur |
| ALLY | idem | canal `ally:<id>`, positions partagées, partage de connaissances aux alliés |
| PACT | idem, **secret** (pas de témoin) | ALLY + poches visibles ; rupture = `BETRAYAL` |
| ENEMY | unilatérale | la cible est prévenue, les témoins voient une dispute ; peut déclencher l’escalade ; rompt amitié/alliance/pacte |
| VENDETTA | unilatérale, **secrète**, exige un mobile (trahison subie, hostilité reçue, secret de rancune) | rend l’opportunité possible dès la phase sociale contre la cible |

Chaque relation : `type, from, to, status (pending|active|broken), createdAt, origin, history[]`.

## Historique social (`SocialEvent`)
`helped` (don d’objet), `betrayed`, `accused` (vote), `declared_enemy`, `allied`, `friend`, `pact`, `vendetta`, `reconciled`. Chaque entrée est **publique** (observable) ou **privée**. Le profileur lit les entrées publiques en clair et les privées sous forme d’indices (« entretient un lien discret avec quelqu’un »).

## Communication
Chat général, messages privés (`dm:<joueur>` — les témoins de la pièce voient « X murmure à Y »), canaux d’alliance/pacte, canal des morts, chat de lobby. Les morts ne parlent qu’entre eux jusqu’à l’épilogue.
