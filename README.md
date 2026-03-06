# snn-sandbox

Browser-based evolutionary ecosystem sandbox with a React frontend and .NET backend.

## Frontend (React shell)

The frontend lives in `frontend/` and is scaffolded with Vite + React.

### Install dependencies

```bash
cd frontend
npm ci
```

### Run in development mode

```bash
cd frontend
npm run dev
```

### Run frontend tests

```bash
cd frontend
npm test
```

### Create production build

```bash
cd frontend
npm run build
```

The production build outputs static assets to `frontend/dist/` and is CI-compatible.

## Docker build validation

The Dockerfile validates both backend and frontend during image build:

- Frontend dependencies are installed with `npm ci` (lockfile required).
- Frontend tests run with `npm test` and fail the build if tests fail.
- Frontend production assets are generated with `npm run build` and copied into `wwwroot`.
- Backend restore/build/test/publish still run in the .NET SDK stage.

## Current backlog TODOs

- Rewrite README with full project overview and usage
- Add semver APP_VERSION propagation into build/runtime
