# Local Development

## Requirements

- Node.js `24.18.0`
- npm
- Docker

## Setup

```bash
cp .env.example .env
npm ci
```

Key local variables:

- `CORS_ORIGIN=http://localhost:5173`
- `SHUTDOWN_TIMEOUT_MS=10000`

## Run locally

```bash
npm run dev
```

## Run the containerized environment

```bash
npm run docker:up
npm run smoke
```

## Technical endpoints

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /docs`
- `GET /docs/json`

## Reset the Docker environment

```bash
npm run docker:reset
```
