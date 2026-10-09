import { useStore } from '../../store';
import { targetActions, useTarget, usePicker } from './helpers';

/**
 * Invite d'interaction UNIQUE : la cible visée (raycast de la vue 3D) et son action principale.
 * E = action principale · F = autres actions possibles sur cette même cible.
 */
export function ActionBar() {
  const game = useStore((s) => s.game);
  const key = useTarget((s) => s.key);
  if (!game) return null;
  const t = targetActions(game, key);
  if (!t || !t.actions.length) return null;
  return (
    <div className="interact-prompt" aria-live="polite">
      <div className="interact-title">{t.title}</div>
      <div className="interact-keys">
        <span>
          <kbd>E</kbd> {t.actions[0].label}
        </span>
        {t.actions.length > 1 && (
          <span className="muted">
            <kbd>F</kbd> autres actions ({t.actions.length - 1})
          </span>
        )}
      </div>
    </div>
  );
}

/** Touche E : action principale de la cible ; touche F : menu des autres actions. */
export function triggerTarget(secondary: boolean) {
  const game = useStore.getState().game;
  if (!game) return;
  const t = targetActions(game, useTarget.getState().key);
  if (!t || !t.actions.length) return;
  if (!secondary) return t.actions[0].run();
  if (t.actions.length < 2) return;
  usePicker.getState().ask(t.title, t.actions.slice(1).map((a, i) => ({ id: String(i), label: a.label })), (id) => t.actions[1 + Number(id)].run());
}
