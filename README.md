# AGRISENSE – Smart Agricultural Market Intelligence Platform

A React + Vite starter project for a Kenyan farmer market-intelligence platform.

## Features in this downloadable project
- Public landing page and farmer planning dashboard
- Verified community price comparisons and daily, weekly and monthly movement when history is available
- Transport-cost and estimated net-proceeds calculator, including market comparisons
- Market outlook interface for 7-day, 30-day, 3-month and 6-month planning horizons
- Storage-directory examples with clear availability, contact and charge limitations
- Seven-day county weather forecast using Open-Meteo and a Kenya Meteorological Department seasonal-forecast link
- Farmer profiles including county, crops, farm size and expected harvest date
- Community price reporting, pending verification
- Browser price-threshold alerts stored on the current device
- Farm-planning advisory that uses verified market and weather information where available

## Run on Windows
1. Install Node.js LTS from https://nodejs.org/
2. Extract this ZIP.
3. Open the extracted `AGRISENSE_Project` folder in VS Code.
4. Open Terminal > New Terminal.
5. Run:
   ```bash
   npm install
   npm run dev
   ```
6. Open the localhost address shown in the terminal, usually http://localhost:5173

### Run the JavaScript backend
Requires Node.js 18 or newer and a PostgreSQL database. The backend creates its tables and indexes on startup and reads environment variables from `.env.local` or `.env` in the project root (process environment variables take precedence).

```bash
npm install
```

For Neon, run `neon deploy` after linking the project. Neon writes `DATABASE_URL` and `DATABASE_URL_UNPOOLED` into the ignored `.env.local` file; the backend loads them automatically. Application requests use the pooled URL, while startup schema setup uses the direct URL. For a manually configured local database, set `DATABASE_URL` in the process environment; schema setup falls back to that URL:

```powershell
$env:DATABASE_URL = "postgresql://username:password@localhost:5432/agrisense"
npm run backend
```

The backend starts at http://localhost:8080. Verify it at:
http://localhost:8080/api/_healthcheck

During local development, Vite forwards `/api` requests from the frontend to this backend. Start `npm run backend` and `npm run dev` in separate terminals. The database schema is defined in `backend/schema.sql`; the backend applies it when it starts.

For hosting, create a PostgreSQL database with your hosting provider and add its connection string as the backend's `DATABASE_URL` environment variable. Use Neon's pooled connection string for the Node.js `pg` backend; Neon requires TLS and includes the required SSL options in its generated connection string. Never commit `.env.local`, `.env`, or database credentials. A starter variable list is in `.env.example`.

Create an account or sign in from the public landing page. User accounts and sessions are stored in PostgreSQL; passwords are salted and hashed (minimum 10 characters), and sessions use an HttpOnly, SameSite cookie. Profile and price-report endpoints require a valid session and scope records to the signed-in user. Accounts use email and password; password reset and email verification are not configured.

Available routes:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET` and `POST /api/profile`
- `GET` and `POST /api/market-reports`
- `GET /api/market-prices` (verified reports only)
- `POST /api/forecast`
- `GET /api/weather?county=Kisii`
- `POST /api/notify-self`
- `GET /api/_healthcheck`

To create a production build:
```bash
npm run build
```

## Important data notes
- Example prices and storage listings are illustrative, not verified live market quotations. They are kept separate from market comparisons.
- Community market reports are stored as pending until verified. The market-price route only returns verified reports.
- PostgreSQL stores farmer profiles and market reports. Set regular database backups with your provider.
- The seven-day weather page calls Open-Meteo through the backend. Longer-term seasonal guidance links to the Kenya Meteorological Department.
- The outlook interface does not claim to generate AI predictions or future prices; an AI forecasting provider and sufficient verified history are not configured.
- Market distances and transport rates are user-entered estimates, not route-service results. Browser price alerts only run while the app is open and are not SMS or scheduled server notifications.
- The storage directory contains examples, not verified live facilities; contact details, availability and charges need a trusted data source.
- Official market-price feeds, verified facility listings, route integration, crop-specific agronomy guidance, AI forecasting and SMS alerts need their respective data/provider configuration.

## Project structure
```text
AGRISENSE_Project/
├── backend/
│   ├── run-backend.bat
│   └── server.js
├── docs/
├── src/
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Deploying
### Deploy on Render

The root `render.yaml` configures one Node.js web service, a PostgreSQL database, and the connection between them. The Node service also serves the built frontend, so the website and API use the same domain.

1. Push the project to a GitHub repository. Do not upload `.env` files, passwords, or database connection strings.
2. Create or sign in to a Render account and connect it to GitHub.
3. In Render, choose **New → Blueprint**, select your repository, and apply the `render.yaml` configuration.
4. Review the web service and PostgreSQL database plans and their prices before confirming. The example uses paid plans; charges depend on Render's current pricing.
5. Wait for the deployment to finish. Open the web service URL Render provides. Check that `<your-service-url>/api/_healthcheck` returns an `"ok": true` response and says `"database": "PostgreSQL"`.

The backend creates the tables and indexes from `backend/schema.sql` when it starts. Render supplies `PORT` and the `DATABASE_URL` reference from the configured database. The Vite proxy remains for local development; in production, the backend serves the frontend and API on the same origin.

The app now has email/password sign-in and database-backed sessions. Email verification and account recovery are not configured; do not use it as identity verification for high-risk actions.

Render Blueprint documentation: https://render.com/docs/blueprint-spec

## Security
Never put Google Maps, SMS, database, or AI provider secret keys in frontend source code or commit them to GitHub. Store secrets in the hosting provider's secure environment.
