import { create } from 'zustand';
import type { GameAction } from '@shared/protocol';
import type { GameSelfView, ObjectView, Phase, RelationType } from '@shared/types';
import { furnitureById } from '@shared/content/villa';
import { call } from '../../net/socket';
import { attempt } from '../../store';

export const PHASE_LABEL: Record<Phase, string> = {
  ARRIVAL: 'Découverte du corps',
  INVESTIGATION: 'Enquête',
  RESOLUTION: 'Délibération finale',
  EPILOGUE: 'Épilogue',
};

export const REL_LABEL: Record<RelationType, string> = {
  FRIEND: 'Ami·e',
  ALLY: 'Allié·e',
  PACT: 'Pacte',
  ENEMY: 'Ennemi·e',
  VENDETTA: 'Vendetta',
};

/** Une seule requête d'action à la fois : les appuis répétés ne déclenchent pas d'actions en double. */
let inFlight = false;
export async function act(a: GameAction) {
  if (inFlight) return undefined;
  inFlight = true;
  try {
    return await attempt(call('game:action', a), (r) => r.message);
  } finally {
    inFlight = false;
  }
}

/** Sélecteur modal générique (choix d'une option, ou saisie d'un texte comme un code). */
interface PickerState {
  open:
    | { kind: 'choice'; title: string; options: { id: string; label: string; hint?: string }[]; onPick: (id: string) => void }
    | { kind: 'text'; title: string; hint: string; placeholder?: string; onSubmit: (text: string) => void }
    | null;
  ask: (title: string, options: { id: string; label: string; hint?: string }[], onPick: (id: string) => void) => void;
  askText: (title: string, hint: string, onSubmit: (text: string) => void, placeholder?: string) => void;
  close: () => void;
}
export const usePicker = create<PickerState>((set) => ({
  open: null,
  ask: (title, options, onPick) => set({ open: { kind: 'choice', title, options, onPick } }),
  askText: (title, hint, onSubmit, placeholder) => set({ open: { kind: 'text', title, hint, onSubmit, placeholder } }),
  close: () => set({ open: null }),
}));

/** État de l'interface de jeu : tiroir (onglets 1–4), chat (Entrée), menu pause (Échap). */
export const useChatFocus = create<{
  channel: string;
  setChannel: (c: string) => void;
  tab: number | null;
  setTab: (t: number | null) => void;
  toggleTab: (t: number) => void;
  chatOpen: boolean;
  setChatOpen: (o: boolean) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
}>((set, get) => ({
  channel: 'general',
  setChannel: (channel) => set({ channel, chatOpen: true }),
  tab: null,
  setTab: (tab) => set({ tab }),
  toggleTab: (t) => set({ tab: get().tab === t ? null : t }),
  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  paused: false,
  setPaused: (paused) => set({ paused }),
}));

/** Cible visée (raycast de la vue 3D) : « o:id », « b:id », « p:id », « f:id », « t:id ». */
export const useTarget = create<{ key: string | null; set: (k: string | null) => void }>((set) => ({
  key: null,
  set: (key) => set({ key }),
}));

export interface TargetAction {
  label: string;
  run: () => void;
}

const destructibles = (inv: ObjectView[]) => inv.filter((o) => o.caps?.includes('burn'));

/**
 * Actions possibles sur la cible visée : la première est l'action principale (touche E),
 * les autres sont proposées par la touche F (menu contextuel).
 */
export function targetActions(g: GameSelfView, key: string | null): { title: string; actions: TargetAction[] } | null {
  if (!key || !g.alive || g.epilogue || g.arrested.includes(g.you)) return null;
  const [kind, id] = [key.slice(0, 1), key.slice(2)];
  const tool = (t: string) => g.role?.tools.find((x) => x.id === t && (x.usesLeft === undefined || x.usesLeft > 0));
  const picker = usePicker.getState();
  const inv = g.inventory;
  const cloth = inv.find((o) => o.type === 'cloth');
  const out: TargetAction[] = [];
  if (kind === 'o') {
    const o = g.objects.find((x) => x.id === id);
    if (!o) return null;
    out.push({ label: 'Ramasser', run: () => act({ type: 'take', objectId: o.id }) });
    out.push({ label: o.caps?.includes('read') ? 'Lire' : 'Examiner', run: () => act({ type: 'examine', objectId: o.id }) });
    if (o.caps?.includes('code')) out.push({ label: 'Saisir le code', run: () => picker.askText(`${o.name}`, o.lockHint ?? 'Code', (code) => act({ type: 'unlock', objectId: o.id, code })) });
    if (o.caps?.includes('key')) out.push({ label: 'Ouvrir avec une clé', run: () => act({ type: 'open', objectId: o.id }) });
    if (tool('analyze_prints')) out.push({ label: 'Analyser les empreintes', run: () => act({ type: 'tool', toolId: 'analyze_prints', targetId: o.id }) });
    if (tool('bypass_lock') && o.locked) out.push({ label: 'Contourner le verrou', run: () => act({ type: 'tool', toolId: 'bypass_lock', targetId: o.id }) });
    if (cloth) out.push({ label: 'Essuyer', run: () => act({ type: 'clean', toolId: cloth.id, targetKind: 'object', targetId: o.id }) });
    return { title: `${o.icon} ${o.name}`, actions: out };
  }
  if (kind === 'b') {
    const b = g.bodies.find((x) => x.id === id);
    if (!b) return null;
    out.push({ label: 'Fouiller le corps', run: () => act({ type: 'search_body', bodyId: b.id }) });
    if (tool('examine_body')) out.push({ label: 'Autopsie', run: () => act({ type: 'tool', toolId: 'examine_body' }) });
    return { title: `Corps de ${b.name}`, actions: out };
  }
  if (kind === 'p') {
    const p = g.players.find((x) => x.id === id);
    if (!p) return null;
    out.push({ label: 'Murmurer', run: () => useChatFocus.getState().setChannel(`dm:${p.id}`) });
    const rels: RelationType[] = ['FRIEND', 'ALLY', 'PACT', 'ENEMY'];
    out.push({
      label: 'Relation…',
      run: () =>
        picker.ask(`Relation avec ${p.name}`, rels.map((r) => ({ id: r, label: r === 'ENEMY' ? 'Déclarer : ennemi·e' : `Proposer : ${REL_LABEL[r].toLowerCase()}`, hint: r === 'PACT' ? 'secret, le rompre est une trahison' : r === 'ALLY' ? 'canal privé, positions partagées' : undefined })), (r) =>
          act({ type: 'relation', op: 'propose', relType: r as RelationType, targetId: p.id }),
        ),
    });
    if (inv.length) out.push({ label: 'Donner…', run: () => picker.ask(`Donner à ${p.name}`, inv.map((o) => ({ id: o.id, label: `${o.icon} ${o.name}` })), (oid) => act({ type: 'give', objectId: oid, targetId: p.id })) });
    if (tool('take_prints')) out.push({ label: 'Relever ses empreintes', run: () => act({ type: 'tool', toolId: 'take_prints', targetId: p.id }) });
    if (tool('examine_shoes')) out.push({ label: 'Examiner ses semelles', run: () => act({ type: 'tool', toolId: 'examine_shoes', targetId: p.id }) });
    return { title: `👤 ${p.name}`, actions: out };
  }
  if (kind === 'f') {
    const f = furnitureById(id);
    if (!f) return null;
    const lock = g.lockedFurniture.find((l) => l.id === f.id);
    if (lock?.kind === 'code') out.push({ label: 'Saisir le code', run: () => picker.askText(f.name, 'Code à quatre chiffres', (code) => act({ type: 'unlock_furniture', furnitureId: f.id, code })) });
    if (lock?.kind === 'key') out.push({ label: 'Ouvrir avec une clé', run: () => act({ type: 'unlock_furniture', furnitureId: f.id }) });
    if (lock) return { title: `🔒 ${f.name}`, actions: out };
    if (f.hiding) out.push({ label: 'Fouiller', run: () => act({ type: 'search', furnitureId: f.id }) });
    if (f.kind === 'sink') out.push({ label: 'Se laver les mains', run: () => act({ type: 'wash' }) });
    if (f.kind === 'fireplace' && destructibles(inv).length)
      out.push({ label: 'Jeter au feu…', run: () => picker.ask('Jeter au feu', destructibles(inv).map((o) => ({ id: o.id, label: `${o.icon} ${o.name}` })), (oid) => act({ type: 'destroy', objectId: oid })) });
    if (f.hiding && inv.length) out.push({ label: 'Cacher ici…', run: () => picker.ask(`Cacher dans : ${f.name}`, inv.map((o) => ({ id: o.id, label: `${o.icon} ${o.name}` })), (oid) => act({ type: 'hide', objectId: oid, furnitureId: f.id })) });
    return out.length ? { title: f.name, actions: out } : null;
  }
  if (kind === 't') {
    const t = g.traces.find((x) => x.id === id);
    if (!t || !cloth) return null;
    out.push({ label: 'Nettoyer', run: () => act({ type: 'clean', toolId: cloth.id, targetKind: 'trace', targetId: t.id }) });
    return { title: t.label, actions: out };
  }
  return null;
}
