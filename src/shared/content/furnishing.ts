/**
 * Ameublement et décoration des pièces (rez-de-chaussée et étage), en plus des meubles « de jeu »
 * de villa.ts. Chaque élément bloque sa tuile (sauf `walkable`) : serveur et rendu sont d'accord.
 *
 * Règles de placement (vérifiées par tests/villa.test.ts) : dans la pièce, hors portes et tuiles
 * devant les portes, sans chevauchement, hors points d'apparition et escalier, pièces connexes.
 * La petite décoration (vases, livres, bougies…) est modélisée SUR les meubles (furnishing3d.ts).
 *
 * `facing` : côté du mur contre lequel le meuble est adossé (n = y−1, s = y+h, w = x−1, e = x+w).
 */
import type { FurnitureDef } from './villa';

/** Décalage de l'étage (= LEVEL_OFFSET_X ; recopié ici pour éviter l'import circulaire de valeurs). */
const UP = 50;

type Row = [roomId: string, name: string, kind: FurnitureDef['kind'], x: number, y: number, w: number, h: number, facing: FurnitureDef['facing'], hiding?: boolean];

let n = 0;
function items(rows: Row[], dx = 0): FurnitureDef[] {
  return rows.map(([roomId, name, kind, x, y, w, h, facing, hiding]) => {
    const f: FurnitureDef = { id: `fx_${roomId}_${kind}_${++n}`, roomId, name, kind, x: x + dx, y, w, h, facing };
    if (hiding) f.hiding = true;
    return f;
  });
}

const GROUND: Row[] = [
  // ── Cuisine (x1..10, y6..12) ──
  ['kitchen', 'Réfrigérateur', 'fridge', 10, 6, 1, 1, 'n'],
  ['kitchen', 'Cuisinière', 'stove', 9, 6, 1, 1, 'n'],
  ['kitchen', 'Desserte', 'counter', 1, 7, 1, 2, 'w', true],
  ['kitchen', 'Vaisselier', 'sideboard', 1, 12, 2, 1, 's', true],
  ['kitchen', 'Buffet de cuisine', 'dresser', 7, 12, 2, 1, 's'],
  ['kitchen', 'Plante aromatique', 'plant', 10, 12, 1, 1, 'e'],
  ['kitchen', 'Chaise paillée', 'chair', 10, 11, 1, 1, 'e'],
  // ── Salon (x12..28, y6..12) ──
  ['living', 'Fauteuil club', 'armchair', 16, 9, 1, 1, 'e'],
  ['living', 'Bergère', 'armchair', 14, 10, 1, 1, 's'],
  ['living', 'Bibliothèque vitrée', 'bookcase', 22, 6, 2, 1, 'n', true],
  ['living', 'Lampadaire', 'floor_lamp', 12, 6, 1, 1, 'n'],
  ['living', 'Lampadaire', 'floor_lamp', 28, 6, 1, 1, 'n'],
  ['living', 'Plante en pot', 'plant', 18, 6, 1, 1, 'n'],
  ['living', 'Palmier en pot', 'plant', 28, 12, 1, 1, 's'],
  ['living', 'Buffet bas', 'sideboard', 24, 12, 3, 1, 's', true],
  ['living', 'Poste de télévision', 'tv', 17, 12, 1, 1, 's'],
  ['living', 'Chaise Louis XV', 'chair', 27, 12, 1, 1, 's'],
  ['living', 'Chaise Louis XV', 'chair', 28, 11, 1, 1, 'e'],
  // ── Bureau (x30..37, y6..12) ──
  ['office', 'Bibliothèque', 'bookcase', 30, 6, 2, 1, 'n', true],
  ['office', 'Bibliothèque', 'bookcase', 35, 6, 2, 1, 'n'],
  ['office', 'Plante verte', 'plant', 37, 6, 1, 1, 'e'],
  ['office', 'Fauteuil de bureau', 'chair', 33, 9, 1, 1, 's'],
  ['office', 'Globe terrestre', 'globe', 30, 12, 1, 1, 's'],
  ['office', 'Malle de voyage', 'chest', 35, 12, 2, 1, 's', true],
  ['office', 'Liseuse', 'floor_lamp', 37, 12, 1, 1, 'e'],
  ['office', 'Fauteuil en cuir', 'armchair', 37, 10, 1, 1, 'e'],
  // ── Salle de bain (x39..46, y6..12) ──
  ['bathroom', 'Toilettes', 'toilet', 39, 11, 1, 1, 'w'],
  ['bathroom', 'Vasque', 'washbasin', 41, 6, 1, 1, 'n'],
  ['bathroom', 'Meuble à serviettes', 'dresser', 46, 11, 1, 2, 'e', true],
  ['bathroom', 'Fougère', 'plant', 39, 12, 1, 1, 's'],
  ['bathroom', 'Coffre à linge', 'chest', 44, 12, 1, 1, 's'],
  ['bathroom', 'Plante grasse', 'plant', 39, 6, 1, 1, 'n'],
  // ── Cave & garage (x1..10, y14..21) ──
  ['cellar', 'Établi', 'workbench', 8, 21, 3, 1, 's', true],
  ['cellar', 'Tonneau de vin', 'barrel', 10, 14, 1, 1, 'e'],
  ['cellar', 'Tonneau de vin', 'barrel', 10, 15, 1, 1, 'e'],
  ['cellar', 'Tonneau de vin', 'barrel', 10, 16, 1, 1, 'e'],
  ['cellar', 'Caisses empilées', 'crate', 1, 20, 2, 2, 'w', true],
  ['cellar', 'Étagère à outils', 'shelf', 3, 14, 2, 1, 'n'],
  ['cellar', 'Vieille malle', 'chest', 7, 14, 1, 1, 'n', true],
  // ── Hall (x12..28, y14..21) ──
  ['hall', 'Banquette', 'bench', 12, 18, 1, 2, 'w'],
  ['hall', 'Lampadaire', 'floor_lamp', 12, 21, 1, 1, 's'],
  ['hall', 'Commode', 'sideboard', 14, 21, 2, 1, 's', true],
  ['hall', 'Portemanteau', 'coat_rack', 17, 21, 1, 1, 's'],
  ['hall', 'Palmier en pot', 'plant', 23, 21, 1, 1, 's'],
  ['hall', 'Lampadaire', 'floor_lamp', 24, 21, 1, 1, 's'],
  ['hall', 'Plante en pot', 'plant', 13, 14, 1, 1, 'n'],
  ['hall', 'Plante en pot', 'plant', 24, 14, 1, 1, 'n'],
  ['hall', 'Fauteuil', 'armchair', 12, 16, 1, 1, 'w'],
  // ── Couloir (x30..46, y14..15) : uniquement le long du mur nord ──
  ['corridor', 'Plante en pot', 'plant', 32, 14, 1, 1, 'n'],
  ['corridor', 'Chaise', 'chair', 34, 14, 1, 1, 'n'],
  ['corridor', 'Banc', 'bench', 36, 14, 2, 1, 'n'],
  ['corridor', 'Console', 'sideboard', 39, 14, 2, 1, 'n', true],
  ['corridor', 'Plante en pot', 'plant', 44, 14, 1, 1, 'n'],
  ['corridor', 'Lampadaire', 'floor_lamp', 46, 14, 1, 1, 'e'],
  // ── Chambre bleue (x30..37, y17..21) ──
  ['bedroom1', 'Table de chevet', 'nightstand', 32, 21, 1, 1, 's'],
  ['bedroom1', 'Commode', 'dresser', 35, 17, 2, 1, 'n', true],
  ['bedroom1', 'Fauteuil', 'armchair', 37, 21, 1, 1, 'e'],
  ['bedroom1', 'Lampadaire', 'floor_lamp', 36, 21, 1, 1, 's'],
  ['bedroom1', 'Malle au pied du lit', 'chest', 30, 18, 2, 1, 's', true],
  ['bedroom1', 'Plante en pot', 'plant', 30, 17, 1, 1, 'n'],
  // ── Chambre de maître (x39..46, y17..21) ──
  ['bedroom2', 'Commode', 'dresser', 39, 17, 2, 1, 'n', true],
  ['bedroom2', 'Bergère', 'armchair', 41, 21, 1, 1, 's'],
  ['bedroom2', 'Plante en pot', 'plant', 46, 17, 1, 1, 'e'],
  ['bedroom2', 'Lampadaire', 'floor_lamp', 39, 19, 1, 1, 'w'],
  // ── Jardin (x1..46, y1..4) ──
  ['garden', 'Banc de jardin', 'bench', 13, 1, 2, 1, 'n'],
  ['garden', 'Banc de jardin', 'bench', 24, 1, 2, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 1, 1, 1, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 17, 1, 1, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 27, 1, 1, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 38, 1, 1, 1, 'n'],
  ['garden', 'Récupérateur d’eau', 'barrel', 46, 4, 1, 1, 'e'],
  // ── Allée extérieure (x1..46, y23..26) ──
  ['exterior', 'Tonneau', 'barrel', 1, 23, 1, 1, 'w'],
  ['exterior', 'Tonneau', 'barrel', 2, 23, 1, 1, 'n'],
  ['exterior', 'Laurier en pot', 'plant', 16, 23, 1, 1, 'n'],
  ['exterior', 'Laurier en pot', 'plant', 25, 23, 1, 1, 'n'],
  ['exterior', 'Banc', 'bench', 40, 26, 2, 1, 's'],
  ['exterior', 'Laurier en pot', 'plant', 46, 23, 1, 1, 'e'],
  ['exterior', 'Laurier en pot', 'plant', 1, 26, 1, 1, 'w'],
];

/** Étage, décrit dans le repère du rez-de-chaussée (décalé de UP à l'export). */
const UPSTAIRS: Row[] = [
  // ── Bibliothèque (x1..12, y6..12) ──
  ['library', 'Bibliothèque', 'bookcase', 1, 6, 2, 1, 'n', true],
  ['library', 'Bibliothèque', 'bookcase', 3, 6, 2, 1, 'n'],
  ['library', 'Bibliothèque', 'bookcase', 8, 6, 2, 1, 'n'],
  ['library', 'Bibliothèque', 'bookcase', 10, 6, 2, 1, 'n', true],
  ['library', 'Rayonnages', 'bookcase', 1, 8, 1, 2, 'w'],
  ['library', 'Rayonnages', 'bookcase', 1, 11, 1, 2, 'w', true],
  ['library', 'Globe terrestre', 'globe', 12, 6, 1, 1, 'e'],
  ['library', 'Table de lecture', 'table', 5, 9, 3, 2, 'n', true],
  ['library', 'Fauteuil de lecture', 'armchair', 11, 12, 1, 1, 's'],
  ['library', 'Fauteuil de lecture', 'armchair', 12, 11, 1, 1, 'e'],
  ['library', 'Liseuse', 'floor_lamp', 12, 12, 1, 1, 'e'],
  ['library', 'Plante en pot', 'plant', 6, 6, 1, 1, 'n'],
  // ── Chambre d'amis (x1..12, y14..21) ──
  ['guestroom', 'Lit', 'bed', 1, 14, 3, 3, 'n', true],
  ['guestroom', 'Armoire', 'wardrobe', 12, 14, 1, 2, 'e', true],
  ['guestroom', 'Commode', 'dresser', 9, 14, 2, 1, 'n'],
  ['guestroom', 'Fauteuil', 'armchair', 12, 17, 1, 1, 'e'],
  ['guestroom', 'Malle', 'chest', 1, 17, 2, 1, 'n', true],
  ['guestroom', 'Secrétaire', 'desk', 4, 21, 2, 1, 's'],
  ['guestroom', 'Chaise', 'chair', 6, 21, 1, 1, 's'],
  ['guestroom', 'Lampadaire', 'floor_lamp', 12, 21, 1, 1, 'e'],
  ['guestroom', 'Plante en pot', 'plant', 1, 21, 1, 1, 'w'],
  // ── Salon de musique (x14..25, y6..17) ──
  ['musicroom', 'Piano à queue', 'piano', 15, 6, 3, 2, 'n', true],
  ['musicroom', 'Harpe', 'harp', 25, 6, 1, 1, 'e'],
  ['musicroom', 'Chaise de musicien', 'chair', 20, 8, 1, 1, 'w'],
  ['musicroom', 'Chaise de musicien', 'chair', 22, 8, 1, 1, 'e'],
  ['musicroom', 'Canapé', 'sofa', 14, 12, 1, 3, 'w', true],
  ['musicroom', 'Armoire à partitions', 'bookcase', 25, 10, 1, 2, 'e'],
  ['musicroom', 'Armoire à partitions', 'bookcase', 25, 13, 1, 2, 'e', true],
  ['musicroom', 'Plante en pot', 'plant', 14, 6, 1, 1, 'n'],
  ['musicroom', 'Palmier en pot', 'plant', 25, 17, 1, 1, 's'],
  ['musicroom', 'Plante en pot', 'plant', 14, 17, 1, 1, 's'],
  ['musicroom', 'Lampadaire', 'floor_lamp', 14, 15, 1, 1, 'w'],
  ['musicroom', 'Buffet', 'sideboard', 22, 17, 2, 1, 's', true],
  ['musicroom', 'Fauteuil', 'armchair', 16, 12, 1, 1, 'e'],
  // ── Suite parentale (x29..37, y6..17) ──
  ['suite', 'Grand lit', 'bed', 32, 6, 3, 3, 'n', true],
  ['suite', 'Armoire', 'wardrobe', 37, 6, 1, 2, 'e', true],
  ['suite', 'Commode', 'dresser', 29, 9, 1, 2, 'w'],
  ['suite', 'Fauteuil', 'armchair', 29, 13, 1, 1, 'w'],
  ['suite', 'Lampadaire', 'floor_lamp', 29, 14, 1, 1, 'w'],
  ['suite', 'Fauteuil', 'armchair', 29, 15, 1, 1, 'w'],
  ['suite', 'Banc de lit', 'chest', 32, 9, 3, 1, 'n', true],
  ['suite', 'Plante en pot', 'plant', 37, 17, 1, 1, 's'],
  ['suite', 'Plante en pot', 'plant', 29, 6, 1, 1, 'n'],
  ['suite', 'Coiffeuse', 'desk', 35, 17, 2, 1, 's'],
  ['suite', 'Bibliothèque', 'bookcase', 37, 11, 1, 2, 'e'],
  // ── Salle de bain de l'étage (x39..46, y6..11) ──
  ['bathroom2', 'Baignoire', 'bath', 44, 6, 3, 2, 'n', true],
  ['bathroom2', 'Toilettes', 'toilet', 39, 9, 1, 1, 'w'],
  ['bathroom2', 'Vasque', 'washbasin', 40, 6, 1, 1, 'n'],
  ['bathroom2', 'Vasque', 'washbasin', 41, 6, 1, 1, 'n'],
  ['bathroom2', 'Armoire à linge', 'dresser', 46, 10, 1, 2, 'e', true],
  ['bathroom2', 'Fougère', 'plant', 39, 11, 1, 1, 's'],
  // ── Atelier (x39..46, y13..21) ──
  ['studio', 'Établi', 'workbench', 44, 13, 3, 1, 'n', true],
  ['studio', 'Chevalet', 'easel', 41, 16, 1, 1, 'n'],
  ['studio', 'Tabouret', 'chair', 41, 17, 1, 1, 's'],
  ['studio', 'Chevalet', 'easel', 44, 16, 1, 1, 'n'],
  ['studio', 'Tabouret', 'chair', 44, 17, 1, 1, 's'],
  ['studio', 'Coffre à pigments', 'chest', 45, 21, 2, 1, 's', true],
  ['studio', 'Étagère à toiles', 'shelf', 39, 15, 1, 3, 'w'],
  ['studio', 'Plante en pot', 'plant', 39, 13, 1, 1, 'n'],
  ['studio', 'Plante en pot', 'plant', 46, 18, 1, 1, 'e'],
  // ── Palier (x14..37, y19..21) ──
  ['landing', 'Plante en pot', 'plant', 14, 21, 1, 1, 's'],
  ['landing', 'Lampadaire', 'floor_lamp', 16, 19, 1, 1, 'n'],
  ['landing', 'Banc', 'bench', 22, 19, 2, 1, 'n'],
  ['landing', 'Plante en pot', 'plant', 25, 19, 1, 1, 'n'],
  ['landing', 'Console', 'sideboard', 30, 19, 2, 1, 'n', true],
  ['landing', 'Palmier en pot', 'plant', 37, 21, 1, 1, 's'],
];

export const FURNISHING: FurnitureDef[] = [...items(GROUND), ...items(UPSTAIRS, UP)];
