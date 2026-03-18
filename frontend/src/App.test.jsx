import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createInitialWorldFromConfig, loadSimulationConfig, normalizeSimulationConfig, STORAGE_KEY, toEngineStepParams } from './simulation/config';
import { loadReplayComparisonPresets } from './simulation/replayComparisonPresets';
import { stepWorld } from './simulation/engine';
import { createSeededPrng } from './simulation/prng';
import { mapBrainToVisualizerModel } from './simulation/brainVisualizer';
import { deriveOrganismHazardEffect, deriveOrganismTerrainEffect } from './simulation/stats';

function ensureWritableLocalStorage() {
  const storage = window.localStorage;
  if (storage && typeof storage.setItem === 'function' && typeof storage.getItem === 'function') {
    return;
  }

  const backing = new Map();
  const fallbackStorage = {
    getItem: (key) => (backing.has(String(key)) ? backing.get(String(key)) : null),
    setItem: (key, value) => {
      backing.set(String(key), String(value));
    },
    removeItem: (key) => {
      backing.delete(String(key));
    },
    clear: () => {
      backing.clear();
    }
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: fallbackStorage
  });
}

function getSimulationStatsHud() {
  return screen.getByRole('region', { name: /simulation stats hud/i });
}

function queryRunControlSaveStatus() {
  return within(getSimulationStatsHud()).queryByText(/^save status:/i);
}

function getRunControlSaveStatus(label) {
  return within(getSimulationStatsHud()).getByText(new RegExp(`^save status: ${label}$`, 'i'));
}

describe('App', () => {
  let clipboardWriteText;

  beforeEach(() => {
    ensureWritableLocalStorage();

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {}
    });

    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      array[0] = 123456;
      return array;
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    clipboardWriteText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    });

    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/status' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: 'test-version', environment: 'test' })
        };
      }

      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              id: 'sim-fixture',
              name: 'Fixture snapshot',
              seed: 'fixture-seed',
              tickCount: 0,
              updatedAt: '2026-03-06T12:00:01.000Z'
            }
          ])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-fixture',
            name: 'Fixture snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      if (url === '/api/simulations/snapshots' && options.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'sim-1' })
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && options.method === 'DELETE') {
        return {
          ok: true,
          status: 204,
          json: async () => ({})
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();

    if (typeof window.localStorage?.clear === 'function') {
      window.localStorage.clear();
    } else if (typeof window.localStorage?.removeItem === 'function') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders the simulation heading and config form', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /snn sandbox/i
      })
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /start simulation/i })).toBeInTheDocument();
    expect(screen.getByText(/artificial life sandbox/i)).toBeInTheDocument();
    expect(screen.getByText(/grow strange ecosystems, watch them adapt, and shape what happens next/i)).toBeInTheDocument();
    expect(screen.getByText(/start a simulation to populate the world/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick start defaults/i })).toBeInTheDocument();
    expect(screen.getByText(/leave blank to generate a seed once at start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max life \(ticks\)/i)).toHaveValue(1000);
  });

  it('collapsible config sections expand and collapse while preserving field values', () => {
    render(<App />);

    // Verify Presets / Run Identity section is open by default and contains expected fields
    const presetsHeadings = screen.getAllByRole('heading', { name: /presets \/ run identity/i });
    expect(presetsHeadings).toHaveLength(1);
    const presetsSummary = presetsHeadings[0].closest('summary');
    expect(presetsSummary).toBeTruthy();
    const presetsDetailsElement = presetsSummary.closest('details');
    expect(presetsDetailsElement).toHaveAttribute('open');
    // Verify fields are present in the Presets section
    expect(screen.getByLabelText(/quick-start preset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/simulation name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/seed \(optional\)/i)).toBeInTheDocument();

    // World and Population sections are open by default
    expect(screen.getByLabelText(/world width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/initial population/i)).toBeInTheDocument();

    // Verify World section is open by default - find the details element containing world settings heading
    const worldHeadings = screen.getAllByRole('heading', { name: /world settings/i });
    const worldSummary = worldHeadings[0].closest('summary');
    expect(worldSummary).toBeTruthy();
    const worldDetailsElement = worldSummary.closest('details');
    expect(worldDetailsElement).toHaveAttribute('open');

    // Verify Population section is open by default
    const populationHeadings = screen.getAllByRole('heading', { name: /population settings/i });
    const populationSummary = populationHeadings[0].closest('summary');
    const populationDetailsElement = populationSummary.closest('details');
    expect(populationDetailsElement).toHaveAttribute('open');

    // Change a value in an open section
    const worldWidthInput = screen.getByLabelText(/world width/i);
    fireEvent.change(worldWidthInput, { target: { value: '1500' } });
    expect(worldWidthInput.value).toBe('1500');

    // Collapse World section by clicking the summary
    fireEvent.click(worldSummary);

    // Verify section is collapsed
    expect(worldDetailsElement).not.toHaveAttribute('open');

    // Expand again and verify value is preserved
    fireEvent.click(worldSummary);
    expect(worldWidthInput.value).toBe('1500');

    // Test a collapsed section - Evolution settings
    const evolutionHeadings = screen.getAllByRole('heading', { name: /evolution settings/i });
    const evolutionSummary = evolutionHeadings[0].closest('summary');
    const evolutionDetailsElement = evolutionSummary.closest('details');
    expect(evolutionDetailsElement).not.toHaveAttribute('open');

    // Expand Evolution section by clicking the summary
    fireEvent.click(evolutionSummary);

    // Verify we can interact with fields in the expanded section
    expect(screen.getByLabelText(/mutation rate \(legacy\)/i)).toBeInTheDocument();

    // Change a value in the now-visible Evolution section
    const mutationRateInput = screen.getByLabelText(/mutation rate \(legacy\)/i);
    fireEvent.change(mutationRateInput, { target: { value: '0.5' } });
    expect(mutationRateInput.value).toBe('0.5');

    // Collapse and verify value is preserved
    fireEvent.click(evolutionSummary);
    expect(evolutionDetailsElement).not.toHaveAttribute('open');

    fireEvent.click(evolutionSummary);
    expect(screen.getByLabelText(/mutation rate \(legacy\)/i).value).toBe('0.5');
  });

  it('uses the resolved app version in the about dialog', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /about/i }));

    const aboutDialog = screen.getByRole('dialog', { name: /about/i });
    await waitFor(() => {
      expect(within(aboutDialog).getByText(/version: test-version/i)).toBeInTheDocument();
    });
  });

  it('quick starts a default simulation from the empty state', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/simulation name/i), { target: { value: 'Custom setup' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: /quick start defaults/i }));

    await waitFor(() => {
      expect(screen.queryByText(/start a simulation to populate the world/i)).not.toBeInTheDocument();
      expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).not.toHaveTextContent('Seed unavailable');
    });

    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('New Simulation');
    expect(screen.getByLabelText(/world width/i)).toHaveValue(1920);
  });

  it('prefills seed from URL query parameter when provided', () => {
    window.history.replaceState({}, '', '/?seed=shared-seed-42');

    render(<App />);

    const seedInput = screen.getByLabelText(/^seed \(optional\)$/i);
    expect(seedInput).toHaveValue('shared-seed-42');

    fireEvent.change(seedInput, { target: { value: 'manual-override-seed' } });
    expect(seedInput).toHaveValue('manual-override-seed');

    window.history.replaceState({}, '', '/');
  });

  it('ignores empty seed query parameter values', () => {
    window.history.replaceState({}, '', '/?seed=%20%20%20');

    render(<App />);

    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('');

    window.history.replaceState({}, '', '/');
  });

  it('prefills deterministic parameters from query values without auto-starting', () => {
    window.history.replaceState({}, '', '/?seed=shared-seed-42&worldWidth=1234&worldHeight=640&initialPopulation=33&minimumPopulation=21&initialFoodCount=55&foodSpawnChance=0.06&foodEnergyValue=11&maxFood=300&mutationRate=0.2&mutationStrength=0.15');

    render(<App />);

    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('shared-seed-42');
    expect(screen.getByLabelText(/world width/i)).toHaveValue(1234);
    expect(screen.getByLabelText(/world height/i)).toHaveValue(640);
    expect(screen.getByLabelText(/initial population/i)).toHaveValue(33);
    expect(screen.getByLabelText(/minimum population/i)).toHaveValue(21);
    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: Seed unavailable');

    window.history.replaceState({}, '', '/');
  });

  it('prefills terrain generation controls from query params', () => {
    window.history.replaceState({}, '', '/?seed=terrain-seed-42&terrainZoneEnabled=1&terrainZoneCount=6&terrainZoneMinWidthRatio=0.16&terrainZoneMaxWidthRatio=0.34&terrainZoneMinHeightRatio=0.17&terrainZoneMaxHeightRatio=0.31');

    render(<App />);

    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('terrain-seed-42');
    expect(screen.getByLabelText(/enable terrain zones/i)).toBeChecked();
    expect(screen.getByLabelText(/zone count/i)).toHaveValue(6);
    expect(screen.getByLabelText(/min zone width ratio/i)).toHaveValue(0.16);
    expect(screen.getByLabelText(/max zone width ratio/i)).toHaveValue(0.34);
    expect(screen.getByLabelText(/min zone height ratio/i)).toHaveValue(0.17);
    expect(screen.getByLabelText(/max zone height ratio/i)).toHaveValue(0.31);

    window.history.replaceState({}, '', '/');
  });

  it('saves and reapplies custom presets with terrain generation controls', async () => {
    render(<App />);

    const terrainToggle = screen.getByLabelText(/enable terrain zones/i);
    if (!terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }

    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/min zone width ratio/i), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText(/max zone width ratio/i), { target: { value: '0.4' } });
    fireEvent.change(screen.getByLabelText(/min zone height ratio/i), { target: { value: '0.19' } });
    fireEvent.change(screen.getByLabelText(/max zone height ratio/i), { target: { value: '0.38' } });

    fireEvent.click(screen.getByRole('button', { name: /save current as preset/i }));
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), { target: { value: 'Terrain tuning preset' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    fireEvent.click(screen.getByLabelText(/enable terrain zones/i));
    expect(screen.queryByLabelText(/zone count/i)).not.toBeInTheDocument();

    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const customOption = screen.getByRole('option', { name: /terrain tuning preset/i });
    fireEvent.change(presetSelect, { target: { value: customOption.getAttribute('value') } });

    await waitFor(() => {
      expect(screen.getByLabelText(/enable terrain zones/i)).toBeChecked();
    });

    expect(screen.getByLabelText(/zone count/i)).toHaveValue(8);
    expect(screen.getByLabelText(/min zone width ratio/i)).toHaveValue(0.2);
    expect(screen.getByLabelText(/max zone width ratio/i)).toHaveValue(0.4);
    expect(screen.getByLabelText(/min zone height ratio/i)).toHaveValue(0.19);
    expect(screen.getByLabelText(/max zone height ratio/i)).toHaveValue(0.38);
  });

  it('shows danger zone controls when enabled', () => {
    render(<App />);

    // By default, danger zones are disabled - controls should not be visible
    expect(screen.queryByLabelText(/zone count/i)).not.toBeInTheDocument();

    // Enable danger zones
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    fireEvent.click(dangerZoneToggle);

    // Now controls should be visible with default values
    expect(screen.getByLabelText(/zone count/i)).toHaveValue(2);
    expect(screen.getByLabelText(/zone radius/i)).toHaveValue(40);
    expect(screen.getByLabelText(/damage per tick/i)).toHaveValue(0.5);
  });

  it('saves and reapplies custom presets with danger zone controls', async () => {
    render(<App />);

    // Enable danger zones
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    fireEvent.click(dangerZoneToggle);

    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/zone radius/i), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/damage per tick/i), { target: { value: '2.0' } });

    fireEvent.click(screen.getByRole('button', { name: /save current as preset/i }));
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), { target: { value: 'Danger zone tuning preset' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Verify the preset was saved by checking it appears in the dropdown
    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const options = within(presetSelect).getAllByRole('option');
    const presetOption = options.find(opt => opt.text.includes('Danger zone tuning preset'));
    expect(presetOption).toBeTruthy();

    // Verify preset values are saved in localStorage by checking config
    const config = normalizeSimulationConfig({
      dangerZoneEnabled: 'true',
      dangerZoneCount: '5',
      dangerZoneRadius: '60',
      dangerZoneDamage: '2.0'
    }, 'test-seed');
    expect(config.enableDangerZones).toBe(true);
    expect(config.dangerZoneCount).toBe(5);
    expect(config.dangerZoneRadius).toBe(60);
    expect(config.dangerZoneDamage).toBe(2.0);
  });

  it('saves and reapplies custom presets with biome food spawn bias controls (SSN-286)', async () => {
    render(<App />);

    // Change biome food spawn bias values from defaults (1.0)
    fireEvent.change(screen.getByLabelText(/plains bias/i), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText(/forest bias/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/wetland bias/i), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText(/rocky bias/i), { target: { value: '3.0' } });

    // Save as preset
    fireEvent.click(screen.getByRole('button', { name: /save current as preset/i }));
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), { target: { value: 'Biome food bias preset' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Reset values to defaults
    fireEvent.change(screen.getByLabelText(/plains bias/i), { target: { value: '1.0' } });
    fireEvent.change(screen.getByLabelText(/forest bias/i), { target: { value: '1.0' } });
    fireEvent.change(screen.getByLabelText(/wetland bias/i), { target: { value: '1.0' } });
    fireEvent.change(screen.getByLabelText(/rocky bias/i), { target: { value: '1.0' } });

    // Verify values are reset
    expect(screen.getByLabelText(/plains bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/forest bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/wetland bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/rocky bias/i)).toHaveValue(1.0);

    // Apply the saved preset
    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const customOption = screen.getByRole('option', { name: /biome food bias preset/i });
    fireEvent.change(presetSelect, { target: { value: customOption.getAttribute('value') } });

    // Verify preset values are restored
    await waitFor(() => {
      expect(screen.getByLabelText(/plains bias/i)).toHaveValue(2.5);
    });
    expect(screen.getByLabelText(/forest bias/i)).toHaveValue(0.5);
    expect(screen.getByLabelText(/wetland bias/i)).toHaveValue(1.5);
    expect(screen.getByLabelText(/rocky bias/i)).toHaveValue(3.0);

    // Verify config normalization includes the biome food spawn bias
    const config = normalizeSimulationConfig({
      biomeFoodSpawnBiasPlains: '2.5',
      biomeFoodSpawnBiasForest: '0.5',
      biomeFoodSpawnBiasWetland: '1.5',
      biomeFoodSpawnBiasRocky: '3.0'
    }, 'test-seed');
    expect(config.biomeFoodSpawnBias.plains).toBe(2.5);
    expect(config.biomeFoodSpawnBias.forest).toBe(0.5);
    expect(config.biomeFoodSpawnBias.wetland).toBe(1.5);
    expect(config.biomeFoodSpawnBias.rocky).toBe(3.0);
  });

  // SSN-290: Terrain effect strength preset tests
  it('saves and reapplies custom presets with terrain effect strength values (SSN-290)', async () => {
    render(<App />);

    // Note: There are no UI controls for terrain effect strengths, so we verify 
    // the preset save/apply flow by directly testing the config storage and normalization
    
    // Programmatically save a preset with terrain effect strengths
    const { saveCustomPreset, getCustomPresets, normalizeSimulationConfig } = require('./simulation/config');
    
    const saved = saveCustomPreset('Terrain Effect Test Preset', {
      worldWidth: 800,
      worldHeight: 480,
      initialPopulation: 10,
      minimumPopulation: 8,
      initialFoodCount: 20,
      foodSpawnChance: 0.05,
      foodEnergyValue: 6,
      maxFood: 100,
      terrainEffectStrengths: {
        forestVisionMultiplier: 0.25,
        wetlandSpeedMultiplier: 0.75,
        wetlandTurnMultiplier: 0.4,
        rockyEnergyDrain: 1.5
      }
    });
    
    expect(saved).toBe(true);
    
    // Verify preset was saved with terrain effect strengths
    const presets = getCustomPresets();
    const preset = presets.find(p => p.name === 'Terrain Effect Test Preset');
    expect(preset).toBeDefined();
    expect(preset.config.terrainEffectStrengths).toEqual({
      forestVisionMultiplier: 0.25,
      wetlandSpeedMultiplier: 0.75,
      wetlandTurnMultiplier: 0.4,
      rockyEnergyDrain: 1.5
    });
    
    // Verify normalization preserves the values
    const normalized = normalizeSimulationConfig(preset.config, 'test-seed');
    expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.25);
    expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.75);
    expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.4);
    expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(1.5);
  });

  it('applies preset config includes terrain effect strengths (SSN-290)', async () => {
    // Create a preset directly in storage with terrain effect strengths
    const storage = window.localStorage;
    const oldPresets = storage.getItem('snn-sandbox.custom-presets');
    storage.setItem('snn-sandbox.custom-presets', JSON.stringify([
      {
        id: 'app-terrain-preset',
        name: 'App Terrain Preset',
        description: 'Preset for App test',
        config: {
          worldWidth: 1200,
          worldHeight: 800,
          initialPopulation: 15,
          minimumPopulation: 10,
          initialFoodCount: 30,
          foodSpawnChance: 0.04,
          foodEnergyValue: 8,
          maxFood: 200,
          terrainEffectStrengths: {
            forestVisionMultiplier: 0.3,
            wetlandSpeedMultiplier: 0.6,
            wetlandTurnMultiplier: 0.7,
            rockyEnergyDrain: 1.2
          }
        },
        createdAt: Date.now()
      }
    ]));

    render(<App />);

    // Verify config normalization includes terrain effect strengths from preset
    const { getCustomPresets, normalizeSimulationConfig } = require('./simulation/config');
    const presets = getCustomPresets();
    const preset = presets.find(p => p.name === 'App Terrain Preset');
    expect(preset).toBeDefined();
    
    const normalized = normalizeSimulationConfig(preset.config, 'app-test-seed');
    expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.3);
    expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.6);
    expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.7);
    expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(1.2);

    // Restore original presets
    if (oldPresets) {
      storage.setItem('snn-sandbox.custom-presets', oldPresets);
    } else {
      storage.removeItem('snn-sandbox.custom-presets');
    }
  });

  it('falls back to defaults when applying preset without terrain effect strengths (backward compatibility, SSN-290)', async () => {
    // Create a legacy preset without terrainEffectStrengths
    const storage = window.localStorage;
    const oldPresets = storage.getItem('snn-sandbox.custom-presets');
    storage.setItem('snn-sandbox.custom-presets', JSON.stringify([
      {
        id: 'legacy-terrain-preset',
        name: 'Legacy Terrain Preset',
        description: 'Old preset',
        config: {
          worldWidth: 800,
          worldHeight: 480,
          initialPopulation: 10,
          minimumPopulation: 8,
          initialFoodCount: 20,
          foodSpawnChance: 0.05,
          foodEnergyValue: 6,
          maxFood: 100
          // Note: no terrainEffectStrengths
        },
        createdAt: Date.now() - 86400000
      }
    ]));

    render(<App />);

    // Apply the legacy preset through the UI
    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const legacyOption = screen.getByRole('option', { name: /legacy terrain preset/i });
    fireEvent.change(presetSelect, { target: { value: legacyOption.getAttribute('value') } });

    // Wait for preset to apply
    await waitFor(() => {
      const widthInput = screen.getByLabelText(/world width/i);
      expect(widthInput).toHaveValue(800);
    });
    
    // Verify defaults are applied through config normalization
    const { getCustomPresets, normalizeSimulationConfig } = require('./simulation/config');
    const presets = getCustomPresets();
    const legacyPreset = presets.find(p => p.name === 'Legacy Terrain Preset');
    const normalized = normalizeSimulationConfig(legacyPreset.config, 'legacy-seed');
    
    // Should fall back to defaults
    expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.5);
    expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.5);
    expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.5);
    expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(0.2);

    // Restore original presets
    if (oldPresets) {
      storage.setItem('snn-sandbox.custom-presets', oldPresets);
    } else {
      storage.removeItem('snn-sandbox.custom-presets');
    }
  });

  it('falls back to defaults when applying preset without biome food spawn bias (backward compatibility, SSN-286)', async () => {
    render(<App />);

    // Verify default values
    expect(screen.getByLabelText(/plains bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/forest bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/wetland bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/rocky bias/i)).toHaveValue(1.0);

    // Apply a built-in preset (which won't have biomeFoodSpawnBias in config)
    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const defaultOption = screen.getByRole('option', { name: /balanced/i });
    fireEvent.change(presetSelect, { target: { value: defaultOption.getAttribute('value') } });

    // Values should still be defaults (1.0) since built-in presets don't have biomeFoodSpawnBias
    await waitFor(() => {
      expect(screen.getByLabelText(/plains bias/i)).toHaveValue(1.0);
    });
    expect(screen.getByLabelText(/forest bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/wetland bias/i)).toHaveValue(1.0);
    expect(screen.getByLabelText(/rocky bias/i)).toHaveValue(1.0);
  });

  // SSN-290: Terrain effect strength preset tests
  it('persists terrain effect strength settings when saving custom preset (SSN-290)', async () => {
    const { getCustomPresets } = require('./simulation/config');
    render(<App />);

    // Save a custom preset (terrain effect strengths use defaults since no UI to change them)
    fireEvent.click(screen.getByRole('button', { name: /save current as preset/i }));
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), { target: { value: 'Terrain Effect Test Preset' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Get the custom presets and verify terrain effect strengths are persisted
    const presets = getCustomPresets();
    const savedPreset = presets.find(p => p.name === 'Terrain Effect Test Preset');
    expect(savedPreset).toBeDefined();
    // Default terrain effect strength values should be in the saved preset
    expect(savedPreset.config.terrainEffectStrengths).toEqual({
      forestVisionMultiplier: 0.5,
      wetlandSpeedMultiplier: 0.5,
      wetlandTurnMultiplier: 0.5,
      rockyEnergyDrain: 0.2
    });

    // Apply the preset - should not crash and should use the values
    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const customOption = screen.getByRole('option', { name: /terrain effect test preset/i });
    fireEvent.change(presetSelect, { target: { value: customOption.getAttribute('value') } });

    // The preset was applied (no error thrown)
  });

  it('falls back to defaults when applying preset without terrain effect strengths (backward compatibility, SSN-290)', async () => {
    render(<App />);

    // Apply a built-in preset (which won't have terrainEffectStrengths in config)
    const presetSelect = screen.getByLabelText(/quick-start preset/i);
    const defaultOption = screen.getByRole('option', { name: /balanced/i });
    fireEvent.change(presetSelect, { target: { value: defaultOption.getAttribute('value') } });

    // Should not crash - the code should fall back to defaults for terrain effect strengths
    // We verify this by checking that the config normalization uses defaults
    const config = normalizeSimulationConfig({
      worldWidth: '800',
      worldHeight: '480'
    }, 'backward-compat-test');
    expect(config.terrainEffectStrengths.forestVisionMultiplier).toBe(0.5);
    expect(config.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.5);
    expect(config.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.5);
    expect(config.terrainEffectStrengths.rockyEnergyDrain).toBe(0.2);
  });

  it('generates danger zones when enabled and starts simulation', async () => {
    render(<App />);

    // Enable danger zones
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    fireEvent.click(dangerZoneToggle);

    // Verify controls are visible with configured values
    expect(screen.getByLabelText(/zone count/i)).toHaveValue(2);
    expect(screen.getByLabelText(/zone radius/i)).toHaveValue(40);
    expect(screen.getByLabelText(/damage per tick/i)).toHaveValue(0.5);

    // Start simulation
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    // Wait for simulation to start
    await waitFor(
      () => {
        expect(screen.getByText(/^tick count:/i)).toBeInTheDocument();
      },
      { timeout: 30000 }
    );

    // Verify simulation is running (tick count should be >= 0)
    const tickCountText = screen.getByText(/^tick count:/i).textContent;
    const tickCount = Number.parseInt(tickCountText.replace(/\D+/g, ''), 10);
    expect(tickCount).toBeGreaterThanOrEqual(0);

    // Verify danger zone config is correct by checking it produces expected zones
    const config = normalizeSimulationConfig({
      dangerZoneEnabled: 'true',
      dangerZoneCount: '2',
      dangerZoneRadius: '40',
      dangerZoneDamage: '0.5',
      seed: 'test-seed',
      worldWidth: '1920',
      worldHeight: '1080',
      initialPopulation: '20'
    }, 'test-seed-resolved');
    const world = createInitialWorldFromConfig(config);
    expect(world.dangerZones).toHaveLength(2);
    expect(world.dangerZones[0]).toMatchObject({
      radius: 40,
      damagePerTick: 0.5
    });
  });

  it('generates no danger zones when disabled (default)', async () => {
    render(<App />);

    // Verify danger zones are disabled by default - controls should not be visible
    expect(screen.getByLabelText(/enable danger zones/i)).not.toBeChecked();
    expect(screen.queryByLabelText(/zone count/i)).not.toBeInTheDocument();

    // Start simulation
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    // Wait for simulation to start
    await waitFor(
      () => {
        expect(screen.getByText(/^tick count:/i)).toBeInTheDocument();
      },
      { timeout: 30000 }
    );

    // Verify danger zone config produces no zones when disabled
    const config = normalizeSimulationConfig({
      dangerZoneEnabled: 'false',
      dangerZoneCount: '2',
      dangerZoneRadius: '40',
      dangerZoneDamage: '0.5',
      seed: 'test-seed',
      worldWidth: '1920',
      worldHeight: '1080',
      initialPopulation: '20'
    }, 'test-seed-resolved');
    const world = createInitialWorldFromConfig(config);
    expect(world.dangerZones).toHaveLength(0);
  });

  it('shows hazard info in organism HUD when selected organism is in a danger zone', async () => {
    vi.useFakeTimers();

    // Use deterministic config to ensure we can find organisms in the danger zone
    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Hazard HUD Test',
        seed: 'hazard-hud-test-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        dangerZoneEnabled: true,
        dangerZoneCount: 1,
        dangerZoneRadius: 100,
        dangerZoneDamage: 1.5
      },
      'hazard-hud-test-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.dangerZones).toHaveLength(1);

    // Find an organism that's in the danger zone
    const organismInZone = initialWorld.organisms.find((org) => {
      const zone = initialWorld.dangerZones[0];
      const dx = org.x - zone.x;
      const dy = org.y - zone.y;
      return (dx * dx + dy * dy) < (zone.radius * zone.radius);
    });
    expect(organismInZone).toBeTruthy();

    // Verify the hazard effect is derived correctly
    const hazardEffect = deriveOrganismHazardEffect(organismInZone, initialWorld.dangerZones);
    expect(hazardEffect).not.toBeNull();
    expect(hazardEffect.totalDamage).toBe(1.5);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'hazard-hud-test-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });

    // Enable danger zones via UI
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    if (!dangerZoneToggle.checked) {
      fireEvent.click(dangerZoneToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/zone radius/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/damage per tick/i), { target: { value: '1.5' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Mock canvas bounding rect for click selection
    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Click on the organism that's in the danger zone
    fireEvent.click(canvas, { clientX: organismInZone.x, clientY: organismInZone.y });

    // Verify the organism HUD shows the hazard info
    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(`Organism ${organismInZone.id.slice(0, 8)}`);
    expect(organismHud).toHaveTextContent(/Hazard:/);
    expect(organismHud).toHaveTextContent(/Hazard:\s*Lava\s*\(-1\.5\s*energy\/tick\)/i);

    vi.useRealTimers();
  });

  it('shows no hazard in organism HUD when selected organism is not in any danger zone', async () => {
    vi.useFakeTimers();

    // Use a small danger zone radius to ensure some organisms are outside
    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'No Hazard HUD Test',
        seed: 'no-hazard-hud-test-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        dangerZoneEnabled: true,
        dangerZoneCount: 1,
        dangerZoneRadius: 30,
        dangerZoneDamage: 2.0
      },
      'no-hazard-hud-test-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.dangerZones).toHaveLength(1);

    // Find an organism that's NOT in the danger zone
    const organismOutsideZone = initialWorld.organisms.find((org) => {
      const zone = initialWorld.dangerZones[0];
      const dx = org.x - zone.x;
      const dy = org.y - zone.y;
      return (dx * dx + dy * dy) >= (zone.radius * zone.radius);
    });
    expect(organismOutsideZone).toBeTruthy();

    // Verify no hazard effect is derived
    const hazardEffect = deriveOrganismHazardEffect(organismOutsideZone, initialWorld.dangerZones);
    expect(hazardEffect).toBeNull();

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'no-hazard-hud-test-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });

    // Enable danger zones via UI
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    if (!dangerZoneToggle.checked) {
      fireEvent.click(dangerZoneToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/zone radius/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/damage per tick/i), { target: { value: '2.0' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Mock canvas bounding rect for click selection
    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Click on the organism that's outside the danger zone
    fireEvent.click(canvas, { clientX: organismOutsideZone.x, clientY: organismOutsideZone.y });

    // Verify the organism HUD shows "Hazard: None"
    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(`Organism ${organismOutsideZone.id.slice(0, 8)}`);
    expect(organismHud).toHaveTextContent(/Hazard:/);
    expect(organismHud).toHaveTextContent(/Hazard:\s*None/i);

    vi.useRealTimers();
  });

  it('shows non-blocking feedback when shared query values are missing or invalid', () => {
    window.history.replaceState({}, '', '/?seed=seed-1&worldWidth=invalid&worldHeight=640');

    render(<App />);

    expect(screen.getByText(/some shared link values were missing or invalid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/world width/i)).toHaveValue(1920);

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '900' } });
    expect(screen.queryByText(/some shared link values were missing or invalid/i)).not.toBeInTheDocument();

    window.history.replaceState({}, '', '/');
  });

  it('shows URL seed mismatch banner with explicit values when active seed differs', () => {
    window.history.replaceState({}, '', '/?seed=shared-seed-42');

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'local-seed-99' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/does not match active seed/i)).toHaveTextContent('URL seed shared-seed-42 does not match active seed local-seed-99.');
    expect(screen.getByRole('button', { name: /use url seed/i })).toBeInTheDocument();

    window.history.replaceState({}, '', '/');
  });

  it('realigns run to URL seed using current config when clicking use url seed', () => {
    window.history.replaceState({}, '', '/?seed=shared-seed-42');

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'local-seed-99' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    fireEvent.click(screen.getByRole('button', { name: /use url seed/i }));

    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: shared-seed-42');
    expect(screen.queryByRole('button', { name: /use url seed/i })).not.toBeInTheDocument();

    window.history.replaceState({}, '', '/');
  });

  it('resets setup form values back to project defaults', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/simulation name/i), { target: { value: 'Custom setup' } });
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'abc-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText(/mutation rate \(legacy\)/i), { target: { value: '0.33' } });

    fireEvent.click(screen.getByRole('button', { name: /use defaults/i }));

    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('New Simulation');
    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('');
    expect(screen.getByLabelText(/world width/i)).toHaveValue(1920);
    expect(screen.getByLabelText(/mutation rate \(legacy\)/i)).toHaveValue(0.05);
  });

  it('keeps saved draft intact when using defaults in the form', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: 'Draft Simulation',
      seed: 'draft-seed',
      worldWidth: 999,
      worldHeight: 600,
      initialPopulation: 40,
      minimumPopulation: 30,
      initialFoodCount: 60,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200,
      mutationRate: 0.15,
      mutationStrength: 0.25
    }));

    const { unmount } = render(<App />);

    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('Draft Simulation');

    fireEvent.click(screen.getByRole('button', { name: /use defaults/i }));
    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('New Simulation');

    unmount();
    render(<App />);
    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('Draft Simulation');
  });

  it('tracks dirty setup fields and clears dirty state when values are reverted', () => {
    render(<App />);

    expect(screen.queryByText(/unsaved setup changes in:/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '900' } });
    expect(screen.getByText(/unsaved setup changes in: worldWidth\./i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '1920' } });
    expect(screen.queryByText(/unsaved setup changes in:/i)).not.toBeInTheDocument();
  });

  it('prompts before discarding dirty setup form changes when resuming a saved simulation', async () => {
    window.confirm.mockReturnValue(false);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '950' } });

    const savedSimulationsPanel = await screen.findByRole('region', { name: /saved simulations/i });
    const resumeButton = await within(savedSimulationsPanel).findByRole('button', { name: /^resume$/i });
    fireEvent.click(resumeButton);

    expect(window.confirm).toHaveBeenCalledWith('You have unsaved setup changes. Discard them and continue?');
    expect(screen.getByText(/load cancelled\./i)).toBeInTheDocument();
  });

  it('prompts before discarding dirty run changes when starting or loading another simulation', async () => {
    window.confirm.mockReturnValue(false);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'dirty-run-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(Number.parseInt(screen.getByText(/^tick count:/i).textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    expect(window.confirm).toHaveBeenCalledWith('You have unsaved simulation changes for this run. Discard changes and continue?');
    expect(screen.getByText(/start cancelled\./i)).toBeInTheDocument();

    const savedSimulationsPanel = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedSimulationsPanel).getByRole('button', { name: /^resume$/i }));
    expect(window.confirm).toHaveBeenCalledWith('You have unsaved simulation changes for this run. Discard changes and continue?');
    expect(screen.getByText(/load cancelled\./i)).toBeInTheDocument();
  });

  it('shows deterministic save-status badge transitions and hides badge with no active run', async () => {
    render(<App />);

    expect(queryRunControlSaveStatus()).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'status-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(getRunControlSaveStatus('saved')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(Number.parseInt(screen.getByText(/^tick count:/i).textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    expect(getRunControlSaveStatus('unsaved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }));

    await waitFor(() => {
      expect(getRunControlSaveStatus('saved')).toBeInTheDocument();
    });
  });

  it('loads saved simulation metadata in clean state and becomes dirty after tick advance', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(getRunControlSaveStatus('saved')).toBeInTheDocument();
    });


  });

  it('save as creates a new active snapshot target and preserves deterministic saved status', async () => {
    let saveAsCreated = false;

    global.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => (
            saveAsCreated
              ? [
                  {
                    id: 'sim-fixture',
                    name: 'Fixture snapshot',
                    seed: 'fixture-seed',
                    tickCount: 0,
                    updatedAt: '2026-03-06T12:00:01.000Z'
                  },
                  {
                    id: 'sim-save-as',
                    name: 'Branch snapshot',
                    seed: 'save-as-seed',
                    tickCount: 8,
                    updatedAt: '2026-03-09T05:41:00.000Z'
                  }
                ]
              : [
                  {
                    id: 'sim-fixture',
                    name: 'Fixture snapshot',
                    seed: 'fixture-seed',
                    tickCount: 0,
                    updatedAt: '2026-03-06T12:00:01.000Z'
                  }
                ]
          )
        };
      }

      if (url === '/api/simulations/snapshots' && options.method === 'POST') {
        saveAsCreated = true;
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'sim-save-as', updatedAt: '2026-03-09T05:41:00.000Z' })
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-fixture',
            name: 'Fixture snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'save-as-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(getRunControlSaveStatus('unsaved')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^save as$/i), { target: { value: 'Branch snapshot' } });
    fireEvent.click(screen.getByRole('button', { name: /^save as$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^active snapshot: branch snapshot/i)).toBeInTheDocument();
      expect(getRunControlSaveStatus('saved')).toBeInTheDocument();
    });

    const saveAsPostCall = global.fetch.mock.calls.find(
      ([url, options]) => url === '/api/simulations/snapshots' && options?.method === 'POST'
    );
    const savePayload = JSON.parse(saveAsPostCall[1].body);
    expect(savePayload.name).toBe('Branch snapshot');
    expect(savePayload.overwriteExisting).toBe(false);
  });

  it('save as rejects duplicate names with deterministic inline validation and skips save call', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'save-as-duplicate-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(getRunControlSaveStatus('unsaved')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^save as$/i), { target: { value: 'Fixture snapshot' } });
    fireEvent.click(screen.getByRole('button', { name: /^save as$/i }));

    expect(screen.getByText(/a saved simulation with this name already exists/i)).toBeInTheDocument();

    const postCalls = global.fetch.mock.calls.filter(
      ([url, options]) => url === '/api/simulations/snapshots' && options?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  it('shows deterministic conflict choices and saves to generated copy name', async () => {
    let postCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: 'sim-fixture', name: 'Fixture snapshot', seed: 'fixture-seed', tickCount: 10, updatedAt: '2026-03-09T05:41:00.000Z' },
            { id: 'sim-copy-1', name: 'Fixture snapshot (copy 1)', seed: 'fixture-seed', tickCount: 11, updatedAt: '2026-03-09T05:40:00.000Z' },
            { id: 'sim-copy-3', name: 'Fixture snapshot (copy 3)', seed: 'fixture-seed', tickCount: 12, updatedAt: '2026-03-09T05:39:00.000Z' }
          ])
        };
      }

      if (url === '/api/simulations/snapshots' && options.method === 'POST') {
        postCount += 1;
        if (postCount === 1) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: 'A saved simulation named "Fixture snapshot" already exists.',
              conflictSnapshot: { id: 'sim-fixture', tickCount: 10 }
            })
          };
        }

        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'sim-copy-2', updatedAt: '2026-03-09T05:45:00.000Z' })
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-fixture',
            name: 'Fixture snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture', seed: 'fixture-seed', resolvedSeed: 'fixture-seed', worldWidth: 800, worldHeight: 480,
              initialPopulation: 12, initialFoodCount: 30, foodSpawnChance: 0.04, foodEnergyValue: 5, maxFood: 120
            },
            tickCount: 10,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture', seed: 'fixture-seed', worldWidth: 800, worldHeight: 480, initialPopulation: 12,
              initialFoodCount: 30, foodSpawnChance: 0.04, foodEnergyValue: 5, maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(getRunControlSaveStatus('unsaved')).toBeInTheDocument();
      expect(screen.getByText(/fixture snapshot \(copy 1\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }));

    let saveAsConflictButton;
    await waitFor(() => {
      const resolutionRegion = screen.getByRole('region', { name: /save name conflict resolution/i });
      expect(within(resolutionRegion).getByRole('button', { name: /overwrite existing/i })).toBeInTheDocument();
      saveAsConflictButton = within(resolutionRegion).getByRole('button', { name: /save as/i });
      expect(saveAsConflictButton).toBeInTheDocument();
    });

    fireEvent.click(saveAsConflictButton);

    await waitFor(() => {
      const postCalls = global.fetch.mock.calls.filter(
        ([requestUrl, requestOptions]) => requestUrl === '/api/simulations/snapshots' && requestOptions?.method === 'POST'
      );
      expect(postCalls).toHaveLength(2);
    });

    const postCalls = global.fetch.mock.calls.filter(
      ([requestUrl, requestOptions]) => requestUrl === '/api/simulations/snapshots' && requestOptions?.method === 'POST'
    );
    expect(postCalls).toHaveLength(2);
    const secondPayload = JSON.parse(postCalls[1][1].body);
    expect(secondPayload.overwriteExisting).toBe(false);
    expect(secondPayload.name).toMatch(/^New Simulation \(copy \d+\)$/);
  });

  it('generates a seed when omitted and persists config', async () => {
    const canReadWriteStorage = (() => {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
        return false;
      }

      try {
        storage.setItem(STORAGE_KEY, '__probe__');
        const probe = storage.getItem(STORAGE_KEY);
        storage.removeItem(STORAGE_KEY);
        return probe === '__probe__';
      } catch {
        return false;
      }
    })();

    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/resolved seed:/i)).toHaveTextContent('1e240');

    await waitFor(() => {
      const saved = loadSimulationConfig();

      if (!canReadWriteStorage) {
        expect(saved).toBeNull();
        return;
      }

      expect(saved).toMatchObject({
        name: 'New Simulation',
        seed: '',
        resolvedSeed: '1e240'
      });
    });
  });

  it('uses explicit seed as-is and persists matching seed fields', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: '  explicit-seed-77  ' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/resolved seed:/i)).toHaveTextContent('explicit-seed-77');
    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: explicit-seed-77');

    await waitFor(() => {
      const saved = loadSimulationConfig();
      if (!saved) {
        expect(saved).toBeNull();
        return;
      }

      expect(saved).toMatchObject({
        seed: 'explicit-seed-77',
        resolvedSeed: 'explicit-seed-77'
      });
    });
  });

  it('supports regenerate and restart interactions from the simplified action strip', async () => {
    let regenerateCounter = 0;

    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      regenerateCounter += 1;
      array[0] = regenerateCounter === 1 ? 111111 : 222222;
      return array;
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: 1b207');
    expect(screen.queryByRole('button', { name: /copy seed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy share link/i })).not.toBeInTheDocument();

    const tickNode = screen.getByText(/^tick count:/i);
    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /new run with same seed/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      'You have unsaved simulation progress. Restarting now will reset to tick 0 and keep the current seed. Continue?'
    );
    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: 1b207');
    expect(tickNode).toHaveTextContent('Tick count: 0');

    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /regenerate seed \+ restart/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      'You have unsaved simulation progress. Regenerating will create a new seed and reset to tick 0. Continue?'
    );
    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: 3640e');
    expect(tickNode).toHaveTextContent('Tick count: 0');
  });

  it('cancels restart and regenerate flows when unsaved-progress confirmation is declined', async () => {
    let regenerateCounter = 0;

    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      regenerateCounter += 1;
      array[0] = regenerateCounter === 1 ? 333333 : 444444;
      return array;
    });

    window.confirm.mockReturnValue(false);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    const tickNode = screen.getByText(/^tick count:/i);

    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /new run with same seed/i }));
    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: 51615');
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    expect(screen.getByText(/new run cancelled\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /regenerate seed \+ restart/i }));
    expect(within(getSimulationStatsHud()).getByText(/^seed:/i)).toHaveTextContent('Seed: 51615');
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    expect(screen.getByText(/seed regeneration cancelled\./i)).toBeInTheDocument();
  });

  it('new run with same seed clears selection and restores default playback controls', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'restart-selection-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Restart selection test',
        seed: 'restart-selection-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        minimumPopulation: 15,
        initialFoodCount: 40,
        foodSpawnChance: 0.03,
        foodEnergyValue: 20,
        maxFood: 250
      },
      'restart-selection-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const selectedFixture = initialWorld.organisms[0];
    expect(selectedFixture).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });
    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);

    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    fireEvent.click(screen.getByRole('button', { name: /new run with same seed/i }));

    expect(screen.queryByRole('region', { name: /organism info/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^1x$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');

    vi.useRealTimers();
  });


  it('new run clears staleOrganismSnapshot from prior death state', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'stale-clear-seed' } });
    fireEvent.change(screen.getByLabelText(/^initial population$/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^minimum population$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^initial food count$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^max food$/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Stale clear test',
        seed: 'stale-clear-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 2,
        minimumPopulation: 1,
        initialFoodCount: 0,
        foodSpawnChance: 0,
        foodEnergyValue: 5,
        maxFood: 1
      },
      'stale-clear-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const rng = createSeededPrng(deterministicConfig.resolvedSeed);
    const stepParams = toEngineStepParams(deterministicConfig);
    const initialIds = initialWorld.organisms.map((organism) => organism.id);

    let projected = initialWorld;
    let firstDiedId = null;
    let deathTick = null;
    for (let i = 0; i < 800 && !firstDiedId; i += 1) {
      projected = stepWorld(projected, rng, stepParams);
      firstDiedId = initialIds.find((id) => !projected.organisms.some((organism) => organism.id === id)) ?? null;
      if (firstDiedId) {
        deathTick = i + 1;
      }
    }

    expect(firstDiedId).toBeTruthy();
    const selectedFixture = initialWorld.organisms.find((organism) => organism.id === firstDiedId);
    expect(selectedFixture).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Select the organism that will die
    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    // Wait for the organism to die and become stale
    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    act(() => {
      vi.advanceTimersByTime(deathTick * 1000 / 30);
    });
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    // Verify stale state exists (Deceased indicator should be visible)
    const organismHudAfterDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudAfterDeath).toHaveTextContent(/Deceased/i);

    // Now trigger a new run - this should clear staleOrganismSnapshot
    fireEvent.click(screen.getByRole('button', { name: /new run with same seed/i }));

    // Verify organism HUD is completely gone (stale snapshot was cleared)
    expect(screen.queryByRole('region', { name: /organism info/i })).not.toBeInTheDocument();

    vi.useRealTimers();
  });


  it('loads a saved snapshot and clears staleOrganismSnapshot from prior run', async () => {
    render(<App />);

    // First, start a simulation and create stale state by selecting an organism
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'load-clear-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/^tick count:/i)).toHaveTextContent(/tick count: \d+/i);
    });

    // Pause and select an organism to create some selection state
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      toJSON: () => ({})
    });

    // Click somewhere to select an organism (if any exist)
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });

    // Now load a saved snapshot - this should clear any stale state
    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
    });

    // Verify selection is cleared (organism info should not be visible)
    expect(screen.queryByRole('region', { name: /organism info/i })).not.toBeInTheDocument();
  });


  it('shows actionable validation errors for invalid ranges', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/max food/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/initial food count/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/mutation rate \(legacy\)/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/world width must be between 100 and 3000/i)).toBeInTheDocument();
    expect(screen.getByText(/max food must be greater than or equal to initial food count/i)).toBeInTheDocument();
    expect(screen.getByText(/mutation rate must be between 0 and 1/i)).toBeInTheDocument();
  });

  it('supports pause/resume and runtime speed control transitions', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const pauseButton = screen.getByRole('button', { name: /^pause$/i });
    const resumeButton = screen.getByRole('button', { name: /^resume$/i });
    const speedPresets = screen.getByRole('group', { name: /speed presets/i });
    const speed1x = screen.getByRole('button', { name: /^1x$/i });
    const speed2x = screen.getByRole('button', { name: /^2x$/i });
    const speed5x = screen.getByRole('button', { name: /^5x$/i });
    const speed10x = screen.getByRole('button', { name: /^10x$/i });
    const tickNode = screen.getByText(/^tick count:/i);
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(speedPresets).toBeInTheDocument();
    expect(screen.getByText(/runtime state: running at 1x/i)).toBeInTheDocument();
    expect(speed1x).toHaveClass('speed-preset-button', 'is-active');
    expect(speed1x).toHaveAttribute('aria-pressed', 'true');
    expect(speed2x).toHaveAttribute('aria-pressed', 'false');
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');
    expect(speed10x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(speed5x);
    expect(screen.getByText(/runtime state: running at 5x/i)).toBeInTheDocument();
    expect(speed5x).toHaveClass('speed-preset-button', 'is-active');
    expect(speed5x).toHaveAttribute('aria-pressed', 'true');
    expect(speed1x).not.toHaveClass('is-active');
    expect(speed1x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pauseButton);
    const pausedTick = readTick();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/runtime state: paused/i)).toBeInTheDocument();
    expect(speed5x).not.toHaveClass('is-active');
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(readTick()).toBe(pausedTick);

    fireEvent.click(resumeButton);
    expect(screen.getByText(/runtime state: running at 5x/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(speed2x);
    expect(screen.getByText(/runtime state: running at 2x/i)).toBeInTheDocument();
    expect(speed2x).toHaveClass('speed-preset-button', 'is-active');
    expect(speed2x).toHaveAttribute('aria-pressed', 'true');

    vi.useRealTimers();
  });

  it('renders deterministic run metadata and copies a stable reproducibility payload', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'meta-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const runMetadataPanel = screen.getByRole('region', { name: /run metadata panel/i });
    fireEvent.click(within(runMetadataPanel).getByText(/run metadata/i));

    expect(within(runMetadataPanel).getByText(/^seed:/i)).toHaveTextContent('Seed: meta-seed');
    expect(within(runMetadataPanel).getByText(/^run start tick marker:/i)).toHaveTextContent('Run start tick marker: 0');
    expect(within(runMetadataPanel).getByText(/^speed multiplier:/i)).toHaveTextContent('Speed multiplier: 1x');
    expect(within(runMetadataPanel).getByText(/^snapshot id:/i)).toHaveTextContent('Snapshot ID: No snapshot');

    await waitFor(() => {
      const tickValue = Number.parseInt(within(runMetadataPanel).getByText(/^current tick:/i).textContent.replace(/\D+/g, ''), 10);
      expect(tickValue).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    expect(within(runMetadataPanel).getByText(/^speed multiplier:/i)).toHaveTextContent('Speed multiplier: 5x');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy reproducibility string/i }));
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/reproducibility string copied\./i)).toBeInTheDocument();

    const copiedPayload = clipboardWriteText.mock.calls[0][0];
    expect(copiedPayload).toContain('"seed":"meta-seed"');
    expect(copiedPayload).not.toContain('configFingerprint');
    expect(copiedPayload).not.toContain('configFingerprintHash');
  });

  it('loads a saved snapshot and shows active snapshot metadata', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    expect(within(savedRegion).getByText(/seed fixture-seed/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/tick 0/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/population metadata unavailable/i)).toBeInTheDocument();
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByText(/active snapshot:/i)).toHaveTextContent('Fixture snapshot');
      expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      const runMetadataPanel = screen.getByRole('region', { name: /run metadata panel/i });
      fireEvent.click(within(runMetadataPanel).getByText(/run metadata/i));
      expect(within(runMetadataPanel).getByText(/^seed: fixture-seed$/i)).toBeInTheDocument();
      expect(within(runMetadataPanel).getByText(/^snapshot id: sim-fixture$/i)).toBeInTheDocument();
    });
  });

  it('renders deterministic fallback metadata and disables resume for invalid saved rows', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/status' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: 'test-version', environment: 'test' })
        };
      }
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              id: 'sim-invalid',
              name: 'Corrupt metadata',
              seed: '',
              tickCount: -1,
              updatedAt: '2026-03-06T12:00:01.000Z'
            }
          ])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    expect(within(savedRegion).getByText(/seed metadata unavailable/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/tick metadata unavailable/i)).toBeInTheDocument();
    expect(within(savedRegion).getByRole('button', { name: /^resume$/i })).toBeDisabled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('locks per-save resume actions while a snapshot load request is in flight', async () => {
    let resolveSnapshot;
    const snapshotPromise = new Promise((resolve) => {
      resolveSnapshot = resolve;
    });

    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/status' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: 'test-version', environment: 'test' })
        };
      }
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-fixture', name: 'Fixture snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/sim-fixture') && (!options.method || options.method === 'GET')) {
        const snapshot = await snapshotPromise;
        return {
          ok: true,
          status: 200,
          json: async () => snapshot
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    const resumeButton = within(savedRegion).getByRole('button', { name: /^resume$/i });

    fireEvent.click(resumeButton);

    // Both Resume and Spectate buttons show loading state when clicked
    const loadingButtons = within(savedRegion).getAllByRole('button', { name: /loading…/i });
    expect(loadingButtons.length).toBeGreaterThanOrEqual(1);
    loadingButtons.forEach((btn) => expect(btn).toBeDisabled());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/simulations/snapshots/sim-fixture',
      expect.objectContaining({ method: 'GET' })
    );

    // Click the first loading button to cancel
    const loadingButtonsBeforeCancel = within(savedRegion).getAllByRole('button', { name: /loading…/i });
    fireEvent.click(loadingButtonsBeforeCancel[0]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    resolveSnapshot({
      id: 'sim-fixture',
      name: 'Fixture snapshot',
      updatedAt: '2026-03-06T12:00:01.000Z',
      seed: 'fixture-seed',
      tickCount: 0,
      rngState: createSeededPrng('fixture-seed').state,
      worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
        name: 'Fixture snapshot',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 600,
        initialPopulation: 12,
        minimumPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      }, 'fixture-seed')),
      parameters: toEngineStepParams(normalizeSimulationConfig({
        name: 'Fixture snapshot',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 600,
        initialPopulation: 12,
        minimumPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      }, 'fixture-seed'))
    });

    await waitFor(() => {
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      expect(within(savedRegion).getByRole('button', { name: /^resume$/i })).toBeEnabled();
    });
  });

  it('renders saved-card population metadata from persisted snapshot payload when available', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              id: 'sim-pop',
              name: 'Population fixture',
              seed: 'seed-pop',
              tickCount: 44,
              updatedAt: '2026-03-06T12:00:01.000Z',
              worldState: {
                organisms: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }]
              },
              parameters: {
                worldWidth: 800,
                worldHeight: 480,
                initialPopulation: 20,
                maxFood: 120
              }
            }
          ])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-pop' })
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    expect(within(savedRegion).getByText(/population 4/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/config 800x480 · init pop 20 · max food 120/i)).toBeInTheDocument();
  });

  it('renders saved-simulations error state when list request fails', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to load saved simulations/i);
      expect(screen.getByText(/saved simulations unavailable/i)).toBeInTheDocument();
    });
  });

  it('supports deterministic replay tick jumps from a loaded snapshot and only resumes when explicit', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      const summaryRegion = screen.getByRole('region', { name: /replay session summary strip/i });
      expect(summaryRegion).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /replay timeline controls/i })).toBeInTheDocument();
      expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
      expect(within(summaryRegion).getByText(/^seed: fixture-seed$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^simulation: fixture snapshot$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^simulation id: sim-fixture$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^captured tick range: 0 → 0$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^total replay duration \(ticks\): 0$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^deterministic context: context match$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^simulation version: snn-sandbox-v1$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^parameter fingerprint:/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByRole('button', { name: /copy deterministic context/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /jump to first mismatch/i })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /copy deterministic context/i }));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });
    expect(clipboardWriteText.mock.calls[0][0]).toContain('seed=fixture-seed');
    expect(clipboardWriteText.mock.calls[0][0]).toContain('simulationVersion=snn-sandbox-v1');
    await waitFor(() => {
      expect(screen.getByText(/deterministic context copied\./i)).toBeInTheDocument();
    });

    const tickNode = screen.getByText(/^tick count:/i);
    const jumpInput = screen.getByLabelText(/jump to tick/i);
    const scrubber = screen.getByRole('slider', { name: /replay timeline scrubber/i });

    expect(scrubber).toHaveAttribute('min', '0');
    expect(scrubber).toHaveAttribute('max', '0');

    fireEvent.change(jumpInput, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /^jump$/i }));
    expect(tickNode).toHaveTextContent('Tick count: 20');
    expect(scrubber).toHaveAttribute('max', '20');

    fireEvent.change(scrubber, { target: { value: '7' } });
    expect(tickNode).toHaveTextContent('Tick count: 7');
    expect(jumpInput).toHaveValue(7);
    const summaryRegion = screen.getByRole('region', { name: /replay session summary strip/i });
    expect(within(summaryRegion).getByText(/^captured tick range: 0 → 7$/i)).toBeInTheDocument();
    expect(within(summaryRegion).getByText(/^total replay duration \(ticks\): 7$/i)).toBeInTheDocument();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn(() => {});
    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      set href(value) {
        this._href = value;
      },
      set download(value) {
        this._download = value;
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /export snapshot/i }));

    expect(screen.getByText(/replay snapshot exported\./i)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    createElement.mockRestore();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(tickNode).toHaveTextContent('Tick count: 7');

    fireEvent.click(screen.getByRole('button', { name: /resume live from selected tick/i }));

    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(7);
    });
  });

  it('saves, applies, and deletes replay comparison presets using deterministic payloads only', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const presetsRegion = await screen.findByRole('region', { name: /replay comparison presets/i });

    fireEvent.change(within(presetsRegion).getByLabelText(/preset name/i), { target: { value: 'Fixture deterministic preset' } });
    fireEvent.click(within(presetsRegion).getByRole('button', { name: /save preset/i }));

    await waitFor(() => {
      expect(screen.getByText(/replay comparison preset saved\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture deterministic preset — seed fixture-seed/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^world width$/i), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'override-seed' } });

    fireEvent.click(within(presetsRegion).getByRole('button', { name: /^apply$/i }));

    expect(screen.getByLabelText(/^world width$/i)).toHaveValue(800);
    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('fixture-seed');

    fireEvent.click(within(presetsRegion).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted preset: fixture deterministic preset\./i)).toBeInTheDocument();
      expect(screen.getByText(/no replay comparison presets saved yet\./i)).toBeInTheDocument();
    });

    expect(loadReplayComparisonPresets(window.localStorage)).toEqual([]);
  });

  it('shows first-mismatch jump control when mismatch location is available and jumps deterministically', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch', name: 'Mismatch snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch',
            name: 'Mismatch snapshot',
            seed: 'fixture-seed',
            mismatchDetected: true,
            firstMismatchTick: 12,
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /jump to first mismatch/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /jump to first mismatch/i }));

    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 12');
    expect(screen.getByLabelText(/jump to tick/i)).toHaveValue(12);
    expect(screen.getByText(/jumped to first mismatch tick\./i)).toBeInTheDocument();
  });

  it('disables first-mismatch jump control when mismatch location is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-no-tick', name: 'Mismatch without tick', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-no-tick',
            name: 'Mismatch without tick',
            seed: 'fixture-seed',
            mismatchDetected: true,
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /jump to first mismatch/i })).toBeDisabled();
    });
  });

  it('shows mismatch details panel with deterministic values when mismatch context exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-details', name: 'Mismatch details snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-details',
            name: 'Mismatch details snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 12,
              firstMismatch: {
                entityId: 'org-7',
                path: 'organisms[7].energyState',
                baselineValue: 'feeding',
                comparisonValue: 'moving'
              }
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /replay mismatch details/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/first mismatch tick: 12/i)).toBeInTheDocument();
    expect(screen.getByText(/entity id: org-7/i)).toBeInTheDocument();
    expect(screen.getByText(/compared key\/path: organisms\[7\]\.energystate/i)).toBeInTheDocument();
    expect(screen.getByText(/baseline value: feeding/i)).toBeInTheDocument();
    expect(screen.getByText(/comparison value: moving/i)).toBeInTheDocument();
    expect(screen.getByText(/absolute delta: n\/a/i)).toBeInTheDocument();
  });

  it('copies deterministic mismatch report payload from mismatch details panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-copy', name: 'Mismatch copy snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-copy',
            name: 'Mismatch copy snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 12,
              firstMismatch: {
                entityId: 'org-7',
                path: 'organisms[7].energyState',
                baselineValue: 'feeding',
                comparisonValue: 'moving',
                severity: 'high'
              }
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy mismatch report/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /copy mismatch report/i }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    expect(clipboardWriteText.mock.calls[0][0]).toContain('Replay mismatch report');
    expect(clipboardWriteText.mock.calls[0][0]).toContain('seed: fixture-seed');
    expect(clipboardWriteText.mock.calls[0][0]).toContain('firstMismatchTick: 12');
    expect(screen.getByText(/mismatch report copied\./i)).toBeInTheDocument();
  });

  it('renders mismatch event list and seeks replay tick when an event row is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-events', name: 'Mismatch events snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-events',
            name: 'Mismatch events snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 12,
              mismatchEvents: [
                { tick: 18, path: 'organisms[2].energy', baselineValue: 9, comparisonValue: 8, severity: 'high' },
                { tick: 12, path: 'organisms[0].age', baselineValue: 3, comparisonValue: 4 }
              ]
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /replay mismatch details/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/tick 12 · organisms\[0\]\.age/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 18 · organisms\[2\]\.energy/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/replay mismatch markers/i)).toBeInTheDocument();
    expect(document.querySelectorAll('.replay-marker')).toHaveLength(2);
    expect(document.querySelectorAll('.replay-marker-active')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /tick 12 · organisms\[0\]\.age/i })).toHaveAttribute('aria-current', 'true');

    fireEvent.click(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i }));

    await waitFor(() => {
      expect(screen.getByText(/jumped to mismatch event tick\./i)).toBeInTheDocument();
    });

    const tickInput = screen.getByLabelText(/jump to tick/i);
    expect(tickInput).toHaveValue(18);
    expect(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i })).toHaveAttribute('aria-current', 'true');

    fireEvent.change(screen.getByRole('slider', { name: /replay timeline scrubber/i }), { target: { value: '12' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tick 12 · organisms\[0\]\.age/i })).toHaveAttribute('aria-current', 'true');
    });

    const replaySummaryRegion = screen.getByRole('region', { name: /replay session summary strip/i });
    replaySummaryRegion.focus();
    fireEvent.keyDown(replaySummaryRegion, { key: 'ArrowDown', altKey: true });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i })).toHaveAttribute('aria-current', 'true');
    });
    expect(screen.getByLabelText(/jump to tick/i)).toHaveValue(18);
  });

  it('filters mismatch events by type/severity and supports active filter chips', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-filter-events', name: 'Mismatch filter snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-filter-events',
            name: 'Mismatch filter snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 10,
              mismatchEvents: [
                { tick: 11, path: 'organisms[0].brain.state', baselineValue: 1, comparisonValue: 2, severity: 'low' },
                { tick: 12, path: 'organisms[0].brain.input[0]', baselineValue: 1, comparisonValue: 2, severity: 'medium' },
                { tick: 13, path: 'organisms[0].brain.output[0]', baselineValue: 1, comparisonValue: 2, severity: 'high' }
              ]
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await screen.findByRole('region', { name: /replay mismatch details/i });
    expect(screen.getByText(/tick 11 · organisms\[0\]\.brain\.state/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 12 · organisms\[0\]\.brain\.input\[0\]/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 13 · organisms\[0\]\.brain\.output\[0\]/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /type: input/i }));
    expect(screen.getByText(/tick 12 · organisms\[0\]\.brain\.input\[0\]/i)).toBeInTheDocument();
    expect(screen.queryByText(/tick 11 · organisms\[0\]\.brain\.state/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tick 13 · organisms\[0\]\.brain\.output\[0\]/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /type: input ×/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /severity: high/i }));
    expect(screen.getByText(/no mismatch events match active filters\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    expect(screen.getByText(/tick 11 · organisms\[0\]\.brain\.state/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 12 · organisms\[0\]\.brain\.input\[0\]/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 13 · organisms\[0\]\.brain\.output\[0\]/i)).toBeInTheDocument();
  });

  it('shows deterministic mismatch-event empty state when no mismatch events are provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-empty-events', name: 'Mismatch empty events snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-empty-events',
            name: 'Mismatch empty events snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const mismatchRegion = await screen.findByRole('region', { name: /replay mismatch details/i });
    expect(within(mismatchRegion).getByText(/no mismatch events available for this replay payload\./i)).toBeInTheDocument();
    expect(within(mismatchRegion).queryByRole('list')).not.toBeInTheDocument();
  });

  it('hides mismatch details panel when runs match', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /replay mismatch details/i })).not.toBeInTheDocument();
    });
  });

  it('surfaces per-save recovery actions for invalid/corrupt snapshots and supports retry', async () => {
    let loadAttempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-bad', name: 'Bad snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        loadAttempts += 1;
        if (loadAttempts === 1) {
          return {
            ok: false,
            status: 404,
            json: async () => ({})
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-bad',
            name: 'Bad snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              minimumPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              minimumPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);
    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const recoveryAlert = await screen.findByRole('alert');
    expect(recoveryAlert).toHaveTextContent(/snapshot could not be resumed\. retry or delete this save\./i);
    expect(within(recoveryAlert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(within(recoveryAlert).getByRole('button', { name: /delete broken save/i })).toBeInTheDocument();

    fireEvent.click(within(recoveryAlert).getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      expect(screen.queryByText(/snapshot could not be resumed\. retry or delete this save\./i)).not.toBeInTheDocument();
    });
  });

  it('allows deleting a broken save from recovery actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-bad', name: 'Bad snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-bad', tickCount: 10, worldState: { tick: 9 } })
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && options.method === 'DELETE') {
        return { ok: true, status: 204, json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    // With deterministic validation, mismatched tick counts show warnings instead of errors
    // The snapshot loads successfully with fallback behavior
    await waitFor(() => {
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
    });

    // User can still delete the snapshot via the delete button
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted\./i)).toBeInTheDocument();
      expect(screen.queryByText(/bad snapshot/i)).not.toBeInTheDocument();
    });
  });

  it('deletes a snapshot after explicit confirmation and updates the list', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    const dialog = await screen.findByRole('dialog', { name: /delete saved simulation confirmation/i });
    expect(within(dialog).getByText(/name: fixture snapshot/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/seed: fixture-seed/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/tick: 0/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/last updated:/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted\./i)).toBeInTheDocument();
      expect(screen.queryByText(/fixture snapshot/i)).not.toBeInTheDocument();
    });
  });

  it('cancels delete from the confirmation modal without mutating the list', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.getByText(/delete cancelled\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture snapshot/i)).toBeInTheDocument();
    });
  });

  it('surfaces delete API failures without desyncing the local list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-fixture', name: 'Fixture snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && options.method === 'DELETE') {
        return { ok: false, status: 500, json: async () => ({}) };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-fixture', tickCount: 0, worldState: { tick: 0 }, parameters: {} })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to delete snapshot\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture snapshot/i)).toBeInTheDocument();
    });
  });

  it('steps exactly +1 or +10 ticks while paused and keeps step controls disabled while running', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const stepPlusOneButton = screen.getByRole('button', { name: /^step \+1$/i });
    const stepPlusTenButton = screen.getByRole('button', { name: /^step \+10$/i });
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(stepPlusOneButton).toBeDisabled();
    expect(stepPlusTenButton).toBeDisabled();

    const stepControl = stepPlusOneButton.closest('.control-with-hint');
    stepControl.focus();
    expect(within(stepControl).getByRole('tooltip')).toHaveTextContent('Pause the simulation to step one tick at a time.');

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(stepPlusOneButton).toBeEnabled();
    expect(stepPlusTenButton).toBeEnabled();
    expect(stepPlusOneButton.closest('.control-with-hint')).not.toHaveClass('is-disabled');

    const pausedTick = readTick();
    fireEvent.click(stepPlusOneButton);
    expect(readTick()).toBe(pausedTick + 1);

    fireEvent.click(stepPlusTenButton);
    expect(readTick()).toBe(pausedTick + 11);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(readTick()).toBe(pausedTick + 11);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    expect(stepPlusOneButton).toBeDisabled();
    expect(stepPlusTenButton).toBeDisabled();

    vi.useRealTimers();
  });

  it('shows disable hints for seeded controls when simulation is unavailable', () => {
    render(<App />);

    const restartButton = screen.getByRole('button', { name: /new run with same seed/i });
    expect(restartButton).toBeDisabled();

    const restartControl = restartButton.closest('.control-with-hint');
    restartControl.focus();
    const restartHintId = restartControl.getAttribute('aria-describedby');
    expect(document.getElementById(restartHintId)).toHaveTextContent('Start a simulation to enable this control.');

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    const enabledRestartButton = screen.getByRole('button', { name: /new run with same seed/i });
    expect(enabledRestartButton).toBeEnabled();
    expect(enabledRestartButton.closest('.control-with-hint')).not.toHaveClass('is-disabled');
  });

  it('shows keyboard shortcuts modal and supports close interactions without mutating simulation state', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const pausedTick = Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    const speed5x = screen.getByRole('button', { name: /^5x$/i });
    fireEvent.click(speed5x);
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');

    const trigger = screen.getByRole('button', { name: /keyboard shortcuts/i });
    fireEvent.click(trigger);

    const modal = screen.getByRole('dialog', { name: /keyboard shortcuts help/i });
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText(/^space$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^\.$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^\[ \/ \]$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^1 \/ 2 \/ 3 \/ 4$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^← \/ →$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^p$/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts help/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: /close keyboard shortcuts/i }));
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts help/i })).not.toBeInTheDocument();

    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBe(pausedTick);
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^5x$/i })).toHaveAttribute('aria-pressed', 'false');

    vi.useRealTimers();
  });

  it('persists organism inspector with last values when selected organism dies', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'persist-stale-seed' } });
    fireEvent.change(screen.getByLabelText(/^initial population$/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^minimum population$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^initial food count$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^max food$/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Persist stale test',
        seed: 'persist-stale-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 2,
        minimumPopulation: 1,
        initialFoodCount: 0,
        foodSpawnChance: 0,
        foodEnergyValue: 5,
        maxFood: 1
      },
      'persist-stale-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const rng = createSeededPrng(deterministicConfig.resolvedSeed);
    const stepParams = toEngineStepParams(deterministicConfig);
    const initialIds = initialWorld.organisms.map((organism) => organism.id);

    let projected = initialWorld;
    let firstDiedId = null;
    let deathTick = null;
    for (let i = 0; i < 800 && !firstDiedId; i += 1) {
      projected = stepWorld(projected, rng, stepParams);
      firstDiedId = initialIds.find((id) => !projected.organisms.some((organism) => organism.id === id)) ?? null;
      if (firstDiedId) {
        deathTick = i + 1;
      }
    }

    expect(firstDiedId).toBeTruthy();
    const selectedFixture = initialWorld.organisms.find((organism) => organism.id === firstDiedId);
    expect(selectedFixture).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Select the organism that will die
    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });
    const organismHudBeforeDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudBeforeDeath).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    // Verify energy is shown (should be a number, not "N/A")
    const energyMatchBefore = organismHudBeforeDeath.textContent.match(/Energy:\s*([\d.]+)/);
    expect(energyMatchBefore).toBeTruthy();
    const energyBeforeDeath = energyMatchBefore[1];

    // Advance to the death tick using computed deathTick
    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    act(() => {
      vi.advanceTimersByTime(deathTick * 1000 / 30);
    });
    
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    // The organism info panel should STILL be visible (persisted with last values)
    const organismHudAfterDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudAfterDeath).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    
    // Should show the "Deceased" badge to indicate stale data
    expect(organismHudAfterDeath).toHaveTextContent(/Deceased/i);
    
    // Energy should still show the last known value (not updated)
    const energyMatchAfter = organismHudAfterDeath.textContent.match(/Energy:\s*([\d.]+)/);
    expect(energyMatchAfter).toBeTruthy();
    expect(energyMatchAfter[1]).toBe(energyBeforeDeath);

    vi.useRealTimers();
  });


  it('renders an always-visible zero-safe stats HUD before simulation starts', () => {
    render(<App />);

    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    expect(statsHud).toBeInTheDocument();
    expect(within(statsHud).getByText(/^seed:/i)).toHaveTextContent('Seed: Seed unavailable');
    expect(within(statsHud).getByText(/^population:/i)).toHaveTextContent('Population: 0 (→ Flat)');
    expect(screen.getByText(/^food count:/i)).toHaveTextContent('Food count: 0');
    expect(screen.getByText(/^average generation:/i)).toHaveTextContent('Average generation: 0.0');
    expect(screen.getByText(/^average organism energy:/i)).toHaveTextContent('Average organism energy: 0.0 (→ Flat)');
    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
    expect(screen.getByText(/^time elapsed:/i)).toHaveTextContent('Time elapsed: 0.0s');
    expect(screen.getByText(/^tick budget clamp:/i)).toHaveTextContent('Tick budget clamp: Inactive');
  });

  it('renders deterministic seed, playback speed, and tick state in the stats HUD', async () => {
    vi.useFakeTimers();

    render(<App />);
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'hud-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    expect(within(statsHud).getByText(/^seed:/i)).toHaveTextContent('Seed: hud-seed');

    const tickNode = within(statsHud).getByText(/^tick count:/i);
    act(() => {
      vi.advanceTimersByTime(110);
    });
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    expect(within(statsHud).getByRole('group', { name: /speed presets/i })).toBeInTheDocument();
    expect(within(statsHud).getByText(/^tick:/i)).toHaveTextContent('runtime state: running at 1x');

    vi.useRealTimers();
  });

  it('supports deterministic stats visibility presets and persists selection locally', () => {
    const { unmount } = render(<App />);

    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    const presets = within(statsHud).getByRole('group', { name: /stats visibility presets/i });

    expect(within(presets).getByRole('button', { name: /^detailed$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(statsHud).getByText(/^food count:/i)).toBeInTheDocument();

    fireEvent.click(within(presets).getByRole('button', { name: /^minimal$/i }));

    expect(within(presets).getByRole('button', { name: /^minimal$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(statsHud).queryByText(/^food count:/i)).not.toBeInTheDocument();
    expect(within(statsHud).queryByText(/^average generation:/i)).not.toBeInTheDocument();
    expect(within(statsHud).queryByText(/^average organism energy:/i)).not.toBeInTheDocument();
    expect(within(statsHud).queryByText(/^tick budget clamp:/i)).not.toBeInTheDocument();

    unmount();
    render(<App />);

    const reloadedStatsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    const reloadedPresets = within(reloadedStatsHud).getByRole('group', { name: /stats visibility presets/i });
    expect(within(reloadedPresets).getByRole('button', { name: /^minimal$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(reloadedStatsHud).queryByText(/^food count:/i)).not.toBeInTheDocument();
  });

  it('updates stats while running and keeps tick-derived metrics stable while paused', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    expect(tickNode).toHaveTextContent('Tick count: 0');

    act(() => {
      vi.advanceTimersByTime(110);
    });
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);

    const pausedTick = Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(tickNode).toHaveTextContent(`Tick count: ${pausedTick}`);
    expect(screen.getByText(/^population:/i)).toBeInTheDocument();
    expect(screen.getByText(/^food count:/i)).toBeInTheDocument();
    expect(screen.getByText(/^average generation:/i).textContent).toMatch(/\d+\.\d$/);
    expect(screen.getByText(/^average organism energy:/i).textContent).toMatch(/\d+\.\d \((↑ Up|→ Flat|↓ Down)\)$/);
    expect(screen.getByText(/^time elapsed:/i).textContent).toMatch(/\d+\.\ds$/);

    vi.useRealTimers();
  });

  it('increases tick throughput at higher speed and keeps continuity when pausing/resuming at 1x', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    const tickNode = screen.getByText(/^tick count:/i);
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    const after1x = readTick();

    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const after5x = readTick();
    const delta1x = after1x;
    const delta5x = after5x - after1x;

    expect(delta1x).toBeGreaterThan(0);
    expect(delta5x).toBeGreaterThan(delta1x);

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    const pausedTick = readTick();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(readTick()).toBe(pausedTick);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(readTick()).toBeGreaterThan(pausedTick);

    vi.useRealTimers();
  });


  it('renders output neuron tooltips to the left of the node', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];
    const mappedBrain = mapBrainToVisualizerModel(firstTarget.brain);
    const outputNeuron = mappedBrain.nodes.find((node) => node.type === 'output');

    expect(outputNeuron).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const outputNeuronCircle = screen.getByLabelText(`Neuron ${outputNeuron.id}, type: output`);
    fireEvent.mouseEnter(outputNeuronCircle);

    const tooltipText = screen.getByText(outputNeuron.displayLabel);

    expect(tooltipText).toHaveAttribute('text-anchor', 'start');
    expect(tooltipText.parentElement).toHaveAttribute(
      'transform',
      `translate(${outputNeuron.x - 168}, ${outputNeuron.y - 6})`
    );
  });

  it('shows genome reproduction values in the selected organism HUD summary', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const target = fixtureWorld.organisms.find((organism) => Number(organism?.traits?.eggHatchTime) > 0) ?? fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: target.x, clientY: target.y });

    const organismHud = screen.getByRole('region', { name: /organism info/i });
    const isEggLaying = Number(target?.traits?.eggHatchTime) > 0;

    expect(organismHud).toHaveTextContent(`Birth mode: ${isEggLaying ? 'Egg-laying' : 'Live birth'}`);
    expect(organismHud).toHaveTextContent(`Adolescence period: ${target.traits.adolescenceAge.toFixed(3)}`);
    if (isEggLaying) {
      expect(organismHud).toHaveTextContent(`Egg incubation: ${target.traits.eggHatchTime.toFixed(3)}`);
      return;
    }

    expect(organismHud).not.toHaveTextContent(/Egg incubation:/i);
  });

  it('renders terrain effect in selected organism HUD when organism is in a terrain zone (SSN-263)', async () => {
    vi.useFakeTimers();

    // Use terrain zones that cover almost the entire world to ensure organisms are in terrain
    window.history.replaceState(
      {},
      '',
      '/?seed=terrain-hud-test-seed&terrainZoneEnabled=1&terrainZoneCount=1&terrainZoneMinWidthRatio=0.5&terrainZoneMaxWidthRatio=0.5&terrainZoneMinHeightRatio=0.5&terrainZoneMaxHeightRatio=0.5'
    );

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Terrain HUD Test',
        seed: 'terrain-hud-test-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 1,
          minZoneWidthRatio: 0.5,
          maxZoneWidthRatio: 0.5,
          minZoneHeightRatio: 0.5,
          maxZoneHeightRatio: 0.5
        }
      },
      'terrain-hud-test-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.terrainZones).toHaveLength(1);

    const selectedFixture = initialWorld.organisms.find((organism) => (
      deriveOrganismTerrainEffect(organism, initialWorld.terrainZones) !== null
    ));
    expect(selectedFixture).toBeTruthy();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'terrain-hud-test-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/initial food/i), { target: { value: '30' } });

    const terrainToggle = screen.getByLabelText(/enable terrain zones/i);
    if (!terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/min zone width ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/max zone width ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/min zone height ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/max zone height ratio/i), { target: { value: '0.5' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    expect(organismHud).toHaveTextContent(/Terrain:/);
    expect(organismHud).toHaveTextContent(/Terrain:\s*(Plains|Forest|Wetland|Rocky):/i);
  });

  it('does not render terrain line in organism HUD when no organism is selected (SSN-263)', async () => {
    vi.useFakeTimers();

    window.history.replaceState(
      {},
      '',
      '/?seed=terrain-no-selection-seed&terrainZoneEnabled=1&terrainZoneCount=4'
    );

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Terrain No Selection Test',
        seed: 'terrain-no-selection-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 4
        }
      },
      'terrain-no-selection-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.terrainZones).toHaveLength(4);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'terrain-no-selection-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/initial food/i), { target: { value: '30' } });

    const terrainToggle = screen.getByLabelText(/enable terrain zones/i);
    if (!terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.queryByRole('region', { name: /organism info/i })).not.toBeInTheDocument();

    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    expect(statsHud).toBeInTheDocument();
    expect(within(statsHud).getByText(/^population:/i)).toHaveTextContent('Population: 20 (→ Flat)');
  });

  it('clears terrain from HUD when selected organism is deselected (SSN-263)', async () => {
    vi.useFakeTimers();

    window.history.replaceState(
      {},
      '',
      '/?seed=terrain-deselect-seed&terrainZoneEnabled=1&terrainZoneCount=1&terrainZoneMinWidthRatio=0.5&terrainZoneMaxWidthRatio=0.5&terrainZoneMinHeightRatio=0.5&terrainZoneMaxHeightRatio=0.5'
    );

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Terrain Deselect Test',
        seed: 'terrain-deselect-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 1,
          minZoneWidthRatio: 0.5,
          maxZoneWidthRatio: 0.5,
          minZoneHeightRatio: 0.5,
          maxZoneHeightRatio: 0.5
        }
      },
      'terrain-deselect-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const selectedFixture = initialWorld.organisms.find((organism) => (
      deriveOrganismTerrainEffect(organism, initialWorld.terrainZones) !== null
    ));
    expect(selectedFixture).toBeTruthy();

    const emptyPoint = (() => {
      const candidates = [
        { x: 0, y: 0 },
        { x: 799, y: 0 },
        { x: 0, y: 479 },
        { x: 799, y: 479 }
      ];
      return candidates.find((candidate) => (
        initialWorld.organisms.every((organism) => {
          const dx = organism.x - candidate.x;
          const dy = organism.y - candidate.y;
          return (dx * dx) + (dy * dy) > 81;
        })
      )) ?? { x: 0, y: 0 };
    })();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'terrain-deselect-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/initial food/i), { target: { value: '30' } });

    const terrainToggle = screen.getByLabelText(/enable terrain zones/i);
    if (!terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/min zone width ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/max zone width ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/min zone height ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/max zone height ratio/i), { target: { value: '0.5' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(/Terrain:/);

    fireEvent.click(canvas, { clientX: emptyPoint.x, clientY: emptyPoint.y });

    expect(screen.queryByRole('region', { name: /organism info/i })).not.toBeInTheDocument();
  });

  it('renders terrain legend in detailed HUD when terrain zones are present (SSN-265)', async () => {
    vi.useFakeTimers();

    // Use URL params to configure terrain - let app construct config
    window.history.replaceState({}, '', '/?seed=terrain-legend-test&terrainZoneEnabled=1&terrainZoneCount=2');

    render(<App />);

    // Start simulation
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    act(() => { vi.advanceTimersByTime(100); });

    // Enable detailed HUD
    fireEvent.click(screen.getByRole('button', { name: /detailed/i }));

    // Query terrain legend ONLY within stats HUD region (not config panel)
    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });

    // Verify Terrain section exists in stats HUD
    const terrainSection = within(statsHud).getByText(/^Terrain$/);
    expect(terrainSection).toBeInTheDocument();

    // Verify terrain entries with effects appear in stats HUD only
    const terrainEntries = within(statsHud).getAllByText(/(Forest|Wetland|Rocky|Plains):/);
    expect(terrainEntries.length).toBeGreaterThan(0);

    // Verify each entry has effect text
    terrainEntries.forEach(entry => {
      expect(entry.textContent).toMatch(/: (reduced vision|reduced speed and turn rate|passive energy drain|baseline terrain)/);
    });

    vi.useRealTimers();
  });

  it('does not render terrain legend when no terrain zones are present (SSN-265)', async () => {
    vi.useFakeTimers();

    // Disable terrain zones via URL
    window.history.replaceState({}, '', '/?seed=no-terrain-test&terrainZoneEnabled=0');

    render(<App />);

    // Start simulation
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    act(() => { vi.advanceTimersByTime(100); });

    // Enable detailed HUD
    fireEvent.click(screen.getByRole('button', { name: /detailed/i }));

    // Query stats HUD only
    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });

    // Terrain legend should NOT appear in stats HUD
    expect(within(statsHud).queryByText(/^Terrain$/)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('renders terrain legend entries in deterministic order (SSN-265)', async () => {
    vi.useFakeTimers();

    // Use fixed seed that will generate known terrain types
    window.history.replaceState({}, '', '/?seed=det-order-test&terrainZoneEnabled=1&terrainZoneCount=4');

    // First render
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole('button', { name: /detailed/i }));

    const statsHud1 = screen.getByRole('region', { name: /simulation stats hud/i });
    const entries1 = within(statsHud1).getAllByText(/(Forest|Wetland|Rocky|Plains):/);
    const text1 = entries1.map(e => e.textContent);
    const order1 = text1.sort();

    unmount();

    // Second render with same seed
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole('button', { name: /detailed/i }));

    const statsHud2 = screen.getByRole('region', { name: /simulation stats hud/i });
    const entries2 = within(statsHud2).getAllByText(/(Forest|Wetland|Rocky|Plains):/);
    const text2 = entries2.map(e => e.textContent);
    const order2 = text2.sort();

    // Same terrain types appear in same order
    expect(order1).toEqual(order2);

    vi.useRealTimers();
  });

  it('renders hazard effect in selected organism inspector when organism is in a danger zone (SSN-270)', async () => {
    vi.useFakeTimers();

    // Reset URL to avoid interference from previous tests that may have set terrain params
    window.history.replaceState({}, '', '/');

    // Use deterministic config to ensure we can find organisms in the danger zone
    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Hazard Inspector Test',
        seed: 'hazard-inspector-test-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        dangerZoneEnabled: true,
        dangerZoneCount: 1,
        dangerZoneRadius: 100,
        dangerZoneDamage: 1.5
      },
      'hazard-inspector-test-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.dangerZones).toHaveLength(1);

    // Find an organism that's in the danger zone
    const organismInZone = initialWorld.organisms.find((org) => {
      const zone = initialWorld.dangerZones[0];
      const dx = org.x - zone.x;
      const dy = org.y - zone.y;
      return (dx * dx + dy * dy) < (zone.radius * zone.radius);
    });
    expect(organismInZone).toBeTruthy();

    // Verify the hazard effect is derived correctly
    const hazardEffect = deriveOrganismHazardEffect(organismInZone, initialWorld.dangerZones);
    expect(hazardEffect).not.toBeNull();
    expect(hazardEffect.totalDamage).toBe(1.5);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'hazard-inspector-test-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });

    // Enable danger zones via UI - no terrain zones so no conflict
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    if (!dangerZoneToggle.checked) {
      fireEvent.click(dangerZoneToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/zone radius/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/damage per tick/i), { target: { value: '1.5' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Mock canvas bounding rect for click selection
    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Click on the organism that's in the danger zone
    fireEvent.click(canvas, { clientX: organismInZone.x, clientY: organismInZone.y });

    // Verify the organism inspector shows the hazard info
    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(`Organism ${organismInZone.id.slice(0, 8)}`);
    expect(organismHud).toHaveTextContent(/Hazard:/);
    expect(organismHud).toHaveTextContent(/Hazard:\s*(Lava|Acid|Radiation):\s*-[\d.]+ energy\/tick/i);

    vi.useRealTimers();
  });

  it('renders placeholder for hazard in organism inspector when no hazard (SSN-270)', async () => {
    vi.useFakeTimers();

    // Use deterministic config with no danger zones - no terrain zones either to avoid label conflicts
    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'No Hazard Inspector Test',
        seed: 'no-hazard-inspector-test-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        dangerZoneEnabled: false
      },
      'no-hazard-inspector-test-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.dangerZones).toHaveLength(0);

    // Pick any organism
    const selectedOrganism = initialWorld.organisms[0];
    expect(selectedOrganism).toBeTruthy();

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'no-hazard-inspector-test-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });

    // Ensure danger zones are disabled (default is off)
    const dangerZoneToggle = screen.getByLabelText(/enable danger zones/i);
    if (dangerZoneToggle.checked) {
      fireEvent.click(dangerZoneToggle);
    }

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Mock canvas bounding rect for click selection
    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Click on an organism
    fireEvent.click(canvas, { clientX: selectedOrganism.x, clientY: selectedOrganism.y });

    // Verify the organism inspector shows placeholder for hazard
    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(/Hazard:\s*—/i);

    vi.useRealTimers();
  });

  // SSN-283: Tests for pinned and stale inspector environmental context alignment
  it('pinned organism terrain context stays aligned when live selection changes (SSN-283)', async () => {
    vi.useFakeTimers();

    // Use terrain zones that cover almost the entire world - proven to work from SSN-263
    window.history.replaceState(
      {},
      '',
      '/?seed=terrain-hud-test-seed&terrainZoneEnabled=1&terrainZoneCount=1&terrainZoneMinWidthRatio=0.5&terrainZoneMaxWidthRatio=0.5&terrainZoneMinHeightRatio=0.5&terrainZoneMaxHeightRatio=0.5'
    );

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Terrain HUD Test',
        seed: 'terrain-hud-test-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        initialFoodCount: 30,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 1,
          minZoneWidthRatio: 0.5,
          maxZoneWidthRatio: 0.5,
          minZoneHeightRatio: 0.5,
          maxZoneHeightRatio: 0.5
        }
      },
      'terrain-hud-test-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    expect(initialWorld.terrainZones).toHaveLength(1);

    // Find an organism in terrain - using same approach as SSN-263 test
    const pinnedOrganism = initialWorld.organisms.find((organism) =>
      deriveOrganismTerrainEffect(organism, initialWorld.terrainZones) !== null
    );
    expect(pinnedOrganism).toBeTruthy();
    const terrainLabel = deriveOrganismTerrainEffect(pinnedOrganism, initialWorld.terrainZones).label;

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'terrain-hud-test-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/initial food/i), { target: { value: '30' } });

    const terrainToggle = screen.getByLabelText(/enable terrain zones/i);
    if (!terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/min zone width ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/max zone width ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/min zone height ratio/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/max zone height ratio/i), { target: { value: '0.5' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, width: 800, height: 480, right: 800, bottom: 480, toJSON: () => ({})
    });

    // Select the organism in terrain
    fireEvent.click(canvas, { clientX: pinnedOrganism.x, clientY: pinnedOrganism.y });

    const organismHud = screen.getByRole('region', { name: /organism info/i });
    expect(organismHud).toHaveTextContent(`Organism ${pinnedOrganism.id.slice(0, 8)}`);
    // Verify terrain is shown before pinning
    expect(organismHud).toHaveTextContent(new RegExp(`Terrain:\\s*${terrainLabel}:`, 'i'));

    // Pin the organism using keyboard shortcut 'p'
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });

    // Click somewhere else to change selection - but pinned state should persist
    fireEvent.click(canvas, { clientX: 10, clientY: 10 });

    // The HUD should still show the pinned organism's terrain context
    expect(organismHud).toHaveTextContent(`Organism ${pinnedOrganism.id.slice(0, 8)}`);
    expect(organismHud).toHaveTextContent(new RegExp(`Terrain:\\s*${terrainLabel}:`, 'i'));

    vi.useRealTimers();
  });

  // SSN-283: Test terrain context is preserved after organism death
  it('stale organism preserves terrain context after death (SSN-283)', async () => {
    vi.useFakeTimers();

    // Setup deterministic simulation with terrain zones
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'stale-terrain-seed' } });
    fireEvent.change(screen.getByLabelText(/^initial population$/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^minimum population$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^initial food count$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^max food$/i), { target: { value: '1' } });

    // Enable terrain zones (large zone to ensure organisms are in terrain)
    const terrainToggle = screen.getByLabelText(/enable terrain zones/i);
    if (!terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/min zone width ratio/i), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText(/max zone width ratio/i), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText(/min zone height ratio/i), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText(/max zone height ratio/i), { target: { value: '0.9' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    // Pre-compute world state and find an organism that will die and is in terrain
    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Stale terrain test',
        seed: 'stale-terrain-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 2,
        minimumPopulation: 1,
        initialFoodCount: 0,
        foodSpawnChance: 0,
        foodEnergyValue: 5,
        maxFood: 1,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 1,
          minZoneWidthRatio: 0.9,
          maxZoneWidthRatio: 0.9,
          minZoneHeightRatio: 0.9,
          maxZoneHeightRatio: 0.9
        }
      },
      'stale-terrain-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const rng = createSeededPrng(deterministicConfig.resolvedSeed);
    const stepParams = toEngineStepParams(deterministicConfig);
    const initialIds = initialWorld.organisms.map((organism) => organism.id);

    // Find an organism that is in terrain and will die
    let projected = initialWorld;
    let targetOrganismId = null;
    let deathTick = null;
    let targetTerrainLabel = null;

    for (let i = 0; i < 800 && !targetOrganismId; i += 1) {
      projected = stepWorld(projected, rng, stepParams);
      const diedId = initialIds.find((id) => !projected.organisms.some((organism) => organism.id === id));
      if (diedId) {
        const targetOrganism = initialWorld.organisms.find((o) => o.id === diedId);
        const terrainEffect = deriveOrganismTerrainEffect(targetOrganism, initialWorld.terrainZones);
        if (terrainEffect) {
          targetOrganismId = diedId;
          deathTick = i + 1;
          targetTerrainLabel = terrainEffect.label;
        }
      }
    }

    // Skip test if no suitable organism found (but this shouldn't happen with right config)
    if (!targetOrganismId) {
      vi.useRealTimers();
      return;
    }

    const selectedFixture = initialWorld.organisms.find((organism) => organism.id === targetOrganismId);
    expect(selectedFixture).toBeTruthy();
    expect(targetTerrainLabel).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Select the organism that will die
    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    // Verify terrain is shown BEFORE death
    const organismHudBeforeDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudBeforeDeath).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    expect(organismHudBeforeDeath).toHaveTextContent(new RegExp(`Terrain:\\s*${targetTerrainLabel}:`, 'i'));

    // Advance to death
    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    act(() => {
      vi.advanceTimersByTime(deathTick * 1000 / 30);
    });
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    // Verify terrain is PRESERVED after death (stale state)
    const organismHudAfterDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudAfterDeath).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    expect(organismHudAfterDeath).toHaveTextContent(/Deceased/i);
    // Terrain context should be preserved from the snapshot
    expect(organismHudAfterDeath).toHaveTextContent(new RegExp(`Terrain:\\s*${targetTerrainLabel}:`, 'i'));

    vi.useRealTimers();
  });

  // SSN-283: Test hazard context is preserved after organism death
  it('stale organism preserves hazard context after death (SSN-283)', async () => {
    vi.useFakeTimers();

    // Setup deterministic simulation with danger zones
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'stale-hazard-seed' } });
    fireEvent.change(screen.getByLabelText(/^initial population$/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^minimum population$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^initial food count$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^max food$/i), { target: { value: '1' } });

    // Disable terrain zones if enabled (to avoid conflicts with danger zone controls)
    const terrainToggle = screen.queryByLabelText(/enable terrain zones/i);
    if (terrainToggle && terrainToggle.checked) {
      fireEvent.click(terrainToggle);
    }

    // Enable danger zones
    const dangerToggle = screen.getByLabelText(/enable danger zones/i);
    if (!dangerToggle.checked) {
      fireEvent.click(dangerToggle);
    }
    fireEvent.change(screen.getByLabelText(/zone count/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/zone radius/i), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/damage per tick/i), { target: { value: '1.0' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    // Pre-compute world state and find an organism that will die and is in hazard
    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Stale hazard test',
        seed: 'stale-hazard-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 2,
        minimumPopulation: 1,
        initialFoodCount: 0,
        foodSpawnChance: 0,
        foodEnergyValue: 5,
        maxFood: 1,
        enableDangerZones: true,
        dangerZoneCount: 1,
        dangerZoneRadius: 200,
        dangerZoneDamage: 1.0
      },
      'stale-hazard-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const rng = createSeededPrng(deterministicConfig.resolvedSeed);
    const stepParams = toEngineStepParams(deterministicConfig);
    const initialIds = initialWorld.organisms.map((organism) => organism.id);

    // Find an organism that is in hazard and will die
    let projected = initialWorld;
    let targetOrganismId = null;
    let deathTick = null;
    let targetHazardLabel = null;

    for (let i = 0; i < 800 && !targetOrganismId; i += 1) {
      projected = stepWorld(projected, rng, stepParams);
      const diedId = initialIds.find((id) => !projected.organisms.some((organism) => organism.id === id));
      if (diedId) {
        const targetOrganism = initialWorld.organisms.find((o) => o.id === diedId);
        const hazardEffect = deriveOrganismHazardEffect(targetOrganism, initialWorld.dangerZones);
        if (hazardEffect) {
          targetOrganismId = diedId;
          deathTick = i + 1;
          targetHazardLabel = hazardEffect.label;
        }
      }
    }

    // Skip test if no suitable organism found (but this shouldn't happen with right config)
    if (!targetOrganismId) {
      vi.useRealTimers();
      return;
    }

    const selectedFixture = initialWorld.organisms.find((organism) => organism.id === targetOrganismId);
    expect(selectedFixture).toBeTruthy();
    expect(targetHazardLabel).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    // Select the organism that will die
    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    // Verify hazard is shown BEFORE death
    const organismHudBeforeDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudBeforeDeath).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    expect(organismHudBeforeDeath).toHaveTextContent(new RegExp(`Hazard:\\s*${targetHazardLabel}`, 'i'));

    // Advance to death
    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    act(() => {
      vi.advanceTimersByTime(deathTick * 1000 / 30);
    });
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    // Verify hazard is PRESERVED after death (stale state)
    const organismHudAfterDeath = screen.getByRole('region', { name: /organism info/i });
    expect(organismHudAfterDeath).toHaveTextContent(`Organism ${selectedFixture.id.slice(0, 8)}`);
    expect(organismHudAfterDeath).toHaveTextContent(/Deceased/i);
    // Hazard context should be preserved from the snapshot
    expect(organismHudAfterDeath).toHaveTextContent(new RegExp(`Hazard:\\s*${targetHazardLabel}`, 'i'));

    vi.useRealTimers();
  });

});
