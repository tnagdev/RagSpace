from datetime import datetime, timezone
from typing import Any

from google.protobuf import json_format, struct_pb2, timestamp_pb2
from google.protobuf.internal.enum_type_wrapper import EnumTypeWrapper


def to_timestamp(value: datetime | None) -> timestamp_pb2.Timestamp | None:
    if value is None:
        return None
    ts = timestamp_pb2.Timestamp()
    ts.FromDatetime(value if value.tzinfo else value.replace(tzinfo=timezone.utc))
    return ts


def from_timestamp(value: timestamp_pb2.Timestamp) -> datetime:
    return value.ToDatetime(tzinfo=timezone.utc)


def to_struct(value: dict[str, Any] | None) -> struct_pb2.Struct:
    struct = struct_pb2.Struct()
    if value:
        struct.update(value)
    return struct


def from_struct(value: struct_pb2.Struct) -> dict[str, Any]:
    return json_format.MessageToDict(value)


def enum_value(enum: EnumTypeWrapper, prefix: str, bare: str | None) -> int:
    if not bare:
        return 0
    try:
        return enum.Value(f"{prefix}_{bare}")
    except ValueError:
        return 0


def enum_name(enum: EnumTypeWrapper, prefix: str, number: int) -> str | None:
    if not number:
        return None
    try:
        name = enum.Name(number)
    except ValueError:
        return None
    return name[len(prefix) + 1 :] if name.startswith(f"{prefix}_") else name
