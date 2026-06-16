import { isWin, isMac, safeExec, optionalImport, ok, fail } from './platform.js';

// Contrôle du volume système.
// Priorité à la librairie `loudness` (npm, multiplateforme). Repli commandes OS.

const STEP = 10; // pas en pourcentage

async function getLib() {
  return optionalImport('loudness');
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

export async function setVolume(level) {
  const target = clamp(Number(level));
  const loudness = await getLib();
  if (loudness) {
    await loudness.setVolume(target);
    return ok(`Volume réglé à ${target}%.`);
  }
  return adjustNative(`set:${target}`);
}

export async function changeVolume(direction) {
  const loudness = await getLib();
  if (loudness) {
    const current = await loudness.getVolume();
    const next = clamp(current + (direction === 'up' ? STEP : -STEP));
    await loudness.setVolume(next);
    return ok(`Volume ${direction === 'up' ? 'augmenté' : 'baissé'} à ${next}%.`);
  }
  return adjustNative(direction);
}

export async function toggleMute() {
  const loudness = await getLib();
  if (loudness) {
    const muted = await loudness.getMuted();
    await loudness.setMuted(!muted);
    return ok(muted ? 'Son réactivé.' : 'Son coupé.');
  }
  return adjustNative('mute');
}

// --- Repli commandes natives (si loudness absent) ---
async function adjustNative(action) {
  if (isWin) {
    // Nécessite nircmd.exe dans le PATH.
    const map = {
      up: 'changesysvolume 6553',
      down: 'changesysvolume -6553',
      mute: 'mutesysvolume 2',
    };
    const cmd = map[action] ?? (action.startsWith('set:') ? `setsysvolume ${Math.round((Number(action.split(':')[1]) / 100) * 65535)}` : null);
    if (!cmd) return fail('Action volume non supportée.');
    const res = await safeExec(`nircmd.exe ${cmd}`);
    return res.ok ? ok('Volume modifié.') : fail('Installez `loudness` (npm) ou nircmd.exe.');
  }
  if (isMac) {
    const map = {
      up: 'set volume output volume (output volume of (get volume settings) + 10)',
      down: 'set volume output volume (output volume of (get volume settings) - 10)',
      mute: 'set volume output muted true',
    };
    const script = map[action] ?? (action.startsWith('set:') ? `set volume output volume ${action.split(':')[1]}` : null);
    if (!script) return fail('Action volume non supportée.');
    const res = await safeExec(`osascript -e "${script}"`);
    return res.ok ? ok('Volume modifié.') : fail('Échec contrôle volume.');
  }
  // Linux (PulseAudio)
  const map = {
    up: 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
    down: 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
    mute: 'pactl set-sink-mute @DEFAULT_SINK@ toggle',
  };
  const cmd = map[action] ?? (action.startsWith('set:') ? `pactl set-sink-volume @DEFAULT_SINK@ ${action.split(':')[1]}%` : null);
  if (!cmd) return fail('Action volume non supportée.');
  const res = await safeExec(cmd);
  return res.ok ? ok('Volume modifié.') : fail('Échec contrôle volume (installez pactl ou `loudness`).');
}
