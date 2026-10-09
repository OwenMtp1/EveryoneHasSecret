import { useEffect, useState, type CSSProperties } from 'react';
import { castById } from '@shared/content/cast';
import { renderPhoto, type PhotoSpec } from '../../three/photo';

/**
 * Portrait d'un personnage du catalogue (vignette pré-rendue, tête et épaules ; ou carte en pied).
 * Repli : initiales sur fond neutre si l'image manque ou si le personnage est inconnu.
 */
export function CastPortrait({
  castId,
  size = 64,
  variant = 'thumb',
  dead,
  className,
  style,
}: {
  castId: string;
  /** largeur en px (hauteur selon le format : 4:5 portrait, 1:2 carte) */
  size?: number;
  variant?: 'thumb' | 'card';
  dead?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const m = castById(castId);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [castId, variant]);
  const h = Math.round(size * (variant === 'card' ? 2 : 1.25));
  const box: CSSProperties = {
    width: size,
    height: h,
    borderRadius: variant === 'card' ? 6 : 8,
    overflow: 'hidden',
    background: 'linear-gradient(#8f969d, #555a60)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    filter: dead ? 'grayscale(1) brightness(0.75)' : undefined,
    ...style,
  };
  if (!m || failed) {
    const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : '?';
    return (
      <div className={`cast-portrait ${className ?? ''}`} style={{ ...box, color: '#f1ece2', font: `600 ${Math.round(size * 0.32)}px Inter, sans-serif` }} aria-label={m ? `${m.firstName} ${m.lastName}` : 'Inconnu'}>
        {initials}
      </div>
    );
  }
  return (
    <div className={`cast-portrait ${className ?? ''}`} style={box}>
      <img
        src={variant === 'card' ? m.card : m.thumb}
        alt={`${m.firstName} ${m.lastName}`}
        width={size}
        height={h}
        loading="lazy"
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * Photo (preuve, souvenir) rendue avec les vrais modèles des personnages : voir three/photo.ts.
 * Affiche un cadre neutre pendant le rendu ; la spécification est comparée par valeur.
 */
export function CastPhoto({ spec, width = 480, className, style }: { spec: PhotoSpec; width?: number; className?: string; style?: CSSProperties }) {
  const key = JSON.stringify(spec);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(false);
    renderPhoto(JSON.parse(key) as PhotoSpec).then(
      (u) => alive && setUrl(u),
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const h = Math.round((width * 320) / 480);
  return (
    <div
      className={`cast-photo ${className ?? ''}`}
      style={{ width, height: h, background: '#1b1a18', borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8d877c', fontSize: 12, ...style }}
    >
      {url ? <img src={url} alt={spec.caption ?? 'Photo'} width={width} height={h} style={{ width: '100%', height: '100%', display: 'block' }} draggable={false} /> : error ? 'Photo indisponible' : 'Développement…'}
    </div>
  );
}
