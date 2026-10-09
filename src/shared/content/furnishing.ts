/**
 * Ameublement et décoration des pièces (tous les niveaux), en plus des meubles « de jeu » de villa.ts.
 * Chaque élément bloque sa tuile (sauf `walkable`) : serveur et rendu sont d'accord.
 *
 * Règles de placement (vérifiées par tests/villa.test.ts) : dans la pièce, hors portes et tuiles
 * devant les portes, sans chevauchement, hors points d'apparition, rampes et paliers d'arrivée,
 * pièces entièrement praticables, cachettes accessibles.
 * La petite décoration (vases, livres, bougies…) est modélisée SUR les meubles (furnishing3d.ts).
 * Interdits (même sous un autre nom) : horloges, dictaphones, disques durs, tableaux blancs,
 * plateaux de boissons, badges, tableaux électriques, sonnettes connectées, caméras.
 *
 * Coordonnées LOCALES du niveau (repère du rez-de-chaussée) ; `facing` : côté du mur contre lequel
 * le meuble est adossé (n = y−1, s = y+h, w = x−1, e = x+w).
 */
import type { FurnitureDef } from './villa';
import { gridX, type Level } from './levels';

type Row = [roomId: string, name: string, kind: FurnitureDef['kind'], x: number, y: number, w: number, h: number, facing: FurnitureDef['facing'], hiding?: boolean];

let n = 0;
function items(rows: Row[], level: Level): FurnitureDef[] {
  return rows.map(([roomId, name, kind, x, y, w, h, facing, hiding]) => {
    const f: FurnitureDef = { id: `fx_${roomId}_${kind}_${++n}`, roomId, name, kind, x: gridX(level, x), y, w, h, facing };
    if (hiding) f.hiding = true;
    return f;
  });
}

const GROUND: Row[] = [
  // ── Cuisine (x1..9, y6..12) ──
  ['kitchen', 'Cuisinière', 'stove', 4, 6, 1, 1, 'n'],
  ['kitchen', 'Réfrigérateur', 'fridge', 9, 6, 1, 1, 'n'],
  ['kitchen', 'Placard de la desserte', 'counter', 1, 7, 1, 2, 'w', true],
  ['kitchen', 'Vaisselier', 'sideboard', 1, 12, 2, 1, 's', true],
  ['kitchen', 'Buffet de cuisine', 'dresser', 7, 12, 2, 1, 's'],
  ['kitchen', 'Plante aromatique', 'plant', 9, 12, 1, 1, 'e'],
  ['kitchen', 'Chaise paillée', 'chair', 9, 11, 1, 1, 'e'],
  // ── Salle à manger (x11..18, y6..12) ──
  ['dining', 'Argentier', 'dresser', 15, 6, 2, 1, 'n', true],
  ['dining', 'Plante en pot', 'plant', 11, 6, 1, 1, 'n'],
  ['dining', 'Palmier en pot', 'plant', 18, 6, 1, 1, 'e'],
  ['dining', 'Lampadaire', 'floor_lamp', 11, 12, 1, 1, 's'],
  ['dining', 'Chaise d’appoint', 'chair', 14, 12, 1, 1, 's'],
  ['dining', 'Desserte de service', 'sideboard', 16, 12, 2, 1, 's', true],
  // ── Salon (x20..33, y6..12) ──
  ['living', 'Fauteuil club', 'armchair', 21, 8, 1, 1, 'w'],
  ['living', 'Bergère', 'armchair', 26, 8, 1, 1, 'e'],
  ['living', 'Derrière les livres de la bibliothèque vitrée', 'bookcase', 20, 6, 2, 1, 'n', true],
  ['living', 'Lampadaire', 'floor_lamp', 33, 6, 1, 1, 'e'],
  ['living', 'Lampadaire', 'floor_lamp', 20, 12, 1, 1, 's'],
  ['living', 'Palmier en pot', 'plant', 25, 6, 1, 1, 'n'],
  ['living', 'Plante en pot', 'plant', 31, 12, 1, 1, 's'],
  ['living', 'Tiroirs du buffet bas', 'sideboard', 28, 12, 3, 1, 's', true],
  ['living', 'Poste de télévision', 'tv', 33, 11, 1, 1, 'e'],
  // ── Salle de jeux (x35..46, y6..12) ──
  ['gamesroom', 'Juke-box', 'jukebox', 35, 6, 1, 1, 'n'],
  ['gamesroom', 'Râtelier à queues', 'cue_rack', 38, 6, 1, 1, 'n'],
  ['gamesroom', 'Lampadaire', 'floor_lamp', 46, 6, 1, 1, 'e'],
  ['gamesroom', 'Cible de fléchettes', 'darts', 46, 9, 1, 1, 'e'],
  ['gamesroom', 'Borne d’arcade', 'arcade', 46, 11, 1, 1, 'e'],
  ['gamesroom', 'Table de cartes', 'table', 36, 11, 2, 2, 's'],
  ['gamesroom', 'Sous les coussins du canapé', 'sofa', 42, 12, 3, 1, 's', true],
  ['gamesroom', 'Plante en pot', 'plant', 35, 12, 1, 1, 's'],
  // ── Garage (x1..9, y14..21) ──
  ['garage', 'Établi', 'workbench', 7, 21, 3, 1, 's', true],
  ['garage', 'Étagère à pots de peinture', 'shelf', 1, 14, 1, 3, 'w'],
  ['garage', 'Bidon d’essence', 'barrel', 1, 21, 1, 1, 'w'],
  ['garage', 'Congélateur coffre', 'freezer', 7, 14, 2, 1, 'n', true],
  ['garage', 'Cartons empilés', 'boxes', 9, 15, 1, 2, 'e', true],
  ['garage', 'Vélo', 'bicycle', 9, 14, 1, 1, 'e'],
  // ── Buanderie (x11..15, y14..21 ; escalier de la cave x14..15, y17..20) ──
  ['laundry', 'Tambour du lave-linge', 'washing_machine', 11, 14, 1, 1, 'n', true],
  ['laundry', 'Tambour du sèche-linge', 'dryer', 12, 14, 1, 1, 'n', true],
  ['laundry', 'Étagère à produits ménagers', 'shelf', 14, 14, 2, 1, 'n'],
  ['laundry', 'Étendoir à linge', 'drying_rack', 11, 16, 1, 2, 'w'],
  ['laundry', 'Placard à balais', 'wardrobe', 11, 19, 1, 2, 'w', true],
  ['laundry', 'Planche à repasser', 'ironing_board', 11, 21, 2, 1, 's'],
  ['laundry', 'Panier à linge sale', 'laundry_basket', 12, 20, 1, 1, 's', true],
  // ── Hall (x17..27, y14..21 ; escalier x25..27, y16..19) ──
  ['hall', 'Banquette', 'bench', 17, 19, 1, 2, 'w'],
  ['hall', 'Portemanteau', 'coat_rack', 17, 21, 1, 1, 's'],
  ['hall', 'Tiroirs de la commode d’entrée', 'sideboard', 18, 21, 2, 1, 's', true],
  ['hall', 'Palmier en pot', 'plant', 22, 21, 1, 1, 's'],
  ['hall', 'Lampadaire', 'floor_lamp', 23, 21, 1, 1, 's'],
  ['hall', 'Penderie de l’entrée', 'wardrobe', 26, 21, 2, 1, 's', true],
  ['hall', 'Plante en pot', 'plant', 20, 14, 1, 1, 'n'],
  ['hall', 'Fauteuil', 'armchair', 17, 16, 1, 1, 'w'],
  ['hall', 'Meuble à chaussures', 'dresser', 25, 14, 2, 1, 'n', true],
  // ── Couloir (x29..42, y14..15) : uniquement le long du mur nord ──
  ['corridor', 'Plante en pot', 'plant', 30, 14, 1, 1, 'n'],
  ['corridor', 'Tiroir de la console', 'sideboard', 31, 14, 2, 1, 'n', true],
  ['corridor', 'Chaise', 'chair', 34, 14, 1, 1, 'n'],
  ['corridor', 'Coffre-banc', 'chest', 35, 14, 2, 1, 'n', true],
  ['corridor', 'Plante en pot', 'plant', 38, 14, 1, 1, 'n'],
  ['corridor', 'Lampadaire', 'floor_lamp', 42, 14, 1, 1, 'e'],
  // ── Bureau (x29..38, y17..21) ──
  ['office', 'Fauteuil de bureau', 'chair', 34, 20, 1, 1, 'n'],
  ['office', 'Bibliothèque', 'bookcase', 35, 17, 2, 1, 'n'],
  ['office', 'Plante verte', 'plant', 37, 17, 1, 1, 'n'],
  ['office', 'Globe terrestre', 'globe', 29, 21, 1, 1, 'w'],
  ['office', 'Fauteuil en cuir', 'armchair', 30, 21, 1, 1, 's'],
  ['office', 'Liseuse', 'floor_lamp', 31, 21, 1, 1, 's'],
  ['office', 'Tiroirs du classeur', 'filing_cabinet', 37, 21, 1, 1, 's', true],
  // ── Toilettes (x40..42, y17..19) ──
  ['wc', 'Fougère', 'plant', 42, 19, 1, 1, 'e'],
  // ── Vestiaire de jardin (x44..46, y14..21) ──
  ['mudroom', 'Portemanteau', 'coat_rack', 46, 14, 1, 1, 'e'],
  ['mudroom', 'Plante en pot', 'plant', 44, 14, 1, 1, 'n'],
  ['mudroom', 'Banc à chaussures', 'bench', 44, 17, 1, 2, 'w'],
  ['mudroom', 'Porte-parapluies', 'umbrella_stand', 46, 17, 1, 1, 'e'],
  ['mudroom', 'Casier de jardinage', 'wardrobe', 46, 20, 1, 2, 'e', true],
  ['mudroom', 'Coffre à bottes', 'chest', 44, 21, 2, 1, 's', true],
  // ── Jardin (x1..47, y1..4) ──
  ['garden', 'Banc de jardin', 'bench', 13, 1, 2, 1, 'n'],
  ['garden', 'Banc de jardin', 'bench', 23, 1, 2, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 1, 1, 1, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 17, 1, 1, 1, 'n'],
  ['garden', 'Buis en pot', 'plant', 38, 1, 1, 1, 'n'],
  ['garden', 'Barbecue', 'barbecue', 19, 1, 1, 1, 'n'],
  ['garden', 'Table de jardin', 'table', 40, 2, 2, 2, 'n'],
  ['garden', 'Pommier', 'tree', 44, 2, 1, 1, 'n'],
  ['garden', 'Récupérateur d’eau', 'barrel', 46, 4, 1, 1, 'e', true],
  // ── Verger (x48..64, y1..26) ──
  ['orchard', 'Poteau de la cabane', 'post', 50, 4, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 54, 4, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 50, 7, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 54, 7, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 57, 17, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 61, 17, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 57, 20, 1, 1, 'n'],
  ['orchard', 'Poteau de la cabane', 'post', 61, 20, 1, 1, 'n'],
  ['orchard', 'Abri de jardin', 'shed', 63, 1, 2, 2, 'n', true],
  ['orchard', 'Bac à compost', 'crate', 64, 25, 1, 2, 'e', true],
  ['orchard', 'Pommier', 'tree', 50, 12, 1, 1, 'n'],
  ['orchard', 'Poirier', 'tree', 56, 12, 1, 1, 'n'],
  ['orchard', 'Cerisier', 'tree', 62, 10, 1, 1, 'n'],
  ['orchard', 'Prunier', 'tree', 51, 21, 1, 1, 'n'],
  ['orchard', 'Balançoire', 'swing', 53, 24, 3, 1, 'n'],
  ['orchard', 'Carré potager', 'planter', 59, 13, 3, 1, 'n'],
  ['orchard', 'Banc', 'bench', 49, 26, 2, 1, 's'],
  // ── Allée extérieure (x1..47, y23..26) ──
  ['exterior', 'Poubelles', 'bins', 7, 23, 2, 1, 'n', true],
  ['exterior', 'Laurier en pot', 'plant', 16, 23, 1, 1, 'n'],
  ['exterior', 'Laurier en pot', 'plant', 25, 23, 1, 1, 'n'],
  ['exterior', 'Boîte aux lettres', 'mailbox', 24, 26, 1, 1, 's', true],
  ['exterior', 'Banc', 'bench', 40, 26, 2, 1, 's'],
  ['exterior', 'Laurier en pot', 'plant', 46, 23, 1, 1, 'n'],
  ['exterior', 'Laurier en pot', 'plant', 1, 26, 1, 1, 'w'],
];

const BASEMENT: Row[] = [
  // ── Cave à vin (x1..9, y14..21) ──
  ['cellar', 'Tonneau de vin', 'barrel', 7, 14, 1, 1, 'n'],
  ['cellar', 'Tonneau de vin', 'barrel', 8, 14, 1, 1, 'n'],
  ['cellar', 'Tonneau de vin', 'barrel', 9, 14, 1, 1, 'e'],
  ['cellar', 'Casiers à bouteilles', 'wine_rack', 3, 14, 4, 1, 'n'],
  ['cellar', 'Casiers à bouteilles', 'wine_rack', 3, 21, 4, 1, 's'],
  ['cellar', 'Table de dégustation', 'table', 4, 17, 2, 2, 'n'],
  ['cellar', 'Vieille malle', 'chest', 1, 21, 1, 1, 'w', true],
  // ── Sous-sol (x11..22, y14..21 ; escalier x14..15, y17..20) ──
  ['basement', 'Cartons de vieux papiers', 'boxes', 11, 14, 1, 2, 'w', true],
  ['basement', 'Fauteuil défoncé', 'armchair', 13, 14, 1, 1, 'n'],
  ['basement', 'Bidon de fioul', 'barrel', 21, 14, 1, 1, 'n'],
  ['basement', 'Bidon de fioul', 'barrel', 22, 14, 1, 1, 'e'],
  ['basement', 'Étagères de conserves', 'shelf', 22, 16, 1, 3, 'e', true],
  ['basement', 'Vieux buffet', 'sideboard', 11, 21, 2, 1, 's', true],
  ['basement', 'Vieil établi', 'workbench', 18, 21, 3, 1, 's'],
  ['basement', 'Vélo d’enfant rouillé', 'bicycle', 22, 21, 1, 1, 'e'],
];

const UPSTAIRS: Row[] = [
  // ── Palier (x1..46, y14..15) : le long du mur nord ──
  ['landing', 'Plante en pot', 'plant', 1, 14, 1, 1, 'n'],
  ['landing', 'Tiroir de la console', 'sideboard', 2, 14, 2, 1, 'n', true],
  ['landing', 'Banc', 'bench', 7, 14, 2, 1, 'n'],
  ['landing', 'Plante en pot', 'plant', 10, 14, 1, 1, 'n'],
  ['landing', 'Tiroirs de la commode du palier', 'dresser', 12, 14, 2, 1, 'n', true],
  ['landing', 'Lampadaire', 'floor_lamp', 17, 14, 1, 1, 'n'],
  ['landing', 'Bibliothèque basse', 'bookcase', 19, 14, 2, 1, 'n'],
  ['landing', 'Plante en pot', 'plant', 22, 14, 1, 1, 'n'],
  ['landing', 'Banquette', 'bench', 29, 14, 2, 1, 'n'],
  ['landing', 'Plante en pot', 'plant', 32, 14, 1, 1, 'n'],
  ['landing', 'Armoire à linge', 'wardrobe', 34, 14, 2, 1, 'n', true],
  ['landing', 'Chaise', 'chair', 37, 14, 1, 1, 'n'],
  ['landing', 'Plante en pot', 'plant', 39, 14, 1, 1, 'n'],
  // ── Bibliothèque (x1..9, y6..12) ──
  ['library', 'Derrière les livres', 'bookcase', 1, 6, 2, 1, 'n', true],
  ['library', 'Bibliothèque', 'bookcase', 3, 6, 2, 1, 'n'],
  ['library', 'Bibliothèque', 'bookcase', 7, 6, 2, 1, 'n'],
  ['library', 'Rayonnages', 'bookcase', 1, 8, 1, 2, 'w'],
  ['library', 'Rayonnages (double fond)', 'bookcase', 1, 11, 1, 2, 'w', true],
  ['library', 'Plante en pot', 'plant', 5, 6, 1, 1, 'n'],
  ['library', 'Globe terrestre', 'globe', 9, 6, 1, 1, 'e'],
  ['library', 'Table de lecture', 'table', 4, 9, 3, 2, 'n'],
  ['library', 'Fauteuil de lecture', 'armchair', 9, 11, 1, 1, 'e'],
  ['library', 'Liseuse', 'floor_lamp', 9, 12, 1, 1, 'e'],
  // ── Chambre de maître (x11..19, y6..12) ──
  ['bedroom2', 'Tiroirs de la commode', 'dresser', 18, 6, 2, 1, 'n', true],
  ['bedroom2', 'Armoire', 'wardrobe', 19, 10, 1, 2, 'e', true],
  ['bedroom2', 'Bergère', 'armchair', 11, 8, 1, 1, 'w'],
  ['bedroom2', 'Lampadaire', 'floor_lamp', 11, 6, 1, 1, 'n'],
  ['bedroom2', 'Plante en pot', 'plant', 19, 12, 1, 1, 's'],
  ['bedroom2', 'Banc-coffre au pied du lit', 'chest', 14, 9, 3, 1, 'n', true],
  // ── Suite parentale (x21..31, y6..12) ──
  ['suite', 'Sous le matelas du grand lit', 'bed', 27, 6, 3, 3, 'n', true],
  ['suite', 'Armoire de la suite', 'wardrobe', 31, 6, 1, 2, 'e', true],
  ['suite', 'Coiffeuse', 'desk', 21, 12, 2, 1, 's'],
  ['suite', 'Fauteuil', 'armchair', 21, 9, 1, 1, 'w'],
  ['suite', 'Fauteuil', 'armchair', 21, 10, 1, 1, 'w'],
  ['suite', 'Banc de lit', 'chest', 27, 9, 3, 1, 'n', true],
  ['suite', 'Commode', 'dresser', 29, 12, 2, 1, 's'],
  ['suite', 'Plante en pot', 'plant', 31, 12, 1, 1, 'e'],
  ['suite', 'Lampadaire', 'floor_lamp', 25, 6, 1, 1, 'n'],
  // ── Salle de bain de la suite (x33..37, y6..12) ──
  ['bathroom2', 'Baignoire', 'bath', 35, 6, 3, 2, 'n'],
  ['bathroom2', 'Réservoir de la chasse d’eau', 'toilet', 37, 10, 1, 1, 'e', true],
  ['bathroom2', 'Armoire à linge', 'dresser', 37, 11, 1, 2, 'e', true],
  ['bathroom2', 'Fougère', 'plant', 33, 12, 1, 1, 'w'],
  ['bathroom2', 'Panier à linge', 'laundry_basket', 35, 12, 1, 1, 's'],
  // ── Chambre d'enfant (x39..46, y6..12) ──
  ['kidsroom', 'Sous le matelas', 'bed', 45, 6, 2, 3, 'n', true],
  ['kidsroom', 'Coffre à jouets', 'chest', 39, 12, 2, 1, 's', true],
  ['kidsroom', 'Petit bureau', 'desk', 39, 6, 2, 1, 'n'],
  ['kidsroom', 'Chaise', 'chair', 40, 7, 1, 1, 's'],
  ['kidsroom', 'Étagère à jouets', 'bookcase', 43, 6, 1, 1, 'n'],
  ['kidsroom', 'Maison de poupée', 'dollhouse', 46, 12, 1, 1, 'e'],
  ['kidsroom', 'Pouf', 'armchair', 44, 12, 1, 1, 's'],
  // ── Chambre d'amis (x1..9, y17..21) ──
  ['guestroom', 'Sous le matelas', 'bed', 1, 19, 3, 3, 's', true],
  ['guestroom', 'Armoire', 'wardrobe', 9, 17, 1, 2, 'e', true],
  ['guestroom', 'Commode', 'dresser', 7, 21, 2, 1, 's'],
  ['guestroom', 'Fauteuil', 'armchair', 9, 21, 1, 1, 'e'],
  ['guestroom', 'Secrétaire', 'desk', 1, 17, 2, 1, 'n'],
  ['guestroom', 'Chaise', 'chair', 3, 17, 1, 1, 'n'],
  ['guestroom', 'Malle', 'chest', 4, 21, 2, 1, 's', true],
  // ── Salle de bain (x11..15, y17..21) ──
  ['bathroom', 'Meuble à serviettes', 'dresser', 15, 17, 1, 2, 'e', true],
  ['bathroom', 'Coffre à linge', 'chest', 11, 21, 1, 1, 's'],
  // ── Chambre bleue (x17..23, y17..21) ──
  ['bedroom1', 'Table de chevet', 'nightstand', 19, 21, 1, 1, 's'],
  ['bedroom1', 'Tiroirs de la commode', 'dresser', 21, 21, 2, 1, 's', true],
  ['bedroom1', 'Petit bureau', 'desk', 17, 17, 2, 1, 'n'],
  ['bedroom1', 'Fauteuil', 'armchair', 23, 21, 1, 1, 'e'],
  // ── Atelier (x29..37, y17..21) ──
  ['studio', 'Tiroirs de l’établi', 'workbench', 35, 21, 3, 1, 's', true],
  ['studio', 'Chevalet', 'easel', 31, 19, 1, 1, 'n'],
  ['studio', 'Tabouret', 'chair', 31, 20, 1, 1, 's'],
  ['studio', 'Chevalet', 'easel', 34, 19, 1, 1, 'n'],
  ['studio', 'Tabouret', 'chair', 34, 20, 1, 1, 's'],
  ['studio', 'Coffre à pigments', 'chest', 29, 21, 2, 1, 's', true],
  ['studio', 'Étagère à toiles', 'shelf', 29, 17, 1, 3, 'w'],
  ['studio', 'Plante en pot', 'plant', 37, 17, 1, 1, 'e'],
  // ── Salon de musique (x39..46, y17..21) ──
  ['musicroom', 'Sous le couvercle du piano', 'piano', 44, 17, 3, 2, 'n', true],
  ['musicroom', 'Harpe', 'harp', 39, 17, 1, 1, 'w'],
  ['musicroom', 'Sous les coussins du canapé', 'sofa', 39, 19, 1, 3, 'w', true],
  ['musicroom', 'Armoire à partitions', 'bookcase', 46, 20, 1, 2, 'e', true],
  ['musicroom', 'Lampadaire', 'floor_lamp', 43, 21, 1, 1, 's'],
  ['musicroom', 'Chaise de musicien', 'chair', 42, 19, 1, 1, 'w'],
  // ── Cabane du vieux chêne (x50..54, y4..7) ──
  ['treehouse1', 'Sous les coussins', 'cushions', 50, 4, 2, 1, 'n', true],
  ['treehouse1', 'Lanterne', 'lantern', 54, 4, 1, 1, 'e'],
  ['treehouse1', 'Coffre aux trésors', 'chest', 54, 5, 1, 2, 'e', true],
  ['treehouse1', 'Caisse de bandes dessinées', 'boxes', 50, 6, 1, 1, 'w', true],
  // ── Cabane du tilleul (x57..61, y17..20) ──
  ['treehouse2', 'Sous le pouf et les coussins', 'cushions', 57, 17, 2, 1, 'n', true],
  ['treehouse2', 'Lanterne', 'lantern', 61, 17, 1, 1, 'e'],
  ['treehouse2', 'Malle de pirate', 'chest', 61, 18, 1, 2, 'e', true],
  ['treehouse2', 'Caisse de vieux jouets', 'boxes', 57, 19, 1, 1, 'w'],
];

const ATTIC: Row[] = [
  // ── Grenier (x30..46, y9..18 ; échelle x44..45, y15) ──
  ['attic', 'Mannequin de couture', 'mannequin', 34, 9, 1, 1, 'n'],
  ['attic', 'Cheval à bascule', 'rocking_horse', 37, 12, 1, 1, 'n'],
  ['attic', 'Cartons de vieux papiers', 'boxes', 30, 12, 1, 2, 'w', true],
  ['attic', 'Armoire mangée aux mites', 'wardrobe', 38, 9, 2, 1, 'n', true],
  ['attic', 'Fauteuil éventré', 'armchair', 41, 11, 1, 1, 'n'],
  ['attic', 'Malle aux costumes', 'chest', 42, 18, 2, 1, 's', true],
  ['attic', 'Cartons de Noël', 'boxes', 46, 9, 1, 2, 'e', true],
  ['attic', 'Étagère de bocaux', 'shelf', 35, 18, 3, 1, 's'],
  ['attic', 'Vieux lit en fer', 'bed', 30, 16, 2, 3, 's'],
  ['attic', 'Vieille commode', 'dresser', 46, 12, 1, 2, 'e', true],
];

export const FURNISHING: FurnitureDef[] = [...items(GROUND, 0), ...items(BASEMENT, -1), ...items(UPSTAIRS, 1), ...items(ATTIC, 2)];
