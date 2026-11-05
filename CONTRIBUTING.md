# Contributing

## Setup

Node.js 20.11 or newer, then:

```bash
npm ci
npm run dev        # build, then serve on http://127.0.0.1:5190
```

`npm start` serves whatever is already in `dist/` without rebuilding, so use `npm run dev` (or keep
`npm run watch` running) after changing anything in `src/`.

## Checks

Before sending a change:

```bash
npm run check
npm run format:check
npm run smoke
```

The smokes in `tools/smoke/` are plain Node scripts that import the compiled modules from `dist/`
through the package's own name (`chordlight/…`). Each one asserts through `kit/check.mjs` and exits
non-zero on failure. Add one for anything that would otherwise break silently.

There are no browser tests. Check visual and audio changes by hand in a browser. For changes to the
piano's sound, `npm run render` writes WAV files to `var/render/`; for the guitar amp's,
`npm run render -- amp` does.

## Code layout

| directory       | contents                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `src/theory/`   | keys, spelling, chords, recognition, Roman numerals, scale choice, lights |
| `src/presets/`  | the preset progressions and guitar tunings                                |
| `src/audio/`    | piano and plucked-string synthesis, the guitar amp, backing, transport    |
| `src/view/`     | the three.js keyboard and guitar neck                                     |
| `src/input/`    | computer keyboard, pointer and MIDI input                                 |
| `src/listen/`   | guitar input: the note detector, its worklet, and the setup's measures    |
| `src/ui/`       | panels, controls, the guitar setup and the explanation text               |
| `src/clips/`    | clip capture and playback                                                 |
| `src/app.ts`    | state and the per-frame loop                                              |
| `src/tuning.ts` | tunable constants                                                         |

## Conventions

- **No bundler.** The browser loads `dist/` directly through the import map in `index.html`, so
  imports within `src/` are relative and end in `.js`. `tools/smoke/modules.mjs` checks this.
- **Pure modules stay pure.** `src/theory/`, `src/presets/`, `src/audio/piano-model.ts`,
  `guitar-model.ts`, `amp-model.ts`, `timeline.ts`, `voicing.ts`, `plan.ts`, `src/input/layouts.ts`,
  `src/view/neck-layout.ts` and `framing.ts`, `src/listen/` except `input.ts` and `link.ts`,
  `src/clips/extract.ts`, `backing.ts`, `file.ts`, `realise.ts`, `midifile.ts`, `score.ts`,
  `notate.ts`, `engrave.ts`, `pdf.ts` and `sheet.ts`, and `src/ui/tour-steps.ts` and
  `tour-place.ts` must not touch the DOM, three.js or Web Audio: the smokes import them in Node,
  the piano renderer runs in a Worker, and the guitar detector runs in an AudioWorklet.
- **The detector is checked on synthesised audio and on real recordings.** `tools/smoke/listen.mjs`
  plucks notes with the guitar voice and asserts what is heard and when; synthesised strings
  don't do everything a real guitar does, so a recording from **Record input** (a WAV with its
  setup inside) can be kept in `tools/smoke/recordings/` beside a `.json` of what was played, and
  `tools/smoke/recordings.mjs` replays it on every run. The folder is gitignored, so recordings
  stay local. `npm run hear` replays one by hand.
- **The amp is one chain, built twice.** `src/audio/amp-model.ts` is the chain as data; the page
  builds it as Web Audio nodes and `AmpModel` runs it offline. `tools/smoke/amp.mjs` holds the
  sounds equally loud and distinct, so re-run it after changing a sound in `tuning.ts`.
- **Constants go in `src/tuning.ts`.**
- **Spelling comes from the key, not the pitch.** F major has B♭, never A♯.
- **Progressions are stored as Roman numerals**, so changing the key transposes them.
- **The server binds to 127.0.0.1 only**, and the page's Content-Security-Policy keeps it from
  loading anything from other origins. Keep both.
- **Dependencies:** three.js at runtime; TypeScript and Prettier for development. Run `npm audit`
  after changing them.
- Comment code only where it isn't self-explanatory.
