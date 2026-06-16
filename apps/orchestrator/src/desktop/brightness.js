import { isWin, isMac, safeExec, optionalImport, ok, fail } from './platform.js';

// Contrôle de la luminosité de l'écran.
// Librairie `brightness` (npm) en priorité, sinon commandes natives.
// Échelle interne : 0–100 (%). La lib `brightness` utilise 0–1.

const STEP = 15;

async function getLib() {
  return optionalImport('brightness');
}

const clamp = (v) => Math.max(0, Math.min(100, v));

export async function setBrightness(level) {
  const target = clamp(Number(level));
  const lib = await getLib();
  if (lib) {
    await lib.set(target / 100);
    return ok(`Luminosité réglée à ${target}%.`);
  }
  return nativeSet(target);
}

export async function changeBrightness(direction) {
  const lib = await getLib();
  if (lib) {
    const current = Math.round((await lib.get()) * 100);
    const next = clamp(current + (direction === 'up' ? STEP : -STEP));
    await lib.set(next / 100);
    return ok(`Luminosité ${direction === 'up' ? 'augmentée' : 'baissée'} à ${next}%.`);
  }
  return nativeSet(direction === 'up' ? 100 : 50);
}

// --- Repli natif ---
async function nativeSet(level) {
  if (isWin) {
    const res = await safeExec(
      `powershell -NoProfile -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${level})"`
    );
    return res.ok ? ok(`Luminosité réglée à ${level}%.`) : fail('Échec luminosité (écran non compatible WMI ?).');
  }
  if (isMac) {
    // Nécessite l'utilitaire `brightness` (brew install brightness).
    const res = await safeExec(`brightness ${(level / 100).toFixed(2)}`);
    return res.ok ? ok(`Luminosité réglée à ${level}%.`) : fail('Installez `brightness` (brew) ou la lib npm.');
  }
  // Linux : xrandr sur la sortie connectée
  const res = await safeExec(
    `xrandr --output $(xrandr | grep " connected" | head -1 | cut -d" " -f1) --brightness ${(level / 100).toFixed(2)}`
  );
  return res.ok ? ok(`Luminosité réglée à ${level}%.`) : fail('Échec luminosité (xrandr requis).');
}
