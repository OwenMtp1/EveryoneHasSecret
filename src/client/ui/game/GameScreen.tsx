import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import { roomName } from '@shared/content/villa';
import { useStore, liveGame } from '../../store';
import { getSocket } from '../../net/socket';
import { drawFrame, createRenderState, camera } from '../../render/villaRenderer';
import { GameView3D } from '../../three/GameView3D';
import { audio, music } from '../../audio';
import { PHASE_LABEL, useChatFocus, usePicker, useTarget } from './helpers';
import { ActionBar, triggerTarget } from './ActionBar';
import { ChatPanel } from './ChatPanel';
import { Announcement } from './FeedPanel';
import { Notifications } from './Notifications';
import { VoiceControls } from './VoiceControls';
import { InventoryTab } from './InventoryTab';
import { RelationsTab } from './RelationsTab';
import { DossierTab } from './DossierTab';
import { InvestigationTab } from '../investigation/InvestigationTab';
import { OpportunityPrompt, VoteModal, TestimonyModal, Epilogue, Picker, PauseMenu } from './Overlays';


export function GameScreen() {
  const game = useStore((s) => s.game);
  const reduced = useStore((s) => s.settings.reducedMotion);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView3D | null>(null);
  const [room, setRoom] = useState<string | undefined>();
  const [camMode, setCamMode] = useState<'third' | 'first'>('third');
  const [showMap, setShowMap] = useState(false);
  const [locked, setLocked] = useState(false);
  const tab = useChatFocus((s) => s.tab);
  const setTab = useChatFocus((s) => s.setTab);
  const toggleTab = useChatFocus((s) => s.toggleTab);
  const hasGame = !!game;
  const [revealing, setRevealing] = useState(false);

  // Vue 3D (créée quand le conteneur existe)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const v = new GameView3D(wrap, { reducedMotion: useStore.getState().settings.reducedMotion });
    viewRef.current = v;
    const dbg = (window as unknown as { __ehas?: Record<string, unknown> }).__ehas;
    if (dbg) dbg.view3d = v; // accroche de test (?debug)
    v.onInput = (dx, dy, run) => getSocket()?.emit('game:input', { dx, dy, run });
    v.onModeChange = setCamMode;
    v.onFirstFrame = () => useStore.setState({ gameViewReady: true });
    v.onTarget = (k) => useTarget.getState().set(k);
    v.onReveal = (on) => {
      setRevealing(on);
      if (on) music.mark('bodyDiscovered');
    };
    const g0 = liveGame.current ?? useStore.getState().game;
    if (g0) v.setView(g0);
    const unsub = liveGame.subscribe((g) => v.setView(g));
    const ro = new ResizeObserver(() => v.refreshSize());
    ro.observe(wrap);
    const onLock = () => setLocked(document.pointerLockElement === v.renderer.domElement);
    document.addEventListener('pointerlockchange', onLock);
    // Pièce courante (affichage)
    const t = setInterval(() => {
      const g = useStore.getState().game;
      const me = g?.players.find((p) => p.id === g.you);
      setRoom(me?.roomId);
    }, 300);
    return () => {
      clearInterval(t);
      unsub();
      ro.disconnect();
      document.removeEventListener('pointerlockchange', onLock);
      v.dispose();
      viewRef.current = null;
      useStore.setState({ gameViewReady: false });
      getSocket()?.emit('game:input', { dx: 0, dy: 0 });
    };
  }, [hasGame]);

  const showMapRef = useRef(false);
  showMapRef.current = showMap;

  // Clavier → intentions (relatives à la caméra) ; le serveur simule
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.repeat) {
        if (!typing(e) && viewRef.current?.key(e.code, true)) e.preventDefault();
        return;
      }
      audio.unlock();
      if (viewRef.current?.key(e.code, true)) {
        e.preventDefault();
      } else if (e.code === 'KeyE' || e.code === 'KeyF') {
        if (usePicker.getState().open || useChatFocus.getState().paused) return;
        triggerTarget(e.code === 'KeyF');
      } else if (e.code === 'Enter') {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        viewRef.current?.releaseAll();
        useChatFocus.getState().setChatOpen(true);
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        if (document.pointerLockElement) document.exitPointerLock();
        toggleTab(Number(e.code.slice(-1)) - 1);
      } else if (e.code === 'KeyM') {
        setShowMap((m) => !m);
      } else if (e.code === 'Escape') {
        // Échap ferme d'abord ce qui est ouvert ; sinon ouvre/ferme le menu pause
        const ui = useChatFocus.getState();
        if (usePicker.getState().open) usePicker.getState().close();
        else if (ui.tab !== null || showMapRef.current) {
          setShowMap(false);
          setTab(null);
        } else ui.setPaused(!ui.paused);
        viewRef.current?.releaseAll();
      }
    };
    const up = (e: KeyboardEvent) => {
      viewRef.current?.key(e.code, false);
    };
    const blur = () => viewRef.current?.releaseAll();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [setTab, toggleTab]);

  if (!game) return <div className="center-message">Connexion à la villa…</div>;
  const me = game.players.find((p) => p.id === game.you);
  const investigation = !!game.caseInfo;

  const pendingRelations = game.relations.filter((r) => r.status === 'pending' && r.to === game.you).length;
  const DOCK = [
    { icon: '📁', label: 'Mon dossier', badge: game.dossier?.evidence.length || null },
    { icon: '🎒', label: 'Inventaire', badge: game.inventory.length || null },
    { icon: '🔎', label: 'Enquête', badge: game.publicEvidence.length || null, alert: investigation && !!game.vote },
    { icon: '👥', label: 'Relations', badge: pendingRelations || null, alert: pendingRelations > 0 },
  ];
  const arrested = game.arrested.includes(game.you);

  return (
    <div className={`game game-full ${game.alive ? '' : 'is-dead'} ${game.blackout ? 'is-blackout' : ''} ${reduced ? 'reduced' : ''}`}>
      <div className="view3d" ref={wrapRef} />

      <header className="hud-top">
        <div className="game-title">{game.title}</div>
        <div className="game-clock">{formatClock(game.clock)}</div>
        <div className={`phase phase-${game.phase.toLowerCase()}`}>{PHASE_LABEL[game.phase]}</div>
        <div className="game-room">{room ? roomName(room) : '—'}</div>
        {game.blackout && <div className="chip chip-danger">⚡ Coupure de courant</div>}
        {game.muddy && <div className="chip">🥾 Chaussures boueuses</div>}
        {me?.stained && <div className="chip chip-danger">🩸 Vêtements tachés</div>}
        <div className="spacer" />
        <VoiceControls />
        <button className="btn btn-ghost btn-sm" onClick={() => useChatFocus.getState().setPaused(true)} title="Menu (Échap)">☰ Menu</button>
      </header>

      <div className="cam-hint">
        {camMode === 'third' ? '3e personne' : '1re personne'} · <kbd>V</kbd> vue · {locked ? <><kbd>Échap</kbd> libérer la souris</> : 'clic : orienter la caméra'} · <kbd>ZQSD</kbd> bouger · <kbd>Maj</kbd> courir · <kbd>E</kbd> interagir · <kbd>F</kbd> plus · <kbd>Entrée</kbd> chat · <kbd>1</kbd>–<kbd>4</kbd> panneaux · <kbd>Échap</kbd> menu
      </div>

      {revealing && game.caseInfo && (
        <div className="reveal-caption fade-in">
          <div className="reveal-kicker">{game.caseInfo.scenarioTitle}</div>
          <div className="reveal-title">{game.caseInfo.victimName}</div>
          <div className="reveal-sub">retrouvé·e sans vie — {game.caseInfo.roomName}</div>
        </div>
      )}
      <Notifications />
      {!game.alive && !game.epilogue && <div className="dead-banner">Vous êtes mort·e. Vous observez la villa en silence.</div>}
      {arrested && game.alive && !game.epilogue && <div className="dead-banner">Vous êtes arrêté·e. Vous observez jusqu’à la fin de la nuit.</div>}
      <Announcement />
      <OpportunityPrompt />
      <ActionBar />
      <ChatPanel />
      {showMap && <MapOverlay onClose={() => setShowMap(false)} />}

      <nav className="dock">
        {DOCK.map((d, i) => (
          <button key={d.label} className={`dock-btn ${tab === i ? 'active' : ''} ${d.alert ? 'alert' : ''}`} onClick={() => toggleTab(i)} title={`${d.label} (${i + 1})`}>
            <span className="dock-icon">{d.icon}</span>
            <kbd>{i + 1}</kbd>
            {d.badge !== null && <span className="badge">{d.badge}</span>}
          </button>
        ))}
        <button className="dock-btn" onClick={() => useChatFocus.getState().setChatOpen(true)} title="Chat (Entrée)">
          <span className="dock-icon">💬</span>
          <kbd>↵</kbd>
        </button>
      </nav>

      {tab !== null && (
        <aside className="drawer">
          <div className="drawer-head">
            <strong>{DOCK[tab].icon} {DOCK[tab].label}</strong>
            <button className="drawer-close" onClick={() => setTab(null)} aria-label="Fermer">×</button>
          </div>
          <div className="tab-body">
            {tab === 0 && <DossierTab />}
            {tab === 1 && <InventoryTab />}
            {tab === 2 && <InvestigationTab />}
            {tab === 3 && <RelationsTab />}
          </div>
        </aside>
      )}

      <VoteModal />
      <TestimonyModal />
      <Picker />
      <PauseMenu />
      <Epilogue />
    </div>
  );
}

/** Plan 2D de la villa (touche M) — ne montre que ce que vous savez. */
function MapOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const rs = createRenderState();
    let raf = 0;
    let last = performance.now();
    camera.overview = true;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const view = useStore.getState().game;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      if (view) {
        ctx.save();
        ctx.scale(dpr, dpr);
        drawFrame(ctx, view, rs, cw, ch, dt, true);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="map-overlay" onClick={onClose}>
      <canvas ref={ref} />
      <div className="map-caption">PLAN DE LA VILLA — <kbd>M</kbd> pour fermer</div>
    </div>
  );
}
