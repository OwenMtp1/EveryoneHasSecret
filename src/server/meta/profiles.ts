/**
 * Profils : statistiques publiques d'un compte. Le personnage n'est plus lié au compte :
 * il est choisi dans le salon de chaque partie (catalogue de personnages prédéfinis).
 */
import type { MetaStore } from './store';

export class ProfileService {
  constructor(private store: MetaStore) {}

  getStats(userId: string) {
    return this.store.getStats(userId);
  }

  recordGame(userId: string, won: boolean) {
    return this.store.recordGame(userId, won);
  }
}
