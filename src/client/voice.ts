/**
 * Chat vocal de proximité (WebRTC pair-à-pair, maillage complet — prévu pour ≤ 8 joueurs).
 * Le serveur ne relaie que la signalisation ; l'audio ne passe jamais par lui.
 *
 * Règle de jeu : on n'entend que les joueurs qu'on VOIT (même pièce / porte ouverte),
 * avec un volume qui baisse avec la distance. Les morts s'entendent entre eux et entendent tout,
 * mais les vivants ne les entendent pas.
 */
import type { GameSelfView } from '@shared/types';
import type { VoiceSignal } from '@shared/protocol';
import { call, getSocket } from './net/socket';

const ICE: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser?: AnalyserNode;
  level: number;
}

type Listener = () => void;

class VoiceManager {
  enabled = false;
  muted = false;
  /** joueurs en train de parler (dont vous) */
  speaking = new Set<string>();
  error: string | null = null;
  private me: string | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peers = new Map<string, Peer>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private bound = false;
  private view: GameSelfView | null = null;

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  setView(v: GameSelfView | null) {
    this.view = v;
    this.me = v?.you ?? this.me;
  }

  async enable() {
    if (this.enabled) return;
    this.error = null;
    // Créé pendant le clic (geste utilisateur), sinon le navigateur le laisse en pause
    this.ctx = new AudioContext();
    this.ctx.resume().catch(() => {});
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.error = 'Micro refusé ou indisponible.';
      this.ctx.close();
      this.ctx = null;
      this.emit();
      return;
    }
    this.localAnalyser = this.ctx.createAnalyser();
    this.localAnalyser.fftSize = 512;
    this.ctx.createMediaStreamSource(this.stream).connect(this.localAnalyser);
    this.bindSocket();
    this.enabled = true;
    this.setMuted(this.muted);
    try {
      const { peers } = await call('voice:join');
      for (const id of peers) await this.connect(id, true);
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.timer = setInterval(() => this.tick(), 150);
    this.emit();
  }

  disable() {
    if (!this.enabled) return;
    getSocket()?.emit('voice:leave');
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.enabled = false;
    this.speaking.clear();
    this.emit();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !m));
    this.emit();
  }

  private bindSocket() {
    const s = getSocket();
    if (!s || this.bound) return;
    this.bound = true;
    s.on('voice:peer-joined', () => {
      /* le nouveau venu initie la connexion : on attend son offre */
    });
    s.on('voice:peer-left', (id) => this.drop(id));
    s.on('voice:signal', ({ from, data }) => this.onSignal(from, data));
    s.on('disconnect', () => {
      for (const id of [...this.peers.keys()]) this.drop(id);
    });
  }

  private send(to: string, data: VoiceSignal) {
    getSocket()?.emit('voice:signal', { to, data });
  }

  private async connect(id: string, initiator: boolean): Promise<Peer> {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection(ICE);
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = 0;
    const peer: Peer = { pc, audio, level: 0 };
    this.peers.set(id, peer);
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.onicecandidate = (e) => e.candidate && this.send(id, { candidate: e.candidate.toJSON() as { candidate: string } });
    pc.ontrack = (e) => {
      const remote = e.streams[0];
      audio.srcObject = remote;
      audio.play().catch(() => {});
      if (this.ctx) {
        this.ctx.resume().catch(() => {});
        peer.analyser = this.ctx.createAnalyser();
        peer.analyser.fftSize = 512;
        this.ctx.createMediaStreamSource(remote).connect(peer.analyser);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id);
    };
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send(id, { sdp: { type: 'offer', sdp: offer.sdp ?? '' } });
    }
    return peer;
  }

  private async onSignal(from: string, data: VoiceSignal) {
    if (!this.enabled) return;
    try {
      if ('sdp' in data) {
        const peer = await this.connect(from, false);
        await peer.pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          this.send(from, { sdp: { type: 'answer', sdp: answer.sdp ?? '' } });
        }
      } else if ('candidate' in data) {
        await this.peers.get(from)?.pc.addIceCandidate(data.candidate);
      }
    } catch {
      /* signalisation hors d'ordre : ignorée */
    }
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    this.peers.delete(id);
    this.speaking.delete(id);
    this.emit();
  }

  private level(an: AnalyserNode | null | undefined) {
    if (!an) return 0;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    return Math.sqrt(sum / buf.length);
  }

  /** Volumes de proximité + détection de parole. */
  private tick() {
    const v = this.view;
    const before = [...this.speaking].join();
    this.speaking.clear();
    if (this.me && !this.muted && this.level(this.localAnalyser) > 0.04) this.speaking.add(this.me);
    const me = v?.players.find((p) => p.id === v.you);
    for (const [id, peer] of this.peers) {
      const other = v?.players.find((p) => p.id === id);
      let vol = 0;
      if (v && other) {
        if (v.epilogue) vol = 1;
        else if (!v.alive) vol = 0.85; // les morts entendent tout
        else if (!other.alive) vol = 0; // les vivants n'entendent pas les morts
        else if (other.pos && !other.viaAlliance && me?.pos) {
          const d = Math.hypot(other.pos.x - me.pos.x, other.pos.y - me.pos.y);
          vol = Math.max(0.1, Math.min(1, 1 - (d - 2) / 10));
        }
      }
      peer.audio.volume = vol;
      if (vol > 0 && this.level(peer.analyser) > 0.03) this.speaking.add(id);
    }
    if ([...this.speaking].join() !== before) this.emit();
  }
}

export const voice = new VoiceManager();
