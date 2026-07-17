from fastapi import APIRouter, Response, status

from app.config import get_settings
from app.database import check_sqlite
from app.redis_client import check_redis
from app.schemas import DependencyHealth, HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(response: Response) -> HealthResponse:
    settings = get_settings()
    dependencies: dict[str, DependencyHealth] = {
        "sqlite": check_sqlite(),
        "redis": await check_redis(),
    }

    overall_status = (
        "healthy"
        if all(dependency.status == "healthy" for dependency in dependencies.values())
        else "degraded"
    )

    if overall_status != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        service=settings.api_service_name,
        version=settings.api_version,
        environment=settings.environment,
        status=overall_status,
        dependencies=dependencies,
    )
