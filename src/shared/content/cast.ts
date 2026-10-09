/**
 * Catalogue des personnages prédéfinis : 40 adultes distincts (20 femmes, 20 hommes), amis réunis
 * pour un week-end à la villa. Données pures, partagées par le serveur et le client.
 *
 * Chaque entrée correspond à un modèle 3D Microsoft Rocketbox (licence MIT, voir
 * public/characters/README.md) ; les métadonnées décrivent ce que montrent les rendus
 * (vignette `thumb`, carte en pied `card`) : à garder cohérentes si un modèle change.
 * Les identifiants sont stables (sauvegardes, scénarios) : ne jamais les réattribuer.
 */
import type { Appearance } from '../types';

export interface CastMember {
  id: string;
  firstName: string;
  lastName: string;
  gender: Appearance;
  /** âge approximatif (ans) */
  age: number;
  /** silhouette : mince, moyenne, athlétique, forte */
  build: string;
  /** taille (m) : le modèle 3D est mis à cette échelle */
  heightM: number;
  /** teint de peau */
  skin: string;
  hair: { length: string; color: string; texture: string };
  outfit: { top: string; bottom: string; shoes: string; accessories?: string };
  /** couleurs dominantes du haut et du bas */
  colors: { top: string; bottom: string };
  /** description « police scientifique » de la fibre du vêtement principal */
  fiber: string;
  /** une phrase de présentation */
  description: string;
  /** modèle 3D (GLB) */
  model: string;
  /** vignette tête et épaules 256×320 */
  thumb: string;
  /** carte en pied 240×480 */
  card: string;
  /** avatar Rocketbox d'origine */
  source: string;
}

type Entry = Omit<CastMember, 'model' | 'thumb' | 'card'>;

const ENTRIES: Entry[] = [
  // ───────────── Femmes ─────────────
  {
    id: 'f01', firstName: 'Camille', lastName: 'Durand', gender: 'feminine', age: 29, build: 'mince', heightM: 1.68,
    skin: 'claire', hair: { length: 'long', color: 'blond', texture: 'raides, en queue de cheval' },
    outfit: { top: 'chemise cintrée rose à manches retroussées', bottom: 'jean bleu délavé', shoes: 'ballerines marron foncé' },
    colors: { top: '#d9697f', bottom: '#4a6a8f' }, fiber: 'coton rose',
    description: 'Une blonde souriante en chemise rose et jean délavé, cheveux noués en queue de cheval.', source: 'Female_Adult_01',
  },
  {
    id: 'f02', firstName: 'Hélène', lastName: 'Marchand', gender: 'feminine', age: 52, build: 'moyenne', heightM: 1.64,
    skin: 'claire', hair: { length: 'mi-long', color: 'brun foncé', texture: 'raides, tirés en arrière' },
    outfit: { top: 'pull col V crème sur chemisier blanc', bottom: 'jupe en jean au genou', shoes: 'escarpins noirs', accessories: 'collier de perles' },
    colors: { top: '#e4e0d4', bottom: '#3d5470' }, fiber: 'maille de laine écrue',
    description: 'La cinquantaine soignée, pull crème, jupe en jean et collier de perles.', source: 'Female_Adult_02',
  },
  {
    id: 'f03', firstName: 'Maï', lastName: 'Tran', gender: 'feminine', age: 26, build: 'mince', heightM: 1.60,
    skin: 'claire olivâtre', hair: { length: 'mi-long', color: 'noir', texture: 'raides, mèche sur le côté' },
    outfit: { top: 'top à bretelles violet noué à la taille', bottom: 'pantalon slim noir', shoes: 'ballerines noires', accessories: 'bracelet violet, tatouage sur le bras gauche' },
    colors: { top: '#9a2fb0', bottom: '#1e1e22' }, fiber: 'jersey de viscose violet',
    description: 'Une jeune femme brune en top violet à bretelles, un petit tatouage sur l’épaule.', source: 'Female_Adult_03',
  },
  {
    id: 'f04', firstName: 'Solène', lastName: 'Keller', gender: 'feminine', age: 28, build: 'athlétique', heightM: 1.72,
    skin: 'très claire', hair: { length: 'mi-long', color: 'blond platine', texture: 'tressés en arrière' },
    outfit: { top: 'blouson de cuir marron à capuche sur débardeur noir', bottom: 'pantalon cargo kaki', shoes: 'bottes noires' },
    colors: { top: '#5a3424', bottom: '#7d7559' }, fiber: 'cuir marron',
    description: 'Blonde platine au look baroudeur : blouson de cuir, cargo kaki et bottes.', source: 'Female_Adult_04',
  },
  {
    id: 'f05', firstName: 'Inès', lastName: 'Moreau', gender: 'feminine', age: 41, build: 'moyenne', heightM: 1.66,
    skin: 'mate', hair: { length: 'court', color: 'noir', texture: 'carré lisse' },
    outfit: { top: 'blazer rose pâle sur chemise bleu ciel', bottom: 'jean bleu', shoes: 'escarpins noirs' },
    colors: { top: '#e6b5b8', bottom: '#45628a' }, fiber: 'tweed de coton rose pâle',
    description: 'Carré noir impeccable, blazer rose pâle sur chemise bleu ciel et jean.', source: 'Female_Adult_05',
  },
  {
    id: 'f06', firstName: 'Yasmina', lastName: 'Haddad', gender: 'feminine', age: 36, build: 'moyenne', heightM: 1.63,
    skin: 'mate', hair: { length: 'couverts', color: 'brun', texture: 'sous un foulard' },
    outfit: { top: 'longue tunique kaki', bottom: 'pantalon kaki assorti', shoes: 'ballerines noires', accessories: 'grand foulard blanc à franges' },
    colors: { top: '#8d7c45', bottom: '#8d7c45' }, fiber: 'toile de coton kaki',
    description: 'Un foulard blanc à franges sur une longue tunique kaki assortie à son pantalon.', source: 'Female_Adult_06',
  },
  {
    id: 'f07', firstName: 'Claire', lastName: 'Vasseur', gender: 'feminine', age: 34, build: 'mince', heightM: 1.70,
    skin: 'claire', hair: { length: 'long', color: 'châtain', texture: 'raides, en chignon' },
    outfit: { top: 'veste ceinturée chocolat sur top fuchsia', bottom: 'jean clair', shoes: 'bottes hautes marron' },
    colors: { top: '#3e2a22', bottom: '#7f97b3' }, fiber: 'velours côtelé chocolat',
    description: 'Châtain en chignon, veste chocolat ceinturée, jean clair et bottes hautes.', source: 'Female_Adult_07',
  },
  {
    id: 'f08', firstName: 'Julie', lastName: 'Lambert', gender: 'feminine', age: 27, build: 'mince', heightM: 1.67,
    skin: 'claire', hair: { length: 'long', color: 'brun foncé', texture: 'raides' },
    outfit: { top: 'tee-shirt gris chiné à motif', bottom: 'jean bleu déchiré avec ceinture', shoes: 'bottines marron' },
    colors: { top: '#9a9a98', bottom: '#4b6d96' }, fiber: 'jersey de coton gris chiné',
    description: 'Longs cheveux bruns, tee-shirt gris imprimé et jean déchiré.', source: 'Female_Adult_08',
  },
  {
    id: 'f09', firstName: 'Sophie', lastName: 'Girardin', gender: 'feminine', age: 46, build: 'moyenne', heightM: 1.65,
    skin: 'claire', hair: { length: 'mi-long', color: 'châtain clair', texture: 'raides, attachés' },
    outfit: { top: 'long gilet en maille taupe sur chemisier blanc', bottom: 'pantalon noir', shoes: 'ballerines marron', accessories: 'collier' },
    colors: { top: '#7a6a58', bottom: '#202022' }, fiber: 'grosse maille de laine taupe',
    description: 'Un long gilet taupe en grosse maille sur un chemisier blanc, pantalon noir.', source: 'Female_Adult_09',
  },
  {
    id: 'f10', firstName: 'Maëlle', lastName: 'Jean-Baptiste', gender: 'feminine', age: 31, build: 'mince', heightM: 1.69,
    skin: 'métisse', hair: { length: 'mi-long', color: 'brun foncé', texture: 'bouclés, en chignon' },
    outfit: { top: 'robe pull chocolat à large ceinture', bottom: 'robe courte (jambes nues)', shoes: 'bottes hautes marron' },
    colors: { top: '#4a2c20', bottom: '#4a2c20' }, fiber: 'maille de laine chocolat',
    description: 'Métisse aux boucles relevées en chignon, robe pull chocolat et bottes hautes.', source: 'Female_Adult_11',
  },
  {
    id: 'f11', firstName: 'Chloé', lastName: 'Tremblay', gender: 'feminine', age: 22, build: 'mince', heightM: 1.62,
    skin: 'claire', hair: { length: 'long', color: 'noir', texture: 'raides, frange et queue de cheval' },
    outfit: { top: 'sweat zippé noir à capuche, liserés verts et motif violet', bottom: 'bermuda en jean retroussé', shoes: 'baskets noires et vertes' },
    colors: { top: '#1d1f1d', bottom: '#3c5370' }, fiber: 'molleton de coton noir',
    description: 'La plus jeune : frange noire, sweat à capuche zippé et bermuda en jean.', source: 'Female_Adult_12',
  },
  {
    id: 'f12', firstName: 'Anne-Sophie', lastName: 'Dubois', gender: 'feminine', age: 38, build: 'mince', heightM: 1.71,
    skin: 'claire', hair: { length: 'court', color: 'blond', texture: 'coupe garçonne' },
    outfit: { top: 'gilet sans manches gris sur top noir', bottom: 'jean bleu', shoes: 'bottines noires à talon' },
    colors: { top: '#5f5f5f', bottom: '#40618d' }, fiber: 'lainage gris anthracite',
    description: 'Cheveux blonds très courts, gilet gris cintré sur top noir et jean.', source: 'Female_Adult_13',
  },
  {
    id: 'f13', firstName: 'Émilie', lastName: 'Rousseau', gender: 'feminine', age: 35, build: 'moyenne', heightM: 1.66,
    skin: 'claire', hair: { length: 'mi-long', color: 'châtain', texture: 'carré dégradé' },
    outfit: { top: 'gilet cache-cœur beige à col châle', bottom: 'jean brut', shoes: 'bottes marron' },
    colors: { top: '#b9a78c', bottom: '#2b3445' }, fiber: 'maille côtelée beige',
    description: 'Carré châtain, gilet cache-cœur beige noué à la taille, jean brut et bottes.', source: 'Female_Adult_14',
  },
  {
    id: 'f14', firstName: 'Margaux', lastName: 'de Villiers', gender: 'feminine', age: 32, build: 'mince', heightM: 1.74,
    skin: 'claire', hair: { length: 'long', color: 'auburn', texture: 'ondulés' },
    outfit: { top: 'chemise satinée bleu-violet', bottom: 'jupe crayon noire', shoes: 'bottes hautes noires', accessories: 'collier de perles' },
    colors: { top: '#4b4f8c', bottom: '#151515' }, fiber: 'satin de soie bleu-violet',
    description: 'Longs cheveux auburn, chemise satinée bleu-violet et jupe crayon noire.', source: 'Female_Adult_15',
  },
  {
    id: 'f15', firstName: 'Léa', lastName: 'Mercier', gender: 'feminine', age: 25, build: 'mince', heightM: 1.68,
    skin: 'claire', hair: { length: 'long', color: 'blond', texture: 'raides, en chignon' },
    outfit: { top: 'tee-shirt vert menthe à bord blanc', bottom: 'jean slim bleu clair', shoes: 'ballerines beiges', accessories: 'bracelet' },
    colors: { top: '#5fb88a', bottom: '#93b6d6' }, fiber: 'jersey de coton vert menthe',
    description: 'Blonde décontractée en tee-shirt vert menthe et jean clair.', source: 'Female_Adult_17',
  },
  {
    id: 'f16', firstName: 'Jessica', lastName: 'Vandamme', gender: 'feminine', age: 24, build: 'mince', heightM: 1.70,
    skin: 'claire', hair: { length: 'mi-long', color: 'blond doré', texture: 'bouclés' },
    outfit: { top: 'caraco blanc en dentelle sur top turquoise', bottom: 'mini-short en jean clair', shoes: 'bottes blanches montantes', accessories: 'boucles d’oreilles turquoise, pendentif' },
    colors: { top: '#ecebe8', bottom: '#8fb0cc' }, fiber: 'dentelle de coton blanche',
    description: 'Boucles blondes, caraco blanc en dentelle, mini-short et bottes blanches : tenue de fête.', source: 'Female_Party_01',
  },
  {
    id: 'f17', firstName: 'Naomi', lastName: 'Kouassi', gender: 'feminine', age: 28, build: 'mince', heightM: 1.67,
    skin: 'métisse', hair: { length: 'mi-long', color: 'noir', texture: 'crépus, volumineux' },
    outfit: { top: 'haut à motifs losanges sombres, ceinturé', bottom: 'minijupe noire', shoes: 'sandales noires à brides', accessories: 'créoles dorées' },
    colors: { top: '#3a2d2e', bottom: '#151515' }, fiber: 'jersey imprimé brun et rose',
    description: 'Une chevelure afro volumineuse, créoles dorées, haut à losanges et minijupe noire.', source: 'Female_Party_02',
  },
  {
    id: 'f18', firstName: 'Fatou', lastName: 'Ndiaye', gender: 'feminine', age: 33, build: 'mince', heightM: 1.75,
    skin: 'foncée', hair: { length: 'court', color: 'noir', texture: 'courts et lissés' },
    outfit: { top: 'veste de tailleur noire sur chemise blanche', bottom: 'pantalon de tailleur noir', shoes: 'escarpins noirs' },
    colors: { top: '#18181a', bottom: '#18181a' }, fiber: 'laine peignée noire',
    description: 'Silhouette élancée en tailleur-pantalon noir et chemise blanche, cheveux courts.', source: 'Business_Female_01',
  },
  {
    id: 'f19', firstName: 'Brigitte', lastName: 'Morel', gender: 'feminine', age: 57, build: 'moyenne', heightM: 1.63,
    skin: 'claire', hair: { length: 'court', color: 'blond cendré', texture: 'carré' },
    outfit: { top: 'blazer croisé en tweed bordeaux sur col roulé rayé', bottom: 'pantalon noir', shoes: 'chaussures noires', accessories: 'lunettes fines' },
    colors: { top: '#6b2228', bottom: '#1c1a1a' }, fiber: 'tweed de laine bordeaux',
    description: 'La doyenne des femmes : lunettes fines, blazer en tweed bordeaux et col roulé rayé.', source: 'Business_Female_02',
  },
  {
    id: 'f20', firstName: 'Valérie', lastName: 'Chen', gender: 'feminine', age: 45, build: 'moyenne', heightM: 1.61,
    skin: 'claire', hair: { length: 'court', color: 'noir', texture: 'dégradé ébouriffé' },
    outfit: { top: 'veste de tailleur taupe sur chemisier marron', bottom: 'jupe droite taupe au genou', shoes: 'escarpins beiges' },
    colors: { top: '#86705e', bottom: '#7a6656' }, fiber: 'gabardine de laine taupe',
    description: 'Cheveux noirs courts, tailleur jupe taupe et chemisier marron.', source: 'Business_Female_03',
  },
  // ───────────── Hommes ─────────────
  {
    id: 'm01', firstName: 'Thomas', lastName: 'Bernard', gender: 'masculine', age: 28, build: 'mince', heightM: 1.80,
    skin: 'claire', hair: { length: 'court', color: 'châtain', texture: 'raides' },
    outfit: { top: 'polo blanc à rayures marron, col marron', bottom: 'bermuda chino beige', shoes: 'baskets en toile grises' },
    colors: { top: '#e7e2d8', bottom: '#c2ae86' }, fiber: 'piqué de coton blanc rayé',
    description: 'Un grand châtain en polo rayé, bermuda beige et baskets en toile.', source: 'Male_Adult_01',
  },
  {
    id: 'm02', firstName: 'Julien', lastName: 'Fontaine', gender: 'masculine', age: 31, build: 'mince', heightM: 1.78,
    skin: 'claire', hair: { length: 'court', color: 'brun foncé', texture: 'ondulés' },
    outfit: { top: 'pull col V beige à torsades', bottom: 'pantalon brun foncé', shoes: 'chaussures de cuir marron' },
    colors: { top: '#cdb99a', bottom: '#2c241e' }, fiber: 'maille de laine beige',
    description: 'Brun aux cheveux ondulés, pull beige à col V et pantalon brun.', source: 'Male_Adult_02',
  },
  {
    id: 'm03', firstName: 'Bernard', lastName: 'Lacroix', gender: 'masculine', age: 63, build: 'moyenne', heightM: 1.76,
    skin: 'claire', hair: { length: 'court', color: 'gris blanc', texture: 'raides' },
    outfit: { top: 'veste en tweed à carreaux brun-gris sur chemise bordeaux', bottom: 'pantalon noir', shoes: 'chaussures noires' },
    colors: { top: '#5b5248', bottom: '#1b1b1d' }, fiber: 'tweed de laine brun-gris',
    description: 'Le plus âgé : cheveux blancs, veste en tweed et chemise bordeaux.', source: 'Male_Adult_03',
  },
  {
    id: 'm04', firstName: 'Samuel', lastName: 'Mensah', gender: 'masculine', age: 27, build: 'moyenne', heightM: 1.83,
    skin: 'foncée', hair: { length: 'mi-long', color: 'noir', texture: 'crépus (afro)' },
    outfit: { top: 'blouson de cuir noir à capuche grise, tee-shirt turquoise imprimé', bottom: 'pantalon brun-kaki usé', shoes: 'baskets blanches et roses' },
    colors: { top: '#1f1f1f', bottom: '#4a4232' }, fiber: 'cuir noir',
    description: 'Coupe afro et barbe naissante, blouson de cuir noir sur tee-shirt turquoise.', source: 'Male_Adult_04',
  },
  {
    id: 'm05', firstName: 'Gérard', lastName: 'Poulain', gender: 'masculine', age: 56, build: 'forte', heightM: 1.77,
    skin: 'claire', hair: { length: 'court', color: 'gris', texture: 'raides, barbe grise' },
    outfit: { top: 'gilet multipoche beige sur tee-shirt manches longues vert', bottom: 'pantalon de toile marron', shoes: 'chaussures de marche fauves' },
    colors: { top: '#d1bd8f', bottom: '#5a3f2c' }, fiber: 'toile de coton beige',
    description: 'Barbe grise et gilet multipoche beige de photographe sur un tee-shirt vert.', source: 'Male_Adult_05',
  },
  {
    id: 'm06', firstName: 'Hugo', lastName: 'Leroy', gender: 'masculine', age: 25, build: 'mince', heightM: 1.79,
    skin: 'claire', hair: { length: 'mi-court', color: 'châtain', texture: 'ondulés' },
    outfit: { top: 'tee-shirt rouge à manches longues col tunisien', bottom: 'jean bleu foncé', shoes: 'baskets grises', accessories: 'bracelet de force noir' },
    colors: { top: '#b8231f', bottom: '#2c3c56' }, fiber: 'jersey de coton rouge',
    description: 'Jeune châtain en haut rouge à col tunisien et jean foncé.', source: 'Male_Adult_06',
  },
  {
    id: 'm07', firstName: 'Antoine', lastName: 'Rossi', gender: 'masculine', age: 36, build: 'moyenne', heightM: 1.75,
    skin: 'mate', hair: { length: 'court', color: 'noir', texture: 'raides, coiffés en avant' },
    outfit: { top: 'veste de laine grise sur chemise rouille', bottom: 'jean bleu', shoes: 'chaussures marron' },
    colors: { top: '#47474a', bottom: '#45679a' }, fiber: 'drap de laine gris',
    description: 'Teint mat, veste de laine grise sur chemise rouille et jean.', source: 'Male_Adult_07',
  },
  {
    id: 'm08', firstName: 'Maxime', lastName: 'Girard', gender: 'masculine', age: 30, build: 'athlétique', heightM: 1.84,
    skin: 'claire', hair: { length: 'court', color: 'châtain', texture: 'courts en brosse' },
    outfit: { top: 'chemise bleu ciel manches retroussées sur tee-shirt blanc', bottom: 'jean brut', shoes: 'chaussures noires' },
    colors: { top: '#a9c6e8', bottom: '#2a3550' }, fiber: 'popeline de coton bleu ciel',
    description: 'Cheveux en brosse, chemise bleu ciel ouverte sur un tee-shirt blanc, jean brut.', source: 'Male_Adult_08',
  },
  {
    id: 'm09', firstName: 'Kenji', lastName: 'Arnaud', gender: 'masculine', age: 30, build: 'mince', heightM: 1.74,
    skin: 'claire', hair: { length: 'long', color: 'noir', texture: 'raides, en queue de cheval' },
    outfit: { top: 'tee-shirt noir imprimé « End of the road »', bottom: 'jean très délavé', shoes: 'chaussures marron' },
    colors: { top: '#1b1c22', bottom: '#8fa6c0' }, fiber: 'jersey de coton noir',
    description: 'Longs cheveux noirs attachés, tee-shirt noir imprimé et jean délavé.', source: 'Male_Adult_09',
  },
  {
    id: 'm10', firstName: 'Minh', lastName: 'Pham', gender: 'masculine', age: 24, build: 'mince', heightM: 1.71,
    skin: 'claire dorée', hair: { length: 'court', color: 'noir', texture: 'raides' },
    outfit: { top: 'veste de survêtement rouge à bandes blanches', bottom: 'pantalon de survêtement noir', shoes: 'baskets blanches' },
    colors: { top: '#9c1e22', bottom: '#1e1f22' }, fiber: 'polyester rouge',
    description: 'Look sportswear : veste de survêtement rouge à bandes blanches et pantalon noir.', source: 'Male_Adult_10',
  },
  {
    id: 'm11', firstName: 'Ibrahima', lastName: 'Sow', gender: 'masculine', age: 32, build: 'moyenne', heightM: 1.85,
    skin: 'foncée', hair: { length: 'ras', color: 'noir', texture: 'crépus, coupés ras' },
    outfit: { top: 'veste en jean sur tee-shirt blanc', bottom: 'jean clair délavé', shoes: 'baskets blanches' },
    colors: { top: '#3d5677', bottom: '#8ea7c4' }, fiber: 'denim indigo',
    description: 'Cheveux ras, veste en jean sur tee-shirt blanc et jean délavé.', source: 'Male_Adult_12',
  },
  {
    id: 'm12', firstName: 'Philippe', lastName: 'Charpentier', gender: 'masculine', age: 52, build: 'mince', heightM: 1.78,
    skin: 'claire', hair: { length: 'court', color: 'châtain clair', texture: 'dégarni' },
    outfit: { top: 'gilet zippé à losanges noir, gris et blanc', bottom: 'jean bleu', shoes: 'chaussures marron' },
    colors: { top: '#3a3a3c', bottom: '#46658f' }, fiber: 'maille jacquard acrylique',
    description: 'Front dégarni, gilet à losanges noir et blanc zippé sur un jean.', source: 'Male_Adult_13',
  },
  {
    id: 'm13', firstName: 'Karim', lastName: 'Belkacem', gender: 'masculine', age: 27, build: 'moyenne', heightM: 1.76,
    skin: 'mate', hair: { length: 'court', color: 'noir', texture: 'sous une casquette, barbe courte' },
    outfit: { top: 'coupe-vent zippé bleu roi, blanc et noir', bottom: 'jean bleu', shoes: 'baskets blanches', accessories: 'casquette noire' },
    colors: { top: '#1f45b0', bottom: '#4a6890' }, fiber: 'nylon bleu roi',
    description: 'Casquette noire, barbe courte et coupe-vent bleu roi et blanc.', source: 'Male_Adult_17',
  },
  {
    id: 'm14', firstName: 'Moussa', lastName: 'Traoré', gender: 'masculine', age: 23, build: 'mince', heightM: 1.82,
    skin: 'foncée', hair: { length: 'ras', color: 'noir', texture: 'sous la capuche' },
    outfit: { top: 'sweat à capuche gris chiné', bottom: 'pantalon noir', shoes: 'baskets vert foncé' },
    colors: { top: '#8b857c', bottom: '#1d1d1f' }, fiber: 'molleton de coton gris chiné',
    description: 'Capuche grise relevée, pantalon noir et baskets vert foncé.', source: 'Male_Adult_18',
  },
  {
    id: 'm15', firstName: 'Nicolas', lastName: 'Petit', gender: 'masculine', age: 35, build: 'moyenne', heightM: 1.80,
    skin: 'claire', hair: { length: 'court', color: 'brun', texture: 'raides, barbe de trois jours' },
    outfit: { top: 'sweat à capuche marron', bottom: 'jean brut', shoes: 'baskets noires' },
    colors: { top: '#4a2e22', bottom: '#2c3a52' }, fiber: 'molleton de coton marron',
    description: 'Barbe de trois jours, sweat à capuche marron et jean brut.', source: 'Male_Adult_20',
  },
  {
    id: 'm16', firstName: 'Laurent', lastName: 'Dumas', gender: 'masculine', age: 49, build: 'moyenne', heightM: 1.77,
    skin: 'claire', hair: { length: 'rasé', color: 'aucun', texture: 'crâne rasé' },
    outfit: { top: 'gilet de costume anthracite sur chemise gris-vert', bottom: 'pantalon gris foncé', shoes: 'chaussures noires' },
    colors: { top: '#2f302e', bottom: '#2a2a2a' }, fiber: 'flanelle de laine anthracite',
    description: 'Crâne rasé, gilet de costume anthracite sur une chemise gris-vert.', source: 'Business_Male_04',
  },
  {
    id: 'm17', firstName: 'Olivier', lastName: 'Baptiste', gender: 'masculine', age: 37, build: 'mince', heightM: 1.81,
    skin: 'métisse', hair: { length: 'ras', color: 'noir', texture: 'coupés ras' },
    outfit: { top: 'costume sombre à carreaux, chemise violette', bottom: 'pantalon de costume assorti', shoes: 'chaussures noires', accessories: 'cravate noire' },
    colors: { top: '#25252a', bottom: '#25252a' }, fiber: 'laine à carreaux gris foncé',
    description: 'Élégant en costume sombre à carreaux, chemise violette et cravate noire.', source: 'Business_Male_05',
  },
  {
    id: 'm18', firstName: 'Michel', lastName: 'Gauthier', gender: 'masculine', age: 59, build: 'forte', heightM: 1.74,
    skin: 'claire', hair: { length: 'chauve', color: 'gris', texture: 'couronne rase' },
    outfit: { top: 'chemise blanche, cravate rayée grise', bottom: 'jean bleu clair', shoes: 'chaussures noires' },
    colors: { top: '#eceef0', bottom: '#7d97b8' }, fiber: 'popeline de coton blanche',
    description: 'Corpulent et chauve, chemise blanche et cravate rayée portées avec un jean.', source: 'Business_Male_07',
  },
  {
    id: 'm19', firstName: 'Arjun', lastName: 'Pillai', gender: 'masculine', age: 40, build: 'moyenne', heightM: 1.75,
    skin: 'brune', hair: { length: 'court', color: 'noir', texture: 'sous une casquette, barbe courte' },
    outfit: { top: 'chemise en jean bleu clair', bottom: 'jean avec ceinture marron', shoes: 'chaussures marron', accessories: 'casquette beige' },
    colors: { top: '#a9c1d8', bottom: '#5c80ab' }, fiber: 'chambray de coton bleu clair',
    description: 'Casquette beige, barbe courte, chemise en jean clair et ceinture de cuir.', source: 'Wood_Male_01',
  },
  {
    id: 'm20', firstName: 'Yann', lastName: 'Le Goff', gender: 'masculine', age: 34, build: 'athlétique', heightM: 1.86,
    skin: 'claire', hair: { length: 'court', color: 'brun foncé', texture: 'sous un bonnet, barbe fournie' },
    outfit: { top: 'chemise de flanelle à carreaux rouges', bottom: 'jean retroussé', shoes: 'boots noires', accessories: 'bonnet noir' },
    colors: { top: '#b0232a', bottom: '#5e7ea6' }, fiber: 'flanelle de coton à carreaux rouges',
    description: 'Bonnet noir et barbe fournie, chemise de bûcheron rouge et jean retroussé sur des boots.', source: 'Delivery_Male_01',
  },
];

export const CAST: CastMember[] = ENTRIES.map((e) => ({
  ...e,
  model: `/characters/${e.id}.glb`,
  thumb: `/characters/thumbs/${e.id}.jpg`,
  card: `/characters/cards/${e.id}.jpg`,
}));

export const CAST_IDS: string[] = CAST.map((c) => c.id);

const BY_ID = new Map(CAST.map((c) => [c.id, c]));

export function castById(id: string | null | undefined): CastMember | undefined {
  return id ? BY_ID.get(id) : undefined;
}
