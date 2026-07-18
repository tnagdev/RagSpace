import os

# Must be set before any src imports because Settings() is instantiated at module level
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_db")

import pytest
from src.decorators.singleton import SingletonMeta


@pytest.fixture(autouse=True)
def clear_singletons():
    """Reset all singleton instances before and after every test."""
    SingletonMeta._instances.clear()
    yield
    SingletonMeta._instances.clear()
