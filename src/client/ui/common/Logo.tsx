import { GAME_NAME } from '@shared/config';

/** Logo typographique temporaire — le nom vient de la configuration. */
export function Logo({ size = 'lg' }: { size?: 'lg' | 'md' | 'sm' }) {
  const words = GAME_NAME.split(' ');
  const last = words.pop();
  return (
    <h1 className={`logo logo-${size}`}>
      <span className="logo-top">{words.join(' ')}</span>
      <span className="logo-main">{last}</span>
      <span className="logo-line" />
    </h1>
  );
}
