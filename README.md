# Caldera Hotel Elements Demo

A **luxury hotel booking demo** for *The Caldera House* (Santorini): guests pick a room, enter details, then pay with **Flywire** embedded checkout (sandbox). The UI is a static front end served by a small **Express** API that proxies Flywire session creation so API keys stay on the server.

## Stack

- **Node.js** 18+ (20 recommended)
- **Express** — static files from `public/`, JSON APIs under `/api/*`
- **Flywire** — Payments Platform sandbox (`api-platform-sandbox.flywire.com`), SDK loaded from `artifacts.flywire.com`

## Local development

```bash
npm install
cp .env.example .env   # then fill in real Flywire sandbox credentials
npm run dev            # or: npm start
```

Open [http://localhost:3000](http://localhost:3000) (or the port in `PORT`).

## Environment variables

| Variable | Description |
|----------|-------------|
| `FLYWIRE_API_KEY` | Server-side API key (`X-Authentication-Key` for Flywire Payments API) |
| `FLYWIRE_RECIPIENT_ID` | Flywire recipient ID used when creating checkout sessions |
| `FLYWIRE_FRONTEND_KEY` | Public key exposed to the browser via `/api/config` for the Flywire JS SDK |
| `PORT` | HTTP port (optional; defaults to `3000`. **Render sets this automatically**.) |

Never commit `.env`. It is listed in `.gitignore`.

## Deploy on Render

### Option A — Blueprint (uses `render.yaml`)

1. Push this repository to GitHub (or GitLab / Bitbucket connected to Render).
2. In the [Render Dashboard](https://dashboard.render.com), choose **New** → **Blueprint**.
3. Connect the repository and select the branch. Render will detect `render.yaml`.
4. When prompted, set the three **Flywire** environment variables (`sync: false` in the blueprint means they are entered in the UI, not stored in the file).
5. Apply the blueprint. After the first deploy, open the service URL.

### Option B — Web Service manually

1. **New** → **Web Service**, connect the repo.
2. **Runtime:** Node  
3. **Build command:** `npm install`  
4. **Start command:** `npm start`  
5. Under **Environment**, add `FLYWIRE_API_KEY`, `FLYWIRE_RECIPIENT_ID`, and `FLYWIRE_FRONTEND_KEY`.  
6. Deploy.

The app listens on `process.env.PORT`, which Render provides.

## Project layout

```
├── server.js          # Express app, Flywire session + confirm proxies
├── public/
│   ├── index.html     # Booking flow (rooms → guest → payment)
│   ├── app.js         # Client logic and Flywire element
│   └── styles.css
├── docs/              # Additional notes (e.g. Flywire element)
├── package.json
├── render.yaml        # Render Blueprint for one-click-style deploy
└── .env.example       # Template for local secrets
```

## License

Private / demo — use per your organization’s policy.
