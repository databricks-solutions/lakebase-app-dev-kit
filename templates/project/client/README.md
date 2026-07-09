# {{PROJECT_NAME}} client

A React + TypeScript single-page app (Vite) that talks to the backend JSON API
over relative `/api` (and `/health`) paths. In development, Vite proxies those
paths to the backend; in production, the backend serves the built client from
`client/dist`, so the same relative paths are same-origin.

## Layers (each tested on its own)

- `src/api/` , the ONLY layer that issues `fetch`; typed wrappers over the API.
- `src/hooks/` , data-fetching + UI state; call `api/`, never `fetch` directly.
- `src/components/` , presentational; receive props, emit events, never fetch.
- `src/pages/` , route-level views; the only place hooks + components are wired.
- `src/styles/` , design tokens as CSS custom properties (`var(--token)`).

## Commands

```bash
npm install
npm run dev          # Vite dev server (usually started for you by ../scripts/run-dev.sh)
npm run build        # type-check + production build into dist/
npm test             # component + hook + api tests (Vitest + Testing Library, jsdom)
npm run test:e2e     # Playwright: drives the SPA against the real backend
```

You normally do not run `npm install` here by hand: the post-checkout hook does
it, and `../scripts/run-dev.sh` boots this client alongside the backend.
