# Contributing

Issues and pull requests are welcome.

- `npm ci`, then `npm run format:check`, `npm run lint:js`, `npm run lint:css`, `npm run check`
  and `npm test`; CI runs the same. Point `SUBLYA_FFMPEG` at an ffmpeg with libass, or the
  render tests are skipped.
- A change to word timings needs a test on `src/bot/core/fixtures/natasha`: it's a real
  recording, and the reference timings there were checked frame by frame. `golden/` next to it
  holds what the Python bot made of it; the TypeScript one matches it byte for byte.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), in English.
- Never commit `.env` or tokens. `.env.example` lists every variable with an empty value.
