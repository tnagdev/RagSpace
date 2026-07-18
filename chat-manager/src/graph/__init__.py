# Lazy imports — do not eagerly import orchestrator here.
# The orchestrator depends on langgraph-checkpoint-postgres which requires
# a live Postgres connection at import time.
# Callers import directly from src.graph.orchestrator instead.

