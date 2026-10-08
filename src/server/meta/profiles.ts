/**
 * Profils et personnages. User (compte) ≠ Profile (stats publiques) ≠ Character (identité en jeu).
 */
import type { Character } from '@shared/types';
import { validateCharacter } from '@shared/content/character';
import type { DB } from './db';
import { UserError } from '../util';

interface CharacterRow {
  first_name: string;
  last_name: string;
  appearance: string;
  skin_tone: string;
  hair_style_id: string;
  hair_color: string;
  outfit_id: string;
}

export class ProfileService {
  private cache = new Map<string, Character | null>();

  constructor(private db: DB) {}

  getCharacter(userId: string): Character | null {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    const r = this.db.prepare('SELECT * FROM characters WHERE user_id = ?').get(userId) as CharacterRow | undefined;
    const c: Character | null = r
      ? {
          firstName: r.first_name,
          lastName: r.last_name,
          appearance: r.appearance as Character['appearance'],
          skinTone: r.skin_tone,
          hairStyleId: r.hair_style_id,
          hairColor: r.hair_color,
          outfitId: r.outfit_id,
        }
      : null;
    this.cache.set(userId, c);
    return c;
  }

  saveCharacter(userId: string, input: unknown): Character {
    const v = validateCharacter(input);
    if (!v.ok) throw new UserError(v.error);
    const c = v.value;
    this.db
      .prepare(
        `INSERT INTO characters (user_id, first_name, last_name, appearance, skin_tone, hair_style_id, hair_color, outfit_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, appearance=excluded.appearance,
           skin_tone=excluded.skin_tone, hair_style_id=excluded.hair_style_id, hair_color=excluded.hair_color, outfit_id=excluded.outfit_id,
           updated_at=excluded.updated_at`,
      )
      .run(userId, c.firstName, c.lastName, c.appearance, c.skinTone, c.hairStyleId, c.hairColor, c.outfitId, Date.now());
    this.cache.set(userId, c);
    return c;
  }

  getStats(userId: string): { gamesPlayed: number; gamesWon: number } {
    const r = this.db.prepare('SELECT games_played, games_won FROM profiles WHERE user_id = ?').get(userId) as
      | { games_played: number; games_won: number }
      | undefined;
    return { gamesPlayed: r?.games_played ?? 0, gamesWon: r?.games_won ?? 0 };
  }

  recordGame(userId: string, won: boolean) {
    this.db.prepare('UPDATE profiles SET games_played = games_played + 1, games_won = games_won + ? WHERE user_id = ?').run(won ? 1 : 0, userId);
  }

  /** Nom affiché : identité du personnage si créée, sinon pseudo. */
  displayName(userId: string, fallback: string): string {
    const c = this.getCharacter(userId);
    return c ? `${c.firstName} ${c.lastName}` : fallback;
  }
}
