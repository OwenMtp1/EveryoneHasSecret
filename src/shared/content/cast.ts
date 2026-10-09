/**
 * Catalogue des personnages prédéfinis (provisoire : remplacé par le catalogue Rocketbox complet).
 */
export interface CastMember {
  id: string;
  firstName: string;
  lastName: string;
  gender: 'feminine' | 'masculine';
  age: number;
  build: string;
  heightM: number;
  skin: string;
  hair: { length: string; color: string; texture: string };
  outfit: { top: string; bottom: string; shoes: string; accessories?: string };
  colors: { top: string; bottom: string };
  fiber: string;
  description: string;
  model: string;
  thumb: string;
  card: string;
  source: string;
}

const F = ['Inès', 'Camille', 'Léa', 'Sarah', 'Maëlle', 'Aïcha', 'Chloé', 'Nora', 'Julie', 'Emma', 'Lina', 'Zoé', 'Manon', 'Fatou', 'Clara', 'Yasmine', 'Élise', 'Mia', 'Hélène', 'Salomé'];
const M = ['Hugo', 'Karim', 'Thomas', 'Lucas', 'Mehdi', 'Antoine', 'Moussa', 'Julien', 'Nathan', 'Adrien', 'Samuel', 'Bastien', 'Yanis', 'Paul', 'Olivier', 'Rayan', 'Théo', 'Marc', 'Ibrahim', 'Victor'];
const LAST = ['Moreau', 'Benali', 'Laurent', 'Diallo', 'Petit', 'Garnier', 'Roux', 'Mercier', 'Haddad', 'Lefèvre', 'Nguyen', 'Faure', 'Traoré', 'Blanc', 'Morel', 'Chevalier', 'Rousseau', 'Leroy', 'Fontaine', 'Dupuis'];

const member = (g: 'feminine' | 'masculine', i: number): CastMember => {
  const id = `${g === 'feminine' ? 'f' : 'm'}${String(i + 1).padStart(2, '0')}`;
  return {
    id,
    firstName: (g === 'feminine' ? F : M)[i],
    lastName: LAST[(i * 7 + (g === 'feminine' ? 0 : 3)) % LAST.length],
    gender: g,
    age: 30,
    build: 'moyenne',
    heightM: g === 'feminine' ? 1.68 : 1.8,
    skin: '',
    hair: { length: '', color: '', texture: '' },
    outfit: { top: '', bottom: '', shoes: '' },
    colors: { top: '#556677', bottom: '#333333' },
    fiber: 'coton gris',
    description: '',
    model: `/characters/${id}.glb`,
    thumb: `/characters/thumbs/${id}.jpg`,
    card: `/characters/cards/${id}.jpg`,
    source: '',
  };
};

export const CAST: CastMember[] = [...F.map((_, i) => member('feminine', i)), ...M.map((_, i) => member('masculine', i))];
export const CAST_IDS = CAST.map((c) => c.id);
export const castById = (id: string | null | undefined) => (id ? CAST.find((c) => c.id === id) : undefined);
