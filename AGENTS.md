# Repository Guidelines

## Project Structure & Module Organization
The repo is split by runtime. `frontend/` contains the React + Vite UI, with feature code in `frontend/src/` and deterministic simulation modules grouped under `frontend/src/simulation/`. The ASP.NET API lives in `backend/SnnSandbox/`, and backend tests live in `backend/SnnSandbox.Tests/`. Treat `frontend/src/simulation/engine.js` as the canonical simulation engine and keep engine-related tests colocated under `frontend/src/simulation/`. Use `docs/` for design notes and replay artifacts.

## Build, Test, and Development Commands
Install frontend dependencies with `cd frontend && npm ci`, then restore .NET packages with `dotnet restore snn-sandbox.sln`.

- `cd frontend && npm run dev`: start the Vite frontend locally.
- `dotnet run --project backend/SnnSandbox/SnnSandbox.csproj`: run the API on port `5000` by default.
- `cd frontend && npm test`: run Vitest once.
- `dotnet test snn-sandbox.sln`: run xUnit backend tests.
- `cd frontend && npm run build`: create the production frontend bundle.
- `dotnet build snn-sandbox.sln`: compile the backend solution.
- `docker build -t snn-sandbox:local .`: CI-like full-stack validation.

## Coding Style & Naming Conventions
JavaScript uses ES modules, 2-space indentation, single quotes, and semicolons. Prefer `camelCase` for variables/functions, `PascalCase` for React components, and colocated `*.test.js` or `*.test.jsx` files beside the code they cover. C# uses nullable reference types, implicit usings, and 4-space indentation; keep public types and test methods in `PascalCase`. Match existing deterministic-simulation constraints: avoid ambient randomness and wall-clock time in engine code.

## Testing Guidelines
Frontend tests use Vitest with Testing Library; backend tests use xUnit with `Microsoft.AspNetCore.Mvc.Testing`. Name tests after observable behavior, for example `replaySummary.test.js` or `Save_RejectsMissingName`. Add or update tests with every simulation, replay, persistence, or API behavior change. For deterministic engine work, cover same-seed replay behavior when relevant.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects such as `Add organism lifespan and reproduction cadence controls` and `Fix share-link default expectations`; an optional conventional prefix like `fix:` is acceptable but not required. Keep commits focused and descriptive. PRs should explain user-visible behavior, note test coverage, link the relevant issue, and include screenshots or recordings for UI changes.

## Configuration & Runtime Notes
Use `.env.example` as the starting point for local configuration. `APP_VERSION` is injected during Docker builds and exposed by `/api/status`; preserve that flow in release-related changes.
