// Starting points for the piano's effects. Each names the effects it turns on and how they differ
// from DRY's; everything else is off. Values must sit on a slider's steps (three figures on a log
// slider), or the preset won't match itself once saved; tools/smoke/effects.mjs checks.

import { DRY, FX_KINDS, type FxKind, type FxSettings, sameSound } from '../audio/fx-model.js';

export interface FxPreset {
  id: string;
  name: string;
  fx: FxSettings;
}

type Changes = { [K in FxKind]?: Partial<FxSettings[K]> };

function preset(id: string, name: string, changes: Changes): FxPreset {
  const fx = { on: true } as FxSettings;
  for (const kind of FX_KINDS) {
    const change = changes[kind];
    (fx as unknown as Record<FxKind, object>)[kind] = change
      ? { ...DRY[kind], on: true, ...change }
      : { ...DRY[kind] };
  }
  return { id, name, fx };
}

export const FX_PRESETS: readonly FxPreset[] = [
  preset('dry', 'Dry: the piano as it is', {}),
  preset('room', 'Room: a little space round it', {
    reverb: { size: 0.8, preDelay: 6, tone: 0.55, mix: 0.25 },
  }),
  preset('hall', 'Concert hall', {
    reverb: { size: 2.6, preDelay: 25, tone: 0.5, mix: 0.32 },
  }),
  preset('cathedral', 'Cathedral: a long, dark tail', {
    reverb: { size: 6.5, preDelay: 45, tone: 0.35, mix: 0.45 },
  }),
  preset('echoes', 'Echoes: dotted eighths, left and right', {
    echo: { sync: '1/8.', repeats: 0.45, tone: 0.55, mix: 0.32, pingPong: true },
    reverb: { size: 1.2, preDelay: 10, tone: 0.5, mix: 0.2 },
  }),
  preset('electric', 'Electric: chorus, a slow pan, warm', {
    drive: { amount: 0.25 },
    eq: { low: 2, high: -3 },
    chorus: { rate: 0.6, depth: 0.45, mix: 0.45 },
    tremolo: { rate: 3.5, depth: 0.45, pan: true },
    reverb: { size: 1, preDelay: 8, tone: 0.45, mix: 0.2 },
  }),
  preset('lofi', 'Lo-fi: thin, warm and wobbly', {
    drive: { amount: 0.45 },
    eq: { mid: 3, midHz: 1200, lowCut: 220, highCut: 3800, steep: true },
    chorus: { rate: 0.35, depth: 0.5, mix: 0.6 },
    reverb: { size: 0.9, preDelay: 5, tone: 0.3, mix: 0.22 },
  }),
  preset('dream', 'Dream: a slow shimmer, long echoes', {
    chorus: { rate: 0.3, depth: 0.6, mix: 0.4 },
    echo: { sync: '1/4', repeats: 0.55, tone: 0.4, mix: 0.3, pingPong: true },
    reverb: { size: 5, preDelay: 30, tone: 0.55, mix: 0.45 },
  }),
  preset('underwater', 'Underwater: far off and muffled', {
    eq: { low: 3, highCut: 700, steep: true },
    chorus: { rate: 0.2, depth: 0.8, mix: 0.6 },
    reverb: { size: 3.5, preDelay: 15, tone: 0.2, mix: 0.5 },
  }),
];

export const fxPresetOf = (fx: FxSettings): FxPreset | undefined =>
  FX_PRESETS.find((p) => sameSound(p.fx, fx));
