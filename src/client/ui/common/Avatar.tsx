import { useMemo } from 'react';
import type { Character } from '@shared/types';
import { avatarSvg } from '../../render/avatar';

export function Avatar({
  character,
  size = 120,
  view = 'front',
  crop = 'full',
  dead,
  className,
}: {
  character: Character;
  size?: number;
  view?: 'front' | 'back';
  crop?: 'full' | 'bust';
  dead?: boolean;
  className?: string;
}) {
  const svg = useMemo(() => avatarSvg(character, { view, crop, dead }), [character, view, crop, dead]);
  const h = crop === 'bust' ? size * (170 / 120) : size * 1.6;
  return <div className={`avatar ${className ?? ''}`} style={{ width: size, height: h }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Portrait({ character, size = 44, online }: { character: Character | null; size?: number; online?: string }) {
  return (
    <div className="portrait" style={{ width: size, height: size }}>
      {character ? <Avatar character={character} size={size} crop="bust" /> : <div className="portrait-empty">?</div>}
      {online && <span className={`dot dot-${online.toLowerCase()}`} />}
    </div>
  );
}
