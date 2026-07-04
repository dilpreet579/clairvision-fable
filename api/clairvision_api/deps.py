from collections.abc import Iterator
from functools import lru_cache

import redis
from sqlalchemy.orm import Session

from clairvision_shared.config import get_settings
from clairvision_shared.db.session import get_sessionmaker


def get_db() -> Iterator[Session]:
    Session_ = get_sessionmaker()
    with Session_() as session:
        yield session


@lru_cache
def get_redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url)
