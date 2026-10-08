import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import { roomName } from '@shared/content/villa';
import { useStore, attempt } from '../../store';
import { call, getSocket } from '../../net/socket';
import { drawFrame, createRenderState, camera } from '../../render/villaRenderer';
import { audio } from '../../audio';
import { PHASE_LABEL, useChatFocus, usePicker } from './helpers';
import { ActionBar } from './ActionBar';
import { ChatPanel } from './ChatPanel';
import { FeedPanel, Announcement } from './FeedPanel';
import { InventoryTab } from './InventoryTab';
import { RelationsTab } from './RelationsTab';
import { NotebookTab } from './NotebookTab';
import { InvestigationTab } from '../investigation/InvestigationTab';
import { OpportunityPrompt, VoteModal, TestimonyModal, Epilogue, Picker } from './Overlays';

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyZ: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  KeyQ: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function GameScreen() {
  const game = useStore((s) => s.game);
  const reduced = useStore((s) => s.settings.reducedMotion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<string | undefined>();
  const tab = useChatFocus((s) => s.tab);
  const setTab = useChatFocus((s) => s.setTab);
  const [showSecret, setShowSecret] = useState(false);

  const hasGame = !!game;
  // Boucle de rendu (démarre quand le canvas existe)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const rs = createRenderState();
    let raf = 0;
    let last = performance.now();
    let lastRoom: string | undefined;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const view = useStore.getState().game;
      const wrap = wrapRef.current;
      if (view && wrap) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = wrap.clientWidth;
        const ch = wrap.clientHeight;
        if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
          canvas.width = Math.round(cw * dpr);
          canvas.height = Math.round(ch * dpr);
        }
        ctx.save();
        ctx.scale(dpr, dpr);
        const r = drawFrame(ctx, view, rs, cw, ch, dt, useStore.getState().settings.reducedMotion);
        ctx.restore();
        if (r !== lastRoom) {
          lastRoom = r;
          setRoom(r);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasGame]);

  // Clavier → intentions de déplacement (le serveur simule)
  useEffect(() => {
    const pressed = new Set<string>();
    let lastSent = '';
    const send = () => {
      let dx = 0;
      let dy = 0;
      for (const k of pressed) {
        const v = KEYS[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      const key = `${dx},${dy}`;
      if (key === lastSent) return;
      lastSent = key;
      getSocket()?.emit('game:input', { dx, dy });
    };
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      audio.unlock();
      if (KEYS[e.code]) {
        e.preventDefault();
        pressed.add(e.code);
        send();
      } else if (e.code === 'KeyE') {
        (document.querySelector('.action-bar .btn') as HTMLButtonElement | null)?.click();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        (document.querySelector('.chat-panel input') as HTMLInputElement | null)?.focus();
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        setTab(Number(e.code.slice(-1)) - 1);
      } else if (e.code === 'KeyM') {
        camera.overview = !camera.overview;
      } else if (e.code === 'Escape') {
        usePicker.getState().close();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (pressed.delete(e.code)) send();
    };
    const blur = () => {
      pressed.clear();
      send();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      getSocket()?.emit('game:input', { dx: 0, dy: 0 });
    };
  }, [setTab]);

  if (!game) return <div className="center-message">Connexion à la villa…</div>;
  const me = game.players.find((p) => p.id === game.you);
  const investigation = !!game.caseInfo;

  const abandon = async () => {
    if (game.epilogue) {
      await attempt(call('game:leave'));
      return;
    }
    if (!confirm('Abandonner la partie ? Votre personnage restera immobile dans la villa.')) return;
    await attempt(call('lobby:leave'));
    useStore.setState({ game: null, inGame: false, lobby: null, screen: 'menu' });
  };

  return (
    <div className={`game ${game.alive ? '' : 'is-dead'} ${game.blackout ? 'is-blackout' : ''} ${reduced ? 'reduced' : ''}`}>
      <header className="game-top">
        <div className="game-title">{game.title}</div>
        <div className="game-clock">{formatClock(game.clock)}</div>
        <div className={`phase phase-${game.phase.toLowerCase()}`}>{PHASE_LABEL[game.phase]}</div>
        <div className="game-room">{room ? roomName(room) : '—'}</div>
        {game.blackout && <div className="chip chip-danger">⚡ Coupure de courant</div>}
        {game.muddy && <div className="chip">🥾 Chaussures boueuses</div>}
        {me?.stained && <div className="chip chip-danger">🩸 Vêtements tachés</div>}
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm secret-btn" onMouseDown={() => setShowSecret(true)} onMouseUp={() => setShowSecret(false)} onMouseLeave={() => setShowSecret(false)} onTouchStart={() => setShowSecret(true)} onTouchEnd={() => setShowSecret(false)}>
          🤫 Mon secret
        </button>
        <button className="btn btn-ghost btn-sm" onClick={abandon}>{game.epilogue ? 'Retour au lobby' : 'Quitter'}</button>
        {showSecret && <div className="secret-pop">{game.secret}</div>}
      </header>

      <aside className="game-left">
        <FeedPanel />
        <ChatPanel />
      </aside>

      <main className="game-center" ref={wrapRef}>
        <canvas ref={canvasRef} className="villa-canvas" />
        {!game.alive && !game.epilogue && <div className="dead-banner">Vous êtes mort·e. Vous observez la villa en silence.</div>}
        <Announcement />
        <OpportunityPrompt />
        <ActionBar />
      </main>

      <aside className="game-right">
        <div className="tabs tabs-game">
          {['Inventaire', 'Relations', 'Carnet', 'Enquête'].map((t, i) => (
            <button key={t} className={`${tab === i ? 'active' : ''} ${i === 3 && investigation ? 'pulse' : ''}`} onClick={() => setTab(i)}>
              <kbd>{i + 1}</kbd> {t}
              {i === 1 && game.relations.some((r) => r.status === 'pending' && r.to === game.you) && <span className="badge">!</span>}
            </button>
          ))}
        </div>
        <div className="tab-body">
          {tab === 0 && <InventoryTab />}
          {tab === 1 && <RelationsTab />}
          {tab === 2 && <NotebookTab />}
          {tab === 3 && <InvestigationTab />}
        </div>
      </aside>

      <VoteModal />
      <TestimonyModal />
      <Picker />
      <Epilogue />
    </div>
  );
}
