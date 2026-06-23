import contextvars

correlation_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    'correlation_id', default='no-correlation-id'
)
