import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import { roomName } from '@shared/content/villa';
import { useStore, liveGame } from '../../store';
import { getSocket } from '../../net/socket';
import { drawFrame, createRenderState, camera } from '../../render/villaRenderer';
import { GameView3D } from '../../three/GameView3D';
import { audio, music } from '../../audio';
import { PHASE_LABEL, useChatFocus, useMinigame, usePicker, useTarget } from './helpers';
import { ActionBar, triggerTarget } from './ActionBar';
import { ChatPanel } from './ChatPanel';
import { Announcement, ChronicleTab } from './FeedPanel';
import { EveningBanner } from './EveningBanner';
import { Notifications } from './Notifications';
import { VoiceControls } from './VoiceControls';
import { InventoryTab } from './InventoryTab';
import { RelationsTab } from './RelationsTab';
import { DossierTab } from './DossierTab';
import { RoleCard, LeadsPanel } from './Guidance';
import { ForceLockGame } from './Minigames';
import { Phone } from './Phone';
import { TouchControls, isTouchDevice } from './TouchControls';
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
  const [showPhone, setShowPhone] = useState(false);
  const [touch] = useState(isTouchDevice);
  const [locked, setLocked] = useState(false);
  const tab = useChatFocus((s) => s.tab);
  const setTab = useChatFocus((s) => s.setTab);
  const toggleTab = useChatFocus((s) => s.toggleTab);
  const hasGame = !!game;
  const [revealing, setRevealing] = useState(false);
  const [ghost, setGhost] = useState<{ follow: string | null; followName: string | null } | null>(null);
  const revealingRef = useRef(false);
  revealingRef.current = revealing;
  const showMapRef = useRef(false);
  showMapRef.current = showMap;
  const showPhoneRef = useRef(false);
  showPhoneRef.current = showPhone;
  const escOpenedAt = useRef(0);

  // Vue 3D (créée quand le conteneur existe)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const st = useStore.getState().settings;
    const v = new GameView3D(wrap, { reducedMotion: st.reducedMotion, quality: st.quality, showFps: st.showFps, comic: st.comic });
    viewRef.current = v;
    const dbg = (window as unknown as { __ehas?: Record<string, unknown> }).__ehas;
    if (dbg) dbg.view3d = v; // accroche de test (?debug)
    v.onInput = (dx, dy, run) => getSocket()?.emit('game:input', { dx, dy, run });
    v.onModeChange = setCamMode;
    v.onFirstFrame = () => useStore.setState({ gameViewReady: true });
    v.onTarget = (k, stack) => useTarget.getState().set(k, stack);
    v.onGhost = setGhost;
    // manette : A interagir, X roue, Y téléphone, B retour, LB/RB objets empilés, Start menu
    v.onPadButton = (b) => {
      const ui = useChatFocus.getState();
      if (b === 'menu') return ui.setPaused(!ui.paused);
      if (b === 'back') {
        if (usePicker.getState().open) return usePicker.getState().close();
        if (useMinigame.getState().open) return useMinigame.getState().close();
        setShowPhone(false);
        setShowMap(false);
        return ui.paused ? ui.setPaused(false) : setTab(null);
      }
      if (ui.paused || usePicker.getState().open || useMinigame.getState().open) return;
      if (b === 'interact') triggerTarget(false);
      else if (b === 'wheel') triggerTarget(true);
      else if (b === 'phone') setShowPhone((x) => !x);
      else v.key(b === 'prev' ? 'ArrowLeft' : 'ArrowRight', true);
    };
    v.onReveal = (on) => {
      setRevealing(on);
      if (on) music.mark('bodyDiscovered');
    };
    const g0 = liveGame.current ?? useStore.getState().game;
    if (g0) v.setView(g0);
    const unsub = liveGame.subscribe((g) => v.setView(g));
    const unsubSettings = useStore.subscribe((s, prev) => {
      if (s.settings.quality !== prev.settings.quality) v.setQualityMode(s.settings.quality);
      if (s.settings.showFps !== prev.settings.showFps) v.setFpsVisible(s.settings.showFps);
      if (s.settings.comic !== prev.settings.comic) v.setComic(s.settings.comic);
    });
    const ro = new ResizeObserver(() => v.refreshSize());
    ro.observe(wrap);
    // Échap en souris capturée : le navigateur libère la souris et n'envoie pas la touche → on ouvre directement le menu
    const onLock = () => {
      const isLocked = document.pointerLockElement === v.renderer.domElement;
      setLocked(isLocked);
      const ui = useChatFocus.getState();
      if (!isLocked && !ui.chatOpen && ui.tab === null && !ui.paused && !usePicker.getState().open && !showMapRef.current && !revealingRef.current) {
        ui.setPaused(true);
        escOpenedAt.current = performance.now();
      }
    };
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
      unsubSettings();
      ro.disconnect();
      document.removeEventListener('pointerlockchange', onLock);
      v.dispose();
      viewRef.current = null;
      useStore.setState({ gameViewReady: false });
      getSocket()?.emit('game:input', { dx: 0, dy: 0 });
    };
  }, [hasGame]);

  // fermeture du menu Échap : on recapture la souris si elle l'était à l'ouverture (geste utilisateur requis)
  const paused = useChatFocus((s) => s.paused);
  const wasPaused = useRef(false);
  useEffect(() => {
    if (wasPaused.current && !paused && escOpenedAt.current) {
      escOpenedAt.current = 0;
      const el = viewRef.current?.renderer.domElement as (HTMLCanvasElement & { requestPointerLock(): Promise<void> | void }) | undefined;
      try {
        (el?.requestPointerLock() as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        /* le navigateur refuse : un clic sur la vue suffit */
      }
    }
    wasPaused.current = paused;
  }, [paused]);

  // plan de découverte du corps : dès que la cinématique d'arrivée s'est refermée
  const introOpen = useStore((s) => !!s.intro);
  useEffect(() => {
    if (!introOpen && hasGame) {
      const t = setTimeout(() => viewRef.current?.beginReveal(), 300);
      return () => clearTimeout(t);
    }
  }, [introOpen, hasGame]);


  // carte de rôle : une fois la cinématique et le plan sur le corps terminés
  const [roleReady, setRoleReady] = useState(false);
  useEffect(() => {
    if (introOpen || !hasGame || revealing) return setRoleReady(false);
    const t = setTimeout(() => setRoleReady(true), 1500);
    return () => clearTimeout(t);
  }, [introOpen, hasGame, revealing]);

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
      if (revealingRef.current) {
        // pendant le plan sur le corps : seul Espace permet de passer (après quelques secondes)
        if (e.code === 'Space' && viewRef.current) viewRef.current.revealSkip = true;
        e.preventDefault();
        return;
      }
      if (viewRef.current?.key(e.code, true)) {
        e.preventDefault();
      } else if (viewRef.current?.isGhost && e.code === 'KeyF') {
        if (!usePicker.getState().open && !useChatFocus.getState().paused) viewRef.current.ghostFollow(e.shiftKey ? -1 : 1);
      } else if (e.code === 'KeyE' || e.code === 'KeyF') {
        if (usePicker.getState().open || useMinigame.getState().open || useChatFocus.getState().paused) return;
        triggerTarget(e.code === 'KeyF');
      } else if (e.code === 'Enter') {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        viewRef.current?.releaseAll();
        useChatFocus.getState().setChatOpen(true);
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
        if (document.pointerLockElement) document.exitPointerLock();
        toggleTab(Number(e.code.slice(-1)) - 1);
      } else if (e.code === 'F3') {
        e.preventDefault();
        const st = useStore.getState();
        st.updateSettings({ showFps: !st.settings.showFps });
      } else if (e.code === 'KeyP') {
        if (usePicker.getState().open || useChatFocus.getState().paused) return;
        if (document.pointerLockElement) document.exitPointerLock();
        setShowPhone((x) => !x);
      } else if (e.code === 'KeyM') {
        setShowMap((m) => !m);
      } else if (e.code === 'Escape') {
        // Échap ferme d'abord ce qui est ouvert ; sinon ouvre/ferme le menu (panneau à gauche)
        const ui = useChatFocus.getState();
        if (performance.now() - escOpenedAt.current < 400) return; // même Échap que celui qui a libéré la souris
        if (usePicker.getState().open) usePicker.getState().close();
        else if (ui.tab !== null || showMapRef.current || showPhoneRef.current) {
          setShowMap(false);
          setShowPhone(false);
          setTab(null);
        } else ui.setPaused(!ui.paused);
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
    { icon: '📜', label: 'Chronique', badge: null, alert: false },
  ];

  return (
    <div className={`game game-full ${touch ? 'is-touch' : ''} ${game.alive ? '' : 'is-dead'} ${game.blackout ? 'is-blackout' : ''} ${reduced ? 'reduced' : ''}`}>
      <div className="view3d" ref={wrapRef} />

      <header className="hud-top">
        <div className="game-title">{game.title}</div>
        <div className="game-clock">{formatClock(game.clock)}</div>
        <div className={`phase phase-${game.phase.toLowerCase()}`}>{PHASE_LABEL[game.phase]}</div>
        <HudTimer />
        <div className="game-room">{room ? roomName(room) : '—'}</div>
        {game.blackout && <div className="chip chip-danger">⚡ Coupure de courant</div>}
        {game.muddy && <div className="chip">🥾 Chaussures boueuses</div>}
        {me?.stained && <div className="chip chip-danger">🩸 Vêtements tachés</div>}
        <div className="spacer" />
        <VoiceControls />
        <button className="btn btn-ghost btn-sm" onClick={() => useChatFocus.getState().setPaused(true)} title="Menu (Échap)">☰ Menu</button>
      </header>

      <div className="cam-hint" hidden={!!ghost}>
        <kbd>ZQSD</kbd> bouger · <kbd>E</kbd> interagir · <kbd>F</kbd> roue · <kbd>P</kbd> téléphone · <kbd>1</kbd>–<kbd>5</kbd> panneaux · <kbd>Échap</kbd> menu{!locked && camMode === 'third' ? ' · clic : orienter la caméra' : ''}
      </div>

      {revealing && game.caseInfo && <RevealCaption caseInfo={game.caseInfo} />}
      <EveningBanner hold={revealing} />
      <Notifications />
      {ghost && !game.epilogue && (
        <div className="ghost-bar">
          <div className="ghost-title">👻 {game.alive ? 'Arrêté·e' : 'Mort·e'} — vous êtes un fantôme, invisible des vivants</div>
          <div className="ghost-follow">{ghost.followName ? <>Vous suivez <strong>{ghost.followName}</strong></> : 'Vol libre à travers les murs'}</div>
          <div className="ghost-keys">
            <kbd>ZQSD</kbd> voler · <kbd>Espace</kbd>/<kbd>C</kbd> monter/descendre · <kbd>Maj</kbd> vite · <kbd>F</kbd> suivre un joueur (<kbd>Maj</kbd>+<kbd>F</kbd> précédent) · bouger = vol libre
          </div>
        </div>
      )}
      <Announcement />
      {!revealing && !ghost && <LeadsPanel />}
      <OpportunityPrompt />
      <ActionBar />
      <ChatPanel />
      {showMap && <MapOverlay onClose={() => setShowMap(false)} />}
      {showPhone && !ghost && <Phone onClose={() => setShowPhone(false)} onMap={() => setShowMap(true)} />}

      {touch && !ghost && !game.epilogue && (
        <TouchControls
          view={() => viewRef.current}
          onInteract={() => triggerTarget(false)}
          onWheel={() => triggerTarget(true)}
          onPhone={() => setShowPhone((x) => !x)}
          onChat={() => useChatFocus.getState().setChatOpen(true)}
        />
      )}
      <nav className="dock">
        {DOCK.map((d, i) => (
          <button key={d.label} className={`dock-btn ${tab === i ? 'active' : ''} ${d.alert ? 'alert' : ''}`} onClick={() => toggleTab(i)} title={`${d.label} (${i + 1})`}>
            <span className="dock-icon">{d.icon}</span>
            <kbd>{i + 1}</kbd>
            {d.badge !== null && <span className="badge">{d.badge}</span>}
          </button>
        ))}
        <button className="dock-btn" onClick={() => setShowPhone((x) => !x)} title="Téléphone (P)">
          <span className="dock-icon">📱</span>
          <kbd>P</kbd>
        </button>
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
            {tab === 4 && <ChronicleTab />}
          </div>
        </aside>
      )}

      <VoteModal />
      <TestimonyModal />
      <Picker />
      <ForceLockGame />
      <PauseMenu />
      <RoleCard ready={roleReady && !game.epilogue} />
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

/** Légendes successives du plan sur le corps. */
function RevealCaption({ caseInfo }: { caseInfo: NonNullable<ReturnType<typeof useStore.getState>['game']>['caseInfo'] & object }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ts = [5000, 11000].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, []);
  return (
    <div className="reveal-caption fade-in" key={step}>
      {step === 0 && (
        <>
          <div className="reveal-kicker">22h05 — Villa Beaumont</div>
          <div className="reveal-title">Quelqu’un ne répond plus</div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="reveal-kicker">{caseInfo.scenarioTitle}</div>
          <div className="reveal-title">{caseInfo.victimName}</div>
          <div className="reveal-sub">retrouvé·e sans vie — {caseInfo.roomName}</div>
        </>
      )}
      {step === 2 && (
        <>
          <div className="reveal-title">L’un de vous l’a tué·e.</div>
          <div className="reveal-sub">La route est coupée. Personne ne quittera la villa avant l’aube.</div>
        </>
      )}
      <div className="reveal-skip">Espace : passer</div>
    </div>
  );
}

/** Bandeau : compte à rebours avant la police (ou fin du vote en cours) et accusations restantes. */
function HudTimer() {
  const endsAt = useStore((s) => s.game?.caseInfo?.endsAt);
  const phase = useStore((s) => s.game?.phase);
  const vote = useStore((s) => s.game?.vote);
  const left = useStore((s) => s.game?.caseInfo?.accusationsLeft);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  if (vote) return <div className="chip chip-danger hud-timer">🗳 Vote · {fmt(vote.endsAt - Date.now())}</div>;
  if (phase !== 'INVESTIGATION' || !endsAt) return null;
  return (
    <div className="chip hud-timer" title="Avant l’arrivée de la police et la délibération finale">
      🚓 {fmt(endsAt - Date.now())}
      {left !== undefined && <span className="muted"> · {left} accusation{left > 1 ? 's' : ''}</span>}
    </div>
  );
}
