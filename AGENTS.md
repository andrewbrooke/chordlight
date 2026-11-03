# AGENTS.md

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the code layout and conventions.

- After editing `src/`, run `npm run check`, `npm run format:check` and `npm run smoke`. Rebuild
  with `npm run dev` before testing in a browser; `npm start` serves a stale `dist/`.
- Don't add browser automation. Visual and audio changes are checked by hand; say what you
  couldn't verify.
- Keep the server bound to 127.0.0.1 and the page free of external requests.
- Keep the modules listed as pure in CONTRIBUTING.md free of DOM, three.js and Web Audio.
- Put new tunable numbers in `src/tuning.ts`.
- Comment only what the code doesn't make clear.
