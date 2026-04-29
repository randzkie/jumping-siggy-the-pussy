# Jumping Siggy

Endless runner game with optional on-chain proof-of-presence on **Ritual Net**.

When a player connects MetaMask and starts the game in on-chain mode, the app sends a transaction to a deployed `PresenceRegistry` contract to record presence.

## Features

- Endless runner gameplay (jump/crawl obstacles)
- MetaMask connect + Ritual Net auto-switch/add flow
- On-chain presence recording via contract call
- Score + best score tracking in browser

## Tech Stack

- React + Vite
- TypeScript
- Express (custom server runtime)
- Ethers v6 (wallet + contract tx from browser)

## Project Structure

- `client/src/pages/Home.tsx` - game loop, controls, rendering, wallet/game UX
- `client/src/lib/wallet.ts` - MetaMask connect and Ritual Net network handling
- `client/src/lib/ritual-tx.ts` - on-chain `recordPresence` transaction logic
- `contracts/PresenceRegistry.sol` - presence registry contract

## Prerequisites

- Node.js 20+ (recommended)
- Corepack enabled
- MetaMask installed
- Ritual Net configured/fundable wallet

## Setup

1. Install dependencies:

```bash
corepack pnpm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Fill required values in `.env`:

- `VITE_OAUTH_PORTAL_URL`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `VITE_PRESENCE_CONTRACT_ADDRESS` (after deploying contract)

## Deploy Presence Contract

This repo includes `contracts/PresenceRegistry.sol`. You must deploy it and set the deployed address in `VITE_PRESENCE_CONTRACT_ADDRESS`.

### Option A: Deploy from this repo (recommended)

1. Add deployment env values in `.env`:

```env
RITUAL_RPC_URL=https://rpc.ritualnet.io
DEPLOYER_PRIVATE_KEY=0x...
```

2. Compile contract:

```bash
corepack pnpm contract:compile
```

3. Deploy to Ritual Net:

```bash
corepack pnpm contract:deploy
```

4. Copy printed deployed address and set:

```env
VITE_PRESENCE_CONTRACT_ADDRESS=0x...
```

### Option B: Deploy with Remix

1. Open [Remix](https://remix.ethereum.org/).
2. Create file `PresenceRegistry.sol` and paste `contracts/PresenceRegistry.sol` content.
3. Compile with Solidity `^0.8.20`.
4. Deploy using **Injected Provider - MetaMask** on Ritual Net.
5. Copy deployed contract address into `.env` as `VITE_PRESENCE_CONTRACT_ADDRESS`.

## Run

```bash
corepack pnpm dev
```

If port `3000` is occupied, server automatically uses another port.

## How On-chain Presence Works

1. User connects wallet.
2. App switches/adds Ritual Net (`chainId: 696`) if needed.
3. User clicks **Start Game (Record on-chain)**.
4. Frontend calls:
   - `recordPresence(uint256 score)` on `PresenceRegistry`.
5. On success, contract emits:
   - `PresenceRecorded(player, score, timestamp, playerPresenceCount, totalPresenceRecords)`.

## Verify On-chain

- Check transaction hash shown by MetaMask or app flow.
- Open Ritual explorer and inspect:
  - transaction success status
  - contract call input to `recordPresence`
  - `PresenceRecorded` event logs

## Notes

- If `VITE_PRESENCE_CONTRACT_ADDRESS` is missing/invalid, app blocks on-chain presence call and shows an actionable error.
- Local score in UI is still stored in browser localStorage for gameplay UX.

## Deploy on Railway

This repo is already prepared for Railway with `railway.json`.

### 1) Push to GitHub

Commit and push this project to a GitHub repo.

### 2) Create Railway project

1. Go to [Railway](https://railway.app/) and sign in.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select this repository and branch.

Railway will use:
- Build: `corepack pnpm install --frozen-lockfile && corepack pnpm build`
- Start: `corepack pnpm start`

### 3) Set environment variables in Railway

In your Railway service -> **Variables**, set:

Required:
- `NODE_ENV=production`
- `VITE_APP_ID`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_PRESENCE_CONTRACT_ADDRESS` (from your Foundry deployment)
- `OAUTH_SERVER_URL`
- `JWT_SECRET`

Optional / feature-dependent:
- `DATABASE_URL`
- `OWNER_OPEN_ID`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_URL`

Notes:
- Do not manually set `PORT`; Railway injects it automatically.
- Any `VITE_*` value is embedded into the frontend build output.

### 4) Trigger deployment

- Railway auto-deploys on push.
- You can also click **Deploy** manually in the dashboard.

### 5) Verify after deploy

1. Open the generated Railway URL.
2. Connect MetaMask and switch to Ritual Net.
3. Start game with on-chain mode.
4. Confirm tx in wallet and verify the transaction/event on Ritual explorer.

### 6) Updating contract address later

If you redeploy contract with Foundry:
1. Update `VITE_PRESENCE_CONTRACT_ADDRESS` in Railway Variables.
2. Trigger a new deployment (required because `VITE_*` vars are build-time).

## Deploy on Fly.io

This repo is prepared for Fly with:
- `Dockerfile`
- `.dockerignore`
- `fly.toml`

### 1) Install and login

1. Install Fly CLI: [https://fly.io/docs/flyctl/install/](https://fly.io/docs/flyctl/install/)
2. Login:

```bash
fly auth login
```

### 2) Create app (first time only)

From project root:

```bash
fly apps create jumping-siggy
```

If `jumping-siggy` is already taken globally, pick another name and update `app` in `fly.toml`.

### 3) Set secrets (environment variables)

Set required secrets:

```bash
fly secrets set \
NODE_ENV=production \
VITE_APP_ID=your_app_id \
VITE_OAUTH_PORTAL_URL=https://your-oauth-portal \
VITE_PRESENCE_CONTRACT_ADDRESS=0xYourFoundryDeployedContract \
OAUTH_SERVER_URL=https://your-oauth-server \
JWT_SECRET=your_strong_secret
```

Optional (feature-dependent):

```bash
fly secrets set \
DATABASE_URL=... \
OWNER_OPEN_ID=... \
BUILT_IN_FORGE_API_URL=... \
BUILT_IN_FORGE_API_KEY=... \
VITE_FRONTEND_FORGE_API_KEY=... \
VITE_FRONTEND_FORGE_API_URL=...
```

### 4) Deploy

```bash
fly deploy
```

### 5) Open app

```bash
fly open
```

### 6) Update contract address later

When you redeploy with Foundry:

```bash
fly secrets set VITE_PRESENCE_CONTRACT_ADDRESS=0xNewAddress
fly deploy
```

`VITE_*` values are embedded at build time, so redeploy is required after updates.

## Deploy on Vercel (Temporary)

This repo includes `vercel.json` for quick frontend deployment.

Important:
- This mode deploys the built frontend from `dist/public`.
- Express server routes are not running in this temporary setup.
- Game works, wallet connect works, and on-chain tx from browser works.
- Server-dependent endpoints (OAuth server routes, tRPC server APIs) are not available unless you refactor them into Vercel Functions.

### 1) Import project in Vercel

1. Go to [Vercel](https://vercel.com/) and import your GitHub repo.
2. Vercel will detect `vercel.json` automatically.

### 2) Configure environment variables (Project -> Settings -> Environment Variables)

Set these for frontend behavior:

- `VITE_APP_ID`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_PRESENCE_CONTRACT_ADDRESS`
- `VITE_FRONTEND_FORGE_API_KEY` (if map feature used)
- `VITE_FRONTEND_FORGE_API_URL` (if map feature used)

Optional analytics keys if you use them in `index.html`:
- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`

### 3) Deploy

Push to your connected branch or click **Deploy** in Vercel.

### 4) Verify

1. Open deployed URL.
2. Connect MetaMask on Ritual Net.
3. Start game and confirm transaction from wallet.
