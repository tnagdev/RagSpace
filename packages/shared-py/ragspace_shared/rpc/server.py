import asyncio
import logging
import time
import uuid
from collections.abc import Callable, Sequence

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

from ..context import correlation_id_var
from .errors import ERROR_CODE_KEY, RpcError

GRPC_PORT = 50051
MAX_MESSAGE_BYTES = 16 * 1024 * 1024
_QUIET_PREFIXES = ("/grpc.health.v1.Health/", "/grpc.reflection.")
_PROPAGATED = {
    grpc.StatusCode.UNAVAILABLE,
    grpc.StatusCode.DEADLINE_EXCEEDED,
    grpc.StatusCode.RESOURCE_EXHAUSTED,
}

logger = logging.getLogger("grpc")


async def start_grpc_server(
    register: Callable[[grpc.aio.Server], None],
    service_names: Sequence[str],
    port: int = GRPC_PORT,
) -> grpc.aio.Server:
    server = grpc.aio.server(
        interceptors=[_CallInterceptor()],
        options=[
            ("grpc.max_receive_message_length", MAX_MESSAGE_BYTES),
            ("grpc.max_send_message_length", MAX_MESSAGE_BYTES),
        ],
    )
    register(server)

    health_servicer = health.aio.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    for name in (*service_names, ""):
        await health_servicer.set(name, health_pb2.HealthCheckResponse.SERVING)
    reflection.enable_server_reflection(
        (*service_names, health.SERVICE_NAME, reflection.SERVICE_NAME), server
    )

    server.add_insecure_port(f"0.0.0.0:{port}")
    await server.start()
    logger.info("gRPC listening on :%d", port)
    return server


class _CallInterceptor(grpc.aio.ServerInterceptor):
    async def intercept_service(self, continuation, handler_call_details):
        handler = await continuation(handler_call_details)
        method = handler_call_details.method
        if handler is None or method.startswith(_QUIET_PREFIXES):
            return handler
        metadata = dict(handler_call_details.invocation_metadata or ())
        correlation_id = metadata.get("x-correlation-id") or str(uuid.uuid4())
        if handler.unary_unary:
            return grpc.unary_unary_rpc_method_handler(
                _wrap_unary(handler.unary_unary, method, correlation_id),
                request_deserializer=handler.request_deserializer,
                response_serializer=handler.response_serializer,
            )
        if handler.unary_stream:
            return grpc.unary_stream_rpc_method_handler(
                _wrap_stream(handler.unary_stream, method, correlation_id),
                request_deserializer=handler.request_deserializer,
                response_serializer=handler.response_serializer,
            )
        return handler


def _wrap_unary(behavior, method: str, correlation_id: str):
    async def wrapper(request, context: grpc.aio.ServicerContext):
        correlation_id_var.set(correlation_id)
        started = time.monotonic()
        try:
            response = await behavior(request, context)
        except RpcError as error:
            await _abort(context, method, error)
        except (asyncio.CancelledError, grpc.aio.AbortError):
            raise
        except grpc.aio.AioRpcError as error:
            await _upstream(context, method, error)
        except Exception:
            logger.exception("%s INTERNAL", method)
            await context.abort(grpc.StatusCode.INTERNAL, "Internal error")
        logger.info("%s OK %dms", method, (time.monotonic() - started) * 1000)
        return response

    return wrapper


def _wrap_stream(behavior, method: str, correlation_id: str):
    async def wrapper(request, context: grpc.aio.ServicerContext):
        correlation_id_var.set(correlation_id)
        started = time.monotonic()
        try:
            async for item in behavior(request, context):
                yield item
        except RpcError as error:
            await _abort(context, method, error)
        except (asyncio.CancelledError, grpc.aio.AbortError):
            raise
        except grpc.aio.AioRpcError as error:
            await _upstream(context, method, error)
        except Exception:
            logger.exception("%s INTERNAL", method)
            await context.abort(grpc.StatusCode.INTERNAL, "Internal error")
        logger.info("%s OK %dms", method, (time.monotonic() - started) * 1000)

    return wrapper


async def _abort(context: grpc.aio.ServicerContext, method: str, error: RpcError) -> None:
    context.set_trailing_metadata(((ERROR_CODE_KEY, error.reason), *error.meta.items()))
    logger.warning("%s %s %s", method, error.status.name, error.message)
    await context.abort(error.status, error.message)


async def _upstream(context: grpc.aio.ServicerContext, method: str, error: grpc.aio.AioRpcError) -> None:
    if error.code() not in _PROPAGATED:
        logger.error("%s INTERNAL (upstream %s: %s)", method, error.code().name, error.details())
        await context.abort(grpc.StatusCode.INTERNAL, "Internal error")
    meta = tuple((k, v) for k, v in (error.trailing_metadata() or ()) if k.startswith("x-"))
    if meta:
        context.set_trailing_metadata(meta)
    logger.warning("%s upstream %s: %s", method, error.code().name, error.details())
    await context.abort(error.code(), error.details() or "")
