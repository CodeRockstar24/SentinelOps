from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import get_settings
from app.schemas import DependencyHealth


def build_redis_client() -> Redis:
    settings = get_settings()
    return Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )


async def check_redis() -> DependencyHealth:
    client = build_redis_client()

    try:
        pong = await client.ping()
    except RedisError as exc:
        return DependencyHealth(status="unhealthy", detail=str(exc))
    finally:
        await client.aclose()

    if pong is True:
        return DependencyHealth(status="healthy", detail="Redis connection succeeded")

    return DependencyHealth(status="unhealthy", detail="Redis ping returned an unexpected response")
