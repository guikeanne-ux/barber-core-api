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

## Run locally

```bash
npm run dev
```

## Run the containerized environment

```bash
npm run docker:up
npm run smoke
```

## Reset the Docker environment

```bash
npm run docker:reset
```
