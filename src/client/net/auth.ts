/**
 * Authentification côté navigateur.
 *
 *  - Mode Supabase : inscription, connexion, déconnexion, récupération du mot de passe et
 *    restauration/rafraîchissement de session sont assurés par Supabase Auth (session conservée
 *    dans le stockage du navigateur, jeton d'accès renouvelé automatiquement).
 *  - Mode local (développement) : pseudo + mot de passe auprès du serveur du jeu, jeton opaque.
 *
 * Le reste du client ne voit qu'une chose : `getAccessToken()`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicConfig } from '@shared/protocol';

const TOKEN_KEY = 'ehas.token';

/** Jeton du mode local (persisté : la session survit au rechargement et à la fermeture du navigateur). */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* stockage indisponible : session limitée à l'onglet */
    }
  },
};

let config: PublicConfig | null = null;
let supabase: SupabaseClient | null = null;
let configPromise: Promise<PublicConfig> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lit la configuration publique du serveur. Réessaie tant que le serveur ne répond pas
 * (un hébergement gratuit peut mettre ~1 min à se réveiller) : ne JAMAIS déconnecter pour ça.
 */
export function loadAuthConfig(onWaiting?: (attempt: number) => void): Promise<PublicConfig> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        if (res.ok) {
          config = (await res.json()) as PublicConfig;
          if (config.auth === 'supabase') {
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
              auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'ehas.auth' },
            });
          }
          return config;
        }
      } catch {
        /* serveur injoignable : on réessaie */
      }
      onWaiting?.(attempt + 1);
      await sleep(Math.min(8000, 1000 * 2 ** Math.min(attempt, 3)));
    }
  })();
  return configPromise;
}

export const authMode = () => config?.auth ?? 'local';

export async function getAccessToken(): Promise<string | null> {
  if (supabase) return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  return tokenStore.get();
}

/** Force le renouvellement du jeton (après un refus « session expirée »). */
export async function refreshAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.refreshSession();
  return error ? null : (data.session?.access_token ?? null);
}

/** Messages Supabase → français. */
function frenchError(message: string, status?: number): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Confirmez d’abord votre adresse e-mail (lien reçu par e-mail).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez votre mot de passe.';
  if (m.includes('password should be') || m.includes('weak password')) return 'Mot de passe trop faible (au moins 6 caractères, idéalement plus).';
  if (m.includes('rate limit') || status === 429) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Adresse e-mail invalide.';
  if (m.includes('same password') || m.includes('different from the old')) return 'Choisissez un mot de passe différent de l’ancien.';
  if (m.includes('fetch') || m.includes('network')) return 'Service de connexion injoignable. Vérifiez votre connexion.';
  return message;
}

function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Connexion par e-mail indisponible sur ce serveur.');
  return supabase;
}

export const supabaseAuth = {
  async signUp(email: string, password: string, username: string): Promise<{ needsConfirmation: boolean }> {
    const sb = requireSupabase();
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: location.origin } });
    if (error) throw new Error(frenchError(error.message, error.status));
    // E-mail déjà inscrit : Supabase renvoie un utilisateur sans identité (pour ne pas révéler les comptes)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      throw new Error('Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez votre mot de passe.');
    return { needsConfirmation: !data.session };
  },
  async signIn(email: string, password: string) {
    const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(frenchError(error.message, error.status));
  },
  async signOut() {
    await supabase?.auth.signOut().catch(() => {});
  },
  async requestReset(email: string) {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) throw new Error(frenchError(error.message, error.status));
  },
  async updatePassword(password: string) {
    const { error } = await requireSupabase().auth.updateUser({ password });
    if (error) throw new Error(frenchError(error.message, error.status));
  },
  /** Évènements de session : récupération de mot de passe, déconnexion ailleurs, renouvellement. */
  onChange(fn: (event: string) => void) {
    return supabase?.auth.onAuthStateChange((event) => fn(event)).data.subscription;
  },
};
