import { create } from 'zustand';
import type { GameAction } from '@shared/protocol';
import type { GamePlayerView, GameSelfView, ObjectView, Phase, RelationType, TraceView } from '@shared/types';
import { FURNITURE, type FurnitureDef } from '@shared/content/villa';
import { GAME_CONFIG } from '@shared/config';
import { call } from '../../net/socket';
import { attempt } from '../../store';

export const PHASE_LABEL: Record<Phase, string> = {
  ARRIVAL: 'Arrivée',
  EXPLORATION: 'Exploration',
  SOCIAL: 'Rapprochements',
  ESCALATION: 'Tension',
  MAJOR_EVENT: 'Drame',
  INVESTIGATION: 'Enquête',
  RESOLUTION: 'Accusation',
  EPILOGUE: 'Épilogue',
};

export const REL_LABEL: Record<RelationType, string> = {
  FRIEND: 'Ami·e',
  ALLY: 'Allié·e',
  PACT: 'Pacte',
  ENEMY: 'Ennemi·e',
  VENDETTA: 'Vendetta',
};

export function act(a: GameAction) {
  return attempt(call('game:action', a), (r) => r.message);
}

export interface Nearby {
  me: GamePlayerView | undefined;
  objects: ObjectView[];
  furniture: FurnitureDef[];
  players: GamePlayerView[];
  bodies: GameSelfView['bodies'];
  traces: TraceView[];
}

const R = GAME_CONFIG.interactRange;

export function computeNearby(g: GameSelfView): Nearby {
  const me = g.players.find((p) => p.id === g.you);
  const empty: Nearby = { me, objects: [], furniture: [], players: [], bodies: [], traces: [] };
  if (!me?.pos) return empty;
  const d = (p: { x: number; y: number }) => Math.hypot(p.x - me.pos!.x, p.y - me.pos!.y);
  return {
    me,
    objects: g.objects.filter((o) => o.pos && o.roomId === me.roomId && d(o.pos) <= R + (o.name.endsWith('(caché)') ? 0.8 : 0)),
    furniture: FURNITURE.filter((f) => {
      if (f.roomId !== me.roomId) return false;
      const cx = Math.max(f.x, Math.min(me.pos!.x, f.x + f.w));
      const cy = Math.max(f.y, Math.min(me.pos!.y, f.y + f.h));
      return Math.hypot(cx - me.pos!.x, cy - me.pos!.y) <= R;
    }),
    players: g.players.filter((p) => p.id !== g.you && p.alive && p.pos && !p.viaAlliance && p.roomId === me.roomId && d(p.pos) <= R + 0.4),
    bodies: g.bodies.filter((b) => b.roomId === me.roomId && d(b.pos) <= R + 0.6),
    traces: g.traces.filter((t) => t.roomId === me.roomId && d(t.pos) <= R + 0.5),
  };
}

/** Sélecteur modal générique (cible d'une action). */
interface PickerState {
  open: { title: string; options: { id: string; label: string; hint?: string }[]; onPick: (id: string) => void } | null;
  ask: (title: string, options: { id: string; label: string; hint?: string }[], onPick: (id: string) => void) => void;
  close: () => void;
}
export const usePicker = create<PickerState>((set) => ({
  open: null,
  ask: (title, options, onPick) => set({ open: { title, options, onPick } }),
  close: () => set({ open: null }),
}));

/** État de l'interface de jeu : tiroir (onglets 1–4) et chat (Entrée). */
export const useChatFocus = create<{
  channel: string;
  setChannel: (c: string) => void;
  /** onglet du tiroir ouvert, ou null si fermé */
  tab: number | null;
  setTab: (t: number | null) => void;
  toggleTab: (t: number) => void;
  chatOpen: boolean;
  setChatOpen: (o: boolean) => void;
}>((set, get) => ({
  channel: 'general',
  setChannel: (channel) => set({ channel, chatOpen: true }),
  tab: null,
  setTab: (tab) => set({ tab }),
  toggleTab: (t) => set({ tab: get().tab === t ? null : t }),
  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
}));
