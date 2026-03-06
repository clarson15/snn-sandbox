# snn-sandbox

`snn-sandbox` is a browser-based artificial life sandbox where organisms evolve in a 2D world.

Project stack:
- **Frontend:** React + Vite
- **Backend:** ASP.NET (.NET)
- **Data:** MySQL

The product focus is fun, observable emergent behavior with deterministic simulation runs.

## Project purpose

SNN Sandbox lets players:
- create simulations
- observe organisms move, eat, reproduce, and evolve
- inspect organism traits and neural wiring over time
- save and resume ecosystems

This is an interactive simulation project, not a scientific analysis platform.

## Prerequisites

Install the following locally:
- **Node.js** (with npm)
- **.NET SDK**
- **Docker + Docker Compose** (optional, for containerized run/build checks)

## Repository layout

- `frontend/` — React app
- `backend/SnnSandbox/` — ASP.NET API
- `backend/SnnSandbox.Tests/` — backend tests
- `snn-sandbox.sln` — .NET solution

## Setup

### 1) Clone and enter the repo

```bash
git clone https://github.com/clarson15/snn-sandbox.git
cd snn-sandbox
```

### 2) Frontend install

```bash
cd frontend
npm ci
cd ..
```

### 3) Backend restore

```bash
dotnet restore snn-sandbox.sln
```

## Run

### Run frontend (dev)

```bash
cd frontend
npm run dev
```

### Run backend API

```bash
dotnet run --project backend/SnnSandbox/SnnSandbox.csproj
```

## Test

### Frontend tests

```bash
cd frontend
npm test
```

### Backend tests

```bash
dotnet test snn-sandbox.sln
```

## Build

### Frontend production build

```bash
cd frontend
npm run build
```

### Backend build

```bash
dotnet build snn-sandbox.sln
```

### Docker build validation

The Dockerfile validates frontend and backend in CI-compatible flow:
- frontend `npm ci`
- frontend `npm test`
- frontend `npm run build`
- backend restore/build/test/publish

Build image:

```bash
docker build -t snn-sandbox:local .
```

## Deterministic simulation seed behavior

Simulation behavior must be deterministic:
- Same seed + same parameters + same initial state => identical results
- Randomness should come from a seed-controlled PRNG
- Avoid nondeterministic sources in simulation logic (for example, wall-clock time or unseeded randomness)

If a seed is not provided when creating a simulation, one may be generated and persisted with the simulation state.
