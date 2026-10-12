import { useEffect, useState } from 'react';
import type { GameSelfView } from '@shared/types';
import { useStore } from '../../store';
import { CastPortrait } from '../common/CastPortrait';
import { useChatFocus } from './helpers';

const CAMP_TITLE = { murderer: 'Vous êtes le meurtrier', innocent: 'Vous êtes innocent·e', protector: 'Vous protégez le meurtrier' } as const;
const CAMP_GOAL = {
  murderer: 'Ne vous faites pas arrêter. Détruisez les preuves, mentez avec aplomb, orientez les soupçons.',
  innocent: 'Trouvez le meurtrier avant l’arrivée de la police… sans forcément révéler votre propre secret.',
  protector: 'Le meurtrier doit s’en sortir. Brouillez les pistes sans vous faire démasquer.',
} as const;

const storageGet = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const storageSet = (k: string, v: string) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : la carte réapparaîtra, sans gravité */
  }
};

/** Carte de rôle : affichée une seule fois par partie, juste après le plan sur le corps. */
export function RoleCard({ ready }: { ready: boolean }) {
  const game = useStore((s) => s.game);
  const [open, setOpen] = useState(false);
  const gameId = game?.gameId;
  const hasDossier = !!game?.dossier;
  useEffect(() => {
    if (!ready || !gameId || !hasDossier) return;
    const key = `ehas.rolecard.${gameId}`;
    if (storageGet(key)) return;
    storageSet(key, '1');
    setOpen(true);
  }, [ready, gameId, hasDossier]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 20000);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  if (!open || !game?.dossier) return null;
  const d = game.dossier;
  const me = game.players.find((p) => p.id === game.you);
  return (
    <div className="rolecard-backdrop fade-in" onClick={() => setOpen(false)}>
      <div className={`rolecard rolecard-${d.camp}`}>
        {me && <CastPortrait castId={me.character.castId} size={120} className="rolecard-portrait" />}
        <div className="rolecard-body">
          <div className="rolecard-kicker">{me ? `${me.character.firstName} ${me.character.lastName}` : ''} — strictement privé</div>
          <div className="rolecard-camp">{CAMP_TITLE[d.camp]}</div>
          <p className="rolecard-goal">{CAMP_GOAL[d.camp]}</p>
          <div className="rolecard-secret">
            <span className="field-label">Votre secret</span>
            {d.secret}
          </div>
          {game.role && (
            <div className="rolecard-role">
              <span className="field-label">Votre spécialité : {game.role.name}</span>
              {game.role.tools.map((t) => t.name).join(' · ')}
            </div>
          )}
          <div className="rolecard-foot">Tout est dans votre dossier (touche <kbd>1</kbd>) · Espace pour commencer</div>
        </div>
      </div>
    </div>
  );
}

interface Lead {
  text: string;
  done: boolean;
}

/** Pistes guidées : déduites uniquement de ce que le joueur a déjà vu (rien n'est révélé). */
export function computeLeads(game: GameSelfView): Lead[] {
  const d = game.dossier;
  const c = game.caseInfo;
  if (!d || !c) return [];
  const refs = new Set(d.evidence.map((e) => e.ref).filter(Boolean));
  const inv = game.inventory;
  const hasAlibi = game.alibis.some((a) => a.playerId === game.you);
  const alibi: Lead = { text: 'Déclarez votre alibi (Enquête, touche 3)', done: hasAlibi };
  if (d.camp !== 'innocent') {
    return [
      alibi,
      { text: 'Le ticket de caisse et la carte mémoire peuvent vous trahir : faites-les disparaître (briquet, cheminée)', done: false },
      { text: 'Le téléphone de la victime vous désigne par un surnom : gardez-le loin des curieux', done: false },
      { text: d.camp === 'murderer' ? 'Outils de l’ombre (Enquête, touche 3) : couper le courant au sous-sol, faire circuler un mot anonyme' : 'Un mot anonyme (Enquête, touche 3) peut détourner les soupçons', done: false },
      { text: d.camp === 'murderer' ? 'Un témoin trop curieux ? Restez seul·e avec lui ou elle et attendez l’occasion' : 'Couvrez le meurtrier : un alibi commun, une fausse piste', done: false },
    ];
  }
  const phone = d.evidence.find((e) => e.ref === 'victim_phone');
  const nick = phone?.lines.map((l) => /Appel entrant de « (.+?) »/.exec(l)?.[1]).find(Boolean);
  const searchedBody = refs.has('diary') || refs.has('victim_phone') || inv.some((o) => o.type === 'phone' || o.name === 'Petite clé dorée');
  return [
    alibi,
    { text: `Fouillez le corps de ${c.victimName} (${c.roomName})`, done: searchedBody },
    { text: 'La petite clé dorée ouvre une boîte cachée dans la chambre de la victime', done: refs.has('diary') },
    { text: 'Le journal donne le code du téléphone', done: refs.has('victim_phone') },
    { text: nick ? `Qui se cache derrière « ${nick} » ? Une photo de groupe donne les surnoms (salon ou hall)` : 'Une photo de groupe donne les surnoms de chacun (salon ou hall)', done: refs.has('group_photo') },
    { text: 'L’ordinateur de la victime est au bureau ou à la bibliothèque — mot de passe dans le journal', done: refs.has('laptop') },
    { text: 'Le coffret à code est caché quelque part dans la villa — code dans l’ordinateur', done: refs.has('usb') },
    { text: 'Un appareil photo traîne : sa carte mémoire montre qui manquait à table', done: refs.has('card') },
  ];
}

/** Panneau des pistes (à gauche), repliable. */
export function LeadsPanel() {
  const game = useStore((s) => s.game);
  const paused = useChatFocus((s) => s.paused);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('ehas.leads.collapsed') === '1';
    } catch {
      return false;
    }
  });
  if (!game || !game.caseInfo || !game.dossier || game.epilogue || !game.alive || game.dossier.arrested || paused) return null;
  const leads = computeLeads(game);
  if (!leads.length) return null;
  const done = leads.filter((l) => l.done).length;
  const pending = leads.filter((l) => !l.done).slice(0, 3);
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem('ehas.leads.collapsed', collapsed ? '0' : '1');
    } catch {
      /* préférence non mémorisée */
    }
  };
  return (
    <div className={`leads ${collapsed ? 'collapsed' : ''}`}>
      <button className="leads-head" onClick={toggle} title="Afficher / masquer les pistes">
        🧭 Pistes <span className="muted">{done}/{leads.length}</span> <span className="leads-caret">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <ul className="leads-list">
          {pending.length === 0 && <li className="lead-done">Toutes les pistes sont explorées : confrontez, votez.</li>}
          {pending.map((l, i) => (
            <li key={l.text} className={i === 0 ? 'lead-next' : ''}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
