/**
 * Mise à jour d'une base SQLite existante (format de la version précédente) : les comptes, sessions,
 * amitiés et notifications sont conservés, les nouvelles tables sont ajoutées sans rien effacer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { SqliteStore } from '../src/server/meta/store';
import { AuthService } from '../src/server/meta/auth';

test('base existante : comptes et sessions conservés après mise à jour', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ehas-')), 'old.sqlite');
  const old = new DatabaseSync(path);
  old.exec(readFileSync('tests/fixtures/schema-v0.12.sql', 'utf8'));
  const salt = randomBytes(16);
  const hash = `scrypt$${salt.toString('hex')}$${scryptSync('ancien-mdp', salt, 64).toString('hex')}`;
  old.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run('u-old', 'Ancien', hash, 1_700_000_000_000);
  old.prepare('INSERT INTO profiles (user_id, games_played, games_won) VALUES (?, 7, 3)').run('u-old');
  old.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run('jeton-existant-0123456789', 'u-old', Date.now(), Date.now() + 86_400_000);
  old.prepare("INSERT INTO characters (user_id, first_name, last_name, appearance, skin_tone, hair_style_id, hair_color, outfit_id, updated_at) VALUES ('u-old', 'A', 'B', 'masculine', 's', 'h', 'c', 'o', 0)").run();
  old.close();

  const store = new SqliteStore(path);
  const auth = new AuthService(store);
  // session existante toujours valide, connexion avec l'ancien mot de passe, statistiques conservées
  assert.equal((await auth.resolveUser('jeton-existant-0123456789'))?.username, 'Ancien');
  assert.equal((await auth.login('ancien', 'ancien-mdp')).user.id, 'u-old');
  assert.deepEqual(await store.getStats('u-old'), { gamesPlayed: 7, gamesWon: 3 });
  // nouvelles tables utilisables
  await store.insertGame({ id: 'g1', lobbyName: 'x', caseType: 'y', summary: 'z', players: ['Ancien'], endedAt: Date.now() }, ['u-old']);
  assert.equal((await store.listHistory('u-old', 5)).length, 1);
  await store.close();
});
