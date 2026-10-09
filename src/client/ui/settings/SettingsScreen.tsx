import { useStore } from '../../store';
import { MenuScreen } from '../common/Screen';
import { audio } from '../../audio';

export function SettingsScreen() {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  return (
    <MenuScreen title="PARAMÈTRES">
      <div className="panel form-panel">
        <label>
          Musique — {Math.round(s.music * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => { audio.unlock(); update({ music: Number(e.target.value) }); }} />
        </label>
        <label>
          Effets sonores — {Math.round(s.sfx * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => { audio.unlock(); update({ sfx: Number(e.target.value) }); audio.click(); }} />
        </label>
        <label className="inline check">
          <input type="checkbox" checked={s.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
          Réduire les animations
        </label>
        <div className="field-label">Contrôles en partie</div>
        <ul className="controls-help">
          <li><kbd>Z Q S D</kbd> / <kbd>W A S D</kbd> / flèches — se déplacer (relatif à la caméra)</li>
          <li>Souris — cliquer dans la vue pour orienter la caméra, <kbd>Échap</kbd> pour libérer · molette : distance</li>
          <li><kbd>V</kbd> — troisième personne ↔ première personne</li>
          <li><kbd>E</kbd> — interagir avec l’élément le plus proche</li>
          <li><kbd>Entrée</kbd> — écrire dans le chat</li>
          <li><kbd>M</kbd> — plan 2D de la villa</li>
          <li><kbd>1</kbd>–<kbd>4</kbd> — onglets (Inventaire, Relations, Carnet, Enquête)</li>
        </ul>
      </div>
    </MenuScreen>
  );
}
