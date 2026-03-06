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

### Create production build

```bash
cd frontend
npm run build
```

The production build outputs static assets to `frontend/dist/` and is CI-compatible.

## Current backlog TODOs

- Configure Dockerfile to run frontend tests and include frontend build
- Rewrite README with full project overview and usage
- Add semver APP_VERSION propagation into build/runtime
