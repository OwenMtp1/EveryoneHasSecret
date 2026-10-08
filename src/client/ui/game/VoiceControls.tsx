import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '../../store';
import { voice } from '../../voice';

function useVoice() {
  return useSyncExternalStore(
    (cb) => voice.subscribe(cb),
    () => `${voice.enabled}|${voice.muted}|${[...voice.speaking].join(',')}|${voice.error ?? ''}`,
  );
}

/** Bouton micro du HUD : activer le vocal, couper le micro (touche N). */
export function VoiceControls() {
  useVoice();
  const game = useStore((s) => s.game);

  useEffect(() => {
    voice.setView(game);
  }, [game]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.code === 'KeyN' && voice.enabled) voice.setMuted(!voice.muted);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      voice.disable();
    };
  }, []);

  const meSpeaking = !!game && voice.speaking.has(game.you);
  const others = game ? [...voice.speaking].filter((id) => id !== game.you).map((id) => game.players.find((p) => p.id === id)?.name.split(' ')[0]).filter(Boolean) : [];
  if (!voice.enabled)
    return (
      <button className="btn btn-sm voice-btn" onClick={() => voice.enable()} title={voice.error ?? 'Chat vocal de proximité : on n’entend que ceux qu’on voit'}>
        🎙 {voice.error ? 'Micro indisponible' : 'Activer le vocal'}
      </button>
    );
  return (
    <div className="voice-ctl">
      {others.length > 0 && <span className="voice-speakers">🔊 {others.join(', ')}</span>}
      <button className={`btn btn-sm voice-btn ${voice.muted ? 'muted' : ''} ${meSpeaking ? 'speaking' : ''}`} onClick={() => voice.setMuted(!voice.muted)} title="Couper / rétablir le micro (N)">
        {voice.muted ? '🔇 Micro coupé' : '🎙 Micro'} <kbd>N</kbd>
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => voice.disable()} title="Quitter le vocal">✕</button>
    </div>
  );
}
