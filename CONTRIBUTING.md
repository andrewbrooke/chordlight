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
piano's sound, `npm run render` writes WAV files to `var/render/`.

## Code layout

| directory       | contents                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `src/theory/`   | keys, spelling, chords, recognition, Roman numerals, scale choice, lights |
| `src/presets/`  | the preset progressions                                                   |
| `src/audio/`    | piano synthesis and playback, backing, transport, output                  |
| `src/view/`     | the three.js keyboard                                                     |
| `src/input/`    | computer keyboard, pointer and MIDI input                                 |
| `src/ui/`       | panels, controls and the explanation text                                 |
| `src/clips/`    | clip capture and playback                                                 |
| `src/app.ts`    | state and the per-frame loop                                              |
| `src/tuning.ts` | tunable constants                                                         |

## Conventions

- **No bundler.** The browser loads `dist/` directly through the import map in `index.html`, so
  imports within `src/` are relative and end in `.js`. `tools/smoke/modules.mjs` checks this.
- **Pure modules stay pure.** `src/theory/`, `src/presets/`, `src/audio/piano-model.ts`,
  `timeline.ts`, `voicing.ts`, `src/input/layouts.ts`, `src/clips/extract.ts` and `backing.ts` must
  not touch the DOM, three.js or Web Audio: the smokes import them in Node, and the piano renderer
  runs in a Worker.
- **Constants go in `src/tuning.ts`.**
- **Spelling comes from the key, not the pitch.** F major has B♭, never A♯.
- **Progressions are stored as Roman numerals**, so changing the key transposes them.
- **The server binds to 127.0.0.1 only**, and the page's Content-Security-Policy keeps it from
  loading anything from other origins. Keep both.
- **Dependencies:** three.js at runtime; TypeScript and Prettier for development. Run `npm audit`
  after changing them.
- Comment code only where it isn't self-explanatory.
