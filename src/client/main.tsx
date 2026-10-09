import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
import { call, getSocket } from './net/socket';
import { voice } from './voice';
import { audio, audioDebug, music } from './audio';
import { startMusicRouting } from './musicRouter';
import './styles.css';

// Accroche de test/débogage (?debug) : n'expose que l'état local du joueur, jamais la vérité serveur.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __ehas: unknown }).__ehas = { store: useStore, call, getSocket, voice, audio, music };
  // état audio : cues actives, sources vivantes, gains des bus, boucles persistantes
  (window as unknown as { __ehasAudio: unknown }).__ehasAudio = audioDebug;
}

startMusicRouting();

createRoot(document.getElementById('root')!).render(<App />);
