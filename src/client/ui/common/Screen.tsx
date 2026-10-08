import type { ReactNode } from 'react';
import { useStore, type Screen as S } from '../../store';

/** Cadre d'écran de menu : titre, retour, contenu. */
export function MenuScreen({ title, back = 'menu', children, wide }: { title: string; back?: S | null; children: ReactNode; wide?: boolean }) {
  const go = useStore((s) => s.go);
  return (
    <div className={`menu-screen ${wide ? 'wide' : ''}`}>
      <header className="menu-screen-head">
        {back && (
          <button className="btn btn-ghost btn-back" onClick={() => go(back)}>
            ← Retour
          </button>
        )}
        <h2 className="screen-title">{title}</h2>
      </header>
      <div className="menu-screen-body">{children}</div>
    </div>
  );
}
