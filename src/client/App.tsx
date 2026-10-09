import { useEffect } from 'react';
import { GAME_NAME } from '@shared/config';
import { useStore } from './store';
import { audio } from './audio';
import { preloadRealistic } from './three/realistic';
import { MenuBackground3D } from './ui/common/MenuBackground3D';
import { Toasts, ActionFlash } from './ui/common/Toasts';
import { AuthScreen, ResetPasswordScreen, UsernameScreen } from './ui/auth/AuthScreen';
import { MainMenu } from './ui/home/MainMenu';
import { PlayScreen } from './ui/servers/PlayScreen';
import { ServersScreen } from './ui/servers/ServersScreen';
import { CreateGame } from './ui/servers/CreateGame';
import { JoinGame } from './ui/servers/JoinGame';
import { FriendsScreen } from './ui/friends/FriendsScreen';
import { ProfileScreen } from './ui/profile/ProfileScreen';
import { SettingsScreen } from './ui/settings/SettingsScreen';
import { LobbyScreen } from './ui/lobby/LobbyScreen';
import { IntroScreen } from './game/intro/IntroScreen';
import { GameScreen } from './ui/game/GameScreen';

export function App() {
  const screen = useStore((s) => s.screen);
  const boot = useStore((s) => s.boot);
  const connected = useStore((s) => s.connected);
  const user = useStore((s) => s.user);
  const bootMessage = useStore((s) => s.bootMessage);

  useEffect(() => {
    document.title = GAME_NAME;
    const s = useStore.getState().settings;
    audio.setVolumes(s.music, s.sfx);
    boot();
    preloadRealistic();
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, [boot]);

  const inGame = screen === 'game';
  return (
    <div className={`app screen-${screen}`}>
      {!inGame && <MenuBackground3D dim={screen !== 'menu' && screen !== 'auth' && screen !== 'boot'} />}
      {screen === 'boot' && (
        <div className="center-message">
          {GAME_NAME}
          {bootMessage && <div className="muted small boot-message">{bootMessage}</div>}
        </div>
      )}
      {screen === 'auth' && <AuthScreen />}
      {screen === 'username' && <UsernameScreen />}
      {screen === 'reset' && <ResetPasswordScreen />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'play' && <PlayScreen />}
      {screen === 'servers' && <ServersScreen />}
      {screen === 'create' && <CreateGame />}
      {screen === 'join' && <JoinGame />}
      {screen === 'friends' && <FriendsScreen />}
      {screen === 'profile' && <ProfileScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {inGame && <GameScreen />}
      <IntroScreen />
      <Toasts />
      <ActionFlash />
      {user && !connected && screen !== 'auth' && <div className="offline-banner">Connexion au serveur perdue — reconnexion…</div>}
    </div>
  );
}
