/**
 * Musique selon l'écran (abonnement direct au store, indépendant de l'arbre React) :
 *   menus, salon            → 'menu'
 *   cinématique             → silence pendant le chargement, puis 'intro' (lancée par la cinématique)
 *   partie                  → 'investigation', seulement une fois la cinématique refermée
 * Une seule cue à la fois, toujours en fondu : pas de coupure, pas de chevauchement.
 */
import { useStore, type Screen } from './store';
import { music } from './audio';

export function startMusicRouting() {
  let last = '';
  const route = (screen: Screen, introActive: boolean) => {
    const key = `${screen}|${introActive}`;
    if (key === last) return;
    last = key;
    if (introActive) {
      if (music.current !== 'intro') music.stop({ fade: 2.5 });
    } else if (screen === 'game') music.play('investigation', { fade: 6 });
    else if (screen !== 'boot') music.play('menu', { fade: 4 });
  };
  const s = useStore.getState();
  route(s.screen, !!s.intro);
  return useStore.subscribe((st) => route(st.screen, !!st.intro));
}
