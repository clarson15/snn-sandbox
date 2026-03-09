export const HUD_VISIBILITY_PRESET_STORAGE_KEY = 'snn-sandbox.runtimeHudVisibilityPreset';
export const HUD_VISIBILITY_PRESETS = Object.freeze({
  MINIMAL: 'minimal',
  DETAILED: 'detailed'
});

export const DEFAULT_HUD_VISIBILITY_PRESET = HUD_VISIBILITY_PRESETS.DETAILED;

export function normalizeHudVisibilityPreset(value) {
  if (value === HUD_VISIBILITY_PRESETS.MINIMAL || value === HUD_VISIBILITY_PRESETS.DETAILED) {
    return value;
  }

  return DEFAULT_HUD_VISIBILITY_PRESET;
}

export function loadHudVisibilityPreset(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return DEFAULT_HUD_VISIBILITY_PRESET;
  }

  return normalizeHudVisibilityPreset(storage.getItem(HUD_VISIBILITY_PRESET_STORAGE_KEY));
}

export function saveHudVisibilityPreset(preset, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') {
    return;
  }

  storage.setItem(HUD_VISIBILITY_PRESET_STORAGE_KEY, normalizeHudVisibilityPreset(preset));
}
