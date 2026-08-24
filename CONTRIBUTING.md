# Contributing

Issues and pull requests are welcome.

## Getting started

```sh
npm ci
npm run check          # typecheck + lint + l10n + unit tests
npm run test:integration
npm run build
```

`src/core` must never import `vscode`: it is pure and tested with fixtures. The VS Code layer lives in `src/vscode`, `src/ui` and `src/pro`.

## House rules

- **No emoji in the UI.** Inline SVG or codicons.
- **Never present a derived figure as exact.** The `Confianza` type is there for that.
- Fixtures are synthetic. Real transcripts carry prompts and code and must not end up in the repository or in a test.
- Any new user-visible string goes through `vscode.l10n.t()` and must have a Spanish translation: `npm run l10n` fails otherwise.
- New rates go in `src/core/precios/tarifas.json` with the date updated.
