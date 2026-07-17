# Deployment Guide

SentinelOps can run locally, but a recruiter-friendly hosted version is possible with a free-friendly split.

## Recommended Free-Friendly Stack

| Component | Recommended Service | Why |
| --- | --- | --- |
| Frontend | Vercel Hobby | Excellent Next.js support and easy environment variable setup |
| Backend | Render Free Web Service | Simple Python/FastAPI deployment |
| Redis | Upstash Redis Free | Managed Redis endpoint suitable for lightweight demos |
| Database | SQLite for local, PostgreSQL for hosted persistence | SQLite is fine locally; hosted free services often have ephemeral filesystems |

## Important Hosting Notes

Render free web services can spin down after idle time and may take around a minute to wake up. Free web services also have ephemeral filesystems, so local SQLite database files can be lost on restart or redeploy.

For a production-style hosted version, use PostgreSQL instead of SQLite. SentinelOps uses SQLAlchemy, so the database URL can be swapped without changing API routes.

## Environment Variables

### Backend

Set these on Render or your backend hosting provider:

```env
ENVIRONMENT=production
API_SERVICE_NAME=SentinelOps API
API_VERSION=0.1.0
DATABASE_URL=sqlite:///./data/sentinelops.db
REDIS_URL=your_upstash_redis_url
CORS_ORIGINS=https://your-vercel-app.vercel.app
TELEMETRY_STREAM_NAME=telemetry:events
TELEMETRY_STREAM_MAXLEN=500
TELEMETRY_PRODUCER_ENABLED=true
TELEMETRY_PRODUCER_INTERVAL_SECONDS=1.0
INCIDENT_DETECTOR_ENABLED=true
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your_gemini_key
```

### Frontend

Set this on Vercel:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-api.onrender.com
```

## Render Backend

Suggested configuration:

- Root directory: `services/api`
- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Because the backend currently starts telemetry producer and detector tasks inside the FastAPI process, no separate worker is required for the demo.

## Vercel Frontend

Suggested configuration:

- Framework preset: Next.js
- Root directory: `apps/web`
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: Next.js default

## Upstash Redis

Create a Redis database and copy the Redis URL into the backend `REDIS_URL` variable.

The free tier is enough for a lightweight portfolio demo. For higher traffic or persistent public demos, upgrade to a paid managed Redis service.

## Production Hardening Roadmap

- Replace SQLite with PostgreSQL.
- Move telemetry producer and detector into background workers.
- Add auth for operator actions.
- Add rate limits to demo trigger endpoints.
- Store postmortem exports in object storage.
- Add CI checks for backend and frontend.
- Add observability for the SentinelOps backend itself.
