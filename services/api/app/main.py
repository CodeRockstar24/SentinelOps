import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.incidents import run_incident_detector
from app.routers.actions import router as actions_router
from app.routers.demo import router as demo_router
from app.routers.health import router as health_router
from app.routers.incidents import router as incidents_router
from app.routers.postmortems import router as postmortems_router
from app.routers.telemetry import router as telemetry_router
from app.telemetry import run_telemetry_producer


settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    stop_event = asyncio.Event()
    producer_task: asyncio.Task[None] | None = None
    detector_task: asyncio.Task[None] | None = None

    if settings.telemetry_producer_enabled:
        producer_task = asyncio.create_task(run_telemetry_producer(stop_event))
    if settings.incident_detector_enabled:
        detector_task = asyncio.create_task(run_incident_detector(stop_event))

    try:
        yield
    finally:
        stop_event.set()
        for task in (producer_task, detector_task):
            if task is None:
                continue
            try:
                await asyncio.wait_for(task, timeout=5)
            except TimeoutError:
                task.cancel()


app = FastAPI(
    title=settings.api_service_name,
    version=settings.api_version,
    description="SentinelOps backend foundation with live telemetry streaming.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(telemetry_router)
app.include_router(incidents_router)
app.include_router(actions_router)
app.include_router(demo_router)
app.include_router(postmortems_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": settings.api_service_name,
        "version": settings.api_version,
        "health": "/health",
        "telemetry": "/telemetry/stream",
        "incidents": "/incidents",
        "agents": "/incidents/{incident_id}/analyze",
        "tools": "/tools",
        "actions": "/incidents/{incident_id}/actions",
        "demo_trigger": "/demo/trigger-payment-outage",
        "postmortems": "/incidents/{incident_id}/postmortems",
    }
