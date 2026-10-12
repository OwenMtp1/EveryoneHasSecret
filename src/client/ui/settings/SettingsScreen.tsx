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
        <label>
          Qualité graphique
          <select value={String(s.quality)} onChange={(e) => update({ quality: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 0 | 1 | 2) })}>
            <option value="auto">Automatique (selon la fluidité)</option>
            <option value="0">Élevée — occlusion, halo, ombres</option>
            <option value="1">Moyenne — sans halo ni occlusion</option>
            <option value="2">Basse — sans ombres, résolution réduite</option>
          </select>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={s.comic} onChange={(e) => update({ comic: e.target.checked })} />
          Style dessiné (aplats de couleur et contours encrés)
        </label>
        <label className="inline check">
          <input type="checkbox" checked={s.showFps} onChange={(e) => update({ showFps: e.target.checked })} />
          Afficher le compteur d’images (<kbd>F3</kbd>)
        </label>
        <div className="field-label">Contrôles en partie</div>
        <ul className="controls-help">
          <li><kbd>Z Q S D</kbd> / <kbd>W A S D</kbd> / flèches — se déplacer (relatif à la caméra)</li>
          <li>Souris — cliquer dans la vue pour orienter la caméra · molette : distance</li>
          <li><kbd>V</kbd> — troisième personne ↔ première personne</li>
          <li><kbd>E</kbd> — action principale sur ce que vous visez · <kbd>F</kbd> — roue d’actions · <kbd>←</kbd> <kbd>→</kbd> — objets empilés</li>
          <li><kbd>Entrée</kbd> — écrire dans le chat · <kbd>P</kbd> — téléphone (messages, photos, pistes, plan)</li>
          <li><kbd>M</kbd> — plan 2D de la villa · <kbd>F3</kbd> — compteur d’images</li>
          <li><kbd>1</kbd>–<kbd>4</kbd> — Dossier, Inventaire, Enquête, Relations · <kbd>5</kbd> — Chronique</li>
          <li><kbd>N</kbd> — couper ou rétablir le micro · <kbd>Échap</kbd> — votre histoire, réglages, quitter</li>
          <li>Fantôme : <kbd>Espace</kbd> / <kbd>C</kbd> monter et descendre, <kbd>F</kbd> suivre un joueur</li>
        </ul>
      </div>
    </MenuScreen>
  );
}
