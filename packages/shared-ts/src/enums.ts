const DROPPED = new Set(['UNSPECIFIED', 'UNRECOGNIZED']);

// Proto enums are prefixed ("FILE_TYPE_VIDEO"); Prisma and the public API use
// the bare value ("VIDEO").
export function toProtoEnum<E extends string>(prefix: string, value: string): E {
  return `${prefix}_${value}` as E;
}

export function fromProtoEnum(prefix: string, value: string | undefined): string | undefined {
  if (!value || value === 'UNRECOGNIZED') return undefined;
  const bare = value.startsWith(`${prefix}_`) ? value.slice(prefix.length + 1) : value;
  return DROPPED.has(bare) ? undefined : bare;
}
