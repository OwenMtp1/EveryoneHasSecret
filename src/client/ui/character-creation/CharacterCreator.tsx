import { useMemo, useState } from 'react';
import type { Character } from '@shared/types';
import {
  APPEARANCES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKIN_TONES,
  randomCharacter,
  validateCharacter,
} from '@shared/content/character';
import { Avatar } from '../common/Avatar';
import { Stage3D } from '../common/Stage3D';
import { api } from '../../net/api';
import { useStore } from '../../store';
import { audio } from '../../audio';

type Tab = 'identity' | 'hair' | 'outfit';

export function CharacterCreator() {
  const existing = useStore((s) => s.character);
  const setCharacter = useStore((s) => s.setCharacter);
  const go = useStore((s) => s.go);
  const [c, setC] = useState<Character>(() => existing ?? { ...randomCharacter(), firstName: '', lastName: '' });
  const [tab, setTab] = useState<Tab>('identity');
  const [angle, setAngle] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isFirst = !existing;

  const set = (patch: Partial<Character>) => {
    audio.click();
    setC((prev) => ({ ...prev, ...patch }));
  };

  const validation = useMemo(() => validateCharacter(c), [c]);
  const surprise = () => {
    audio.click();
    const r = randomCharacter();
    setC((prev) => ({ ...r, firstName: prev.firstName || r.firstName, lastName: prev.lastName || r.lastName }));
  };

  const save = async () => {
    if (!validation.ok) return setError(validation.error);
    setBusy(true);
    setError(null);
    try {
      const r = await api.saveCharacter(validation.value);
      setCharacter(r.character);
      useStore.getState().flash('Personnage enregistré.');
      go('menu');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="creator fade-in">
      <div className="creator-stage">
        <h2 className="screen-title">CREATE YOUR CHARACTER</h2>
        <div className="creator-spot">
          <Stage3D actors={[{ key: 'me', character: c }]} rotatable angle={angle} />
        </div>
        <div className="creator-rotate">
          <button className="btn btn-ghost btn-sm" onClick={() => setAngle((a) => a - Math.PI / 4)}>⟲</button>
          <span>Glissez pour tourner</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setAngle((a) => a + Math.PI / 4)}>⟳</button>
        </div>
        <p className="creator-note">
          Modèles réalistes provisoires : la teinte de peau et les couleurs de tenue s’appliquent à l’homme ; les coiffures et coupes de tenue arriveront avec les modèles personnalisables (étape 2).
        </p>
        <div className="creator-name">{c.firstName || 'Prénom'} {c.lastName || 'Nom'}</div>
      </div>

      <div className="creator-panel panel">
        <div className="tabs">
          <button className={tab === 'identity' ? 'active' : ''} onClick={() => setTab('identity')}>Identité</button>
          <button className={tab === 'hair' ? 'active' : ''} onClick={() => setTab('hair')}>Coiffure</button>
          <button className={tab === 'outfit' ? 'active' : ''} onClick={() => setTab('outfit')}>Tenue</button>
        </div>

        {tab === 'identity' && (
          <div className="creator-section">
            <div className="row2">
              <label>
                Prénom
                <input value={c.firstName} maxLength={20} onChange={(e) => setC({ ...c, firstName: e.target.value })} placeholder="Thomas" name="firstName" />
              </label>
              <label>
                Nom
                <input value={c.lastName} maxLength={20} onChange={(e) => setC({ ...c, lastName: e.target.value })} placeholder="Beaumont" name="lastName" />
              </label>
            </div>
            <div className="field-label">Apparence</div>
            <div className="seg">
              {APPEARANCES.map((a) => (
                <button key={a.id} className={c.appearance === a.id ? 'active' : ''} onClick={() => set({ appearance: a.id })}>
                  {a.name}
                </button>
              ))}
            </div>
            <div className="field-label">Teinte de peau</div>
            <div className="swatches">
              {SKIN_TONES.map((s) => (
                <button key={s.id} title={s.name} className={`swatch ${c.skinTone === s.id ? 'active' : ''}`} style={{ background: s.color }} onClick={() => set({ skinTone: s.id })} />
              ))}
            </div>
          </div>
        )}

        {tab === 'hair' && (
          <div className="creator-section">
            <div className="field-label">Couleur</div>
            <div className="swatches">
              {HAIR_COLORS.map((s) => (
                <button key={s.id} title={s.name} className={`swatch ${c.hairColor === s.id ? 'active' : ''}`} style={{ background: s.color }} onClick={() => set({ hairColor: s.id })} />
              ))}
            </div>
            <div className="field-label">Coiffure ({HAIR_STYLES.length})</div>
            <div className="choice-grid">
              {HAIR_STYLES.map((h) => (
                <button key={h.id} className={`choice ${c.hairStyleId === h.id ? 'active' : ''}`} onClick={() => set({ hairStyleId: h.id })}>
                  <Avatar character={{ ...c, hairStyleId: h.id }} size={64} crop="bust" />
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'outfit' && (
          <div className="creator-section">
            <div className="field-label">Tenue ({OUTFITS.length})</div>
            <div className="choice-grid outfits">
              {OUTFITS.map((o) => (
                <button key={o.id} className={`choice ${c.outfitId === o.id ? 'active' : ''}`} onClick={() => set({ outfitId: o.id })}>
                  <Avatar character={{ ...c, outfitId: o.id }} size={56} />
                  <span>{o.name}</span>
                  <em>{o.category}</em>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="creator-actions">
          <button className="btn btn-ghost" onClick={surprise}>🎲 SURPRENDS-MOI</button>
          {!isFirst && <button className="btn btn-ghost" onClick={() => go('profile')}>Annuler</button>}
          <button className="btn btn-primary" onClick={save} disabled={busy || !validation.ok} title={validation.ok ? '' : validation.error}>
            {isFirst ? 'ENTRER DANS LE JEU' : 'ENREGISTRER'}
          </button>
        </div>
      </div>
    </div>
  );
}
