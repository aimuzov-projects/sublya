# Contributing

Issues and pull requests are welcome.

- Bot: `uv sync`, then `uv run pytest` in `src/bot`. Point `SUBLYA_FFMPEG` at an ffmpeg
  with libass, or the render tests are skipped.
- A change to word timings needs a test on `src/bot/tests/fixtures/natasha`: it's a real
  recording, and the reference timings there were checked frame by frame.
- Site: `npm ci`, then `npm run format:check`, `npm run lint:js`, `npm run lint:css` and
  `npm run check`; CI runs the same.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), in English.
- Never commit `.env` or tokens. `.env.example` lists every variable with an empty value.
