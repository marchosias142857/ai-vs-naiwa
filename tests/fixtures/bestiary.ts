import type { CombatWorld } from '../../src/sim/combat/api';
import { game } from '../../src/main';
import type { InputScene } from '../../src/game/ui/InputScene';
import { combatPause } from '../../src/game/world/combatPause';

const status = () => {
  const hub = game.scene.getScene('Hub'),
    ui = game.scene.getScene('InputUI') as InputScene;
  const sim = (hub as unknown as { sim: CombatWorld }).sim;
  const player = sim.getActor(sim.playerId!)!;
  return {
    vx: player.vx,
    vy: player.vy,
    x: ui.playerX,
    y: ui.playerY,
    textures: game.textures.getTextureKeys().length,
    children: hub.children.length,
    worldListeners: hub.physics.world.listenerCount('worldstep'),
    scaleListeners: game.scale.listenerCount('resize'),
    gamePauseListeners: game.events.listenerCount('lifecycle:pause'),
    paused: combatPause(hub)?.blocked,
  };
};
declare global {
  interface Window {
    bestiaryFixture: { status: typeof status };
  }
}
window.bestiaryFixture = { status };
