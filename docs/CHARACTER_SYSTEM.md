# Système de personnage

## Modèle
`User` (compte, `meta/auth.ts`) ≠ `Profile` (stats publiques, `meta/profiles.ts`) ≠ `Character` (identité en jeu).

```ts
Character {
  firstName, lastName        // 2–20 caractères, lettres/espaces/tirets/apostrophes, filtre de mots
  appearance                 // 'masculine' | 'feminine' — visuel uniquement, aucun impact gameplay
  skinTone                   // id de SKIN_TONES (8)
  hairStyleId, hairColor     // ids de HAIR_STYLES (10) et HAIR_COLORS (8)
  outfitId                   // id de OUTFITS (20)
}
```

Le même `Character` est utilisé par le profil, le lobby, la villa (image générée), les portraits, l’épilogue.

## Contenu (data-driven) — `src/shared/content/character.ts`
- **Ajouter une coiffure** : une entrée `{ id, name, front, back?, shade? }` (chemins SVG dans le repère 200×320, tête en (100,72)).
- **Ajouter une tenue** : `{ id, name, category, top: { style, color, accent, pattern? }, bottom: { style, color }, shoes, detail, fiber }`. Les styles (`tee`, `blazer`, `hoodie`, `gown`…) et détails (`tie`, `bowtie`, `zip`…) sont des briques réutilisables : 100 tenues ne demandent aucun code.
- `fiber` sert d’indice médico-légal (fibres sous les ongles de la victime).
- Les couleurs ne sont **jamais** codées dans les composants.

## Rendu — `src/client/render/avatar.ts`
`avatarSvg(character, { view: 'front'|'back', crop, dead })` compose le SVG couche par couche (ombre, cheveux arrière, jambes, chaussures, bras/manches, torse + motif, détails, tête, visage, cheveux avant). `avatarImage()` le met en cache comme image pour le canvas.

## Validation
`validateCharacter()` est partagée : le client l’utilise pour l’UI, le serveur l’applique avant toute sauvegarde (`PUT /api/character`). Impossible de changer d’apparence pendant une partie.

## Évolutions prévues
Accessoires, barbe, lunettes, bijoux, tatouages (nouvelles couches + nouveaux champs optionnels), animations de marche, expressions.
