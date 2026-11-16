# Machine Test

Angular 22 practice app for the ten machine-test tasks in [`docs/`](docs/). It is standalone, zoneless and client-only (no SSR), and Zod validates everything that enters the app.

- **Run:** `npm start` → <http://localhost:4200> · `npm test` · `npm run build` · `npm run format`
- **Structure:** `core/utils` (shared helpers: `parseWith`, storage, `toErrorMessage`), `core/auth` (Task 5), `shared/models`, `features/<task>` (one lazy-loaded route per task).
- **Decisions:** each feature has a signal store (private `signal` state, public `computed` selectors, methods as the only writers). Types come from Zod schemas via `z.infer`.
- **With more time:** NgRx SignalStore for bigger features, httpOnly-cookie auth, e2e tests.
