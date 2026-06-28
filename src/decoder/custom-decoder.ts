/**
 * Custom Protobuf Decoder — decodeInto(existingObject, buffer)
 *
 * Instead of allocating a new object via Message.decode(),
 * this function fills an EXISTING object's fields from binary data.
 */

import protobuf from 'protobufjs';

// ── Wire Types ─────────────────────────────────────

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

// ── Field Map Cache ────────────────────────────────

const fieldMapCache = new WeakMap<protobuf.ReflectionObject, Map<number, protobuf.Field>>();

function getFieldMap(type: protobuf.Type): Map<number, protobuf.Field> {
  let cached = fieldMapCache.get(type);
  if (cached) return cached;

  cached = new Map();
  for (const field of type.fieldsArray) {
    cached.set(field.id, field);
  }
  fieldMapCache.set(type, cached);
  return cached;
}

// ── Default Values ─────────────────────────────────

export function getDefaultValue(field: protobuf.Field): unknown {
  if (field.repeated) return [];
  if (field.map) return {};

  switch (field.type) {
    case 'string': return '';
    case 'bytes': return Buffer.alloc(0);
    case 'bool': return false;
    case 'int32': case 'uint32': case 'sint32':
    case 'fixed32': case 'sfixed32':
    case 'int64': case 'uint64': case 'sint64':
    case 'fixed64': case 'sfixed64':
    case 'float': case 'double':
      return 0;
    default:
      return null;
  }
}

export function resetMessage<T>(message: T, type: protobuf.Type): void {
  const obj = message as Record<string, unknown>;
  for (const field of type.fieldsArray) {
    obj[field.name] = getDefaultValue(field);
  }
}

// ── Field Type Resolution ─────────────────────────

type FieldValueType =
  | 'varint' | 'fixed32' | 'fixed64'
  | 'string' | 'bytes' | 'bool'
  | 'float' | 'double' | 'message' | 'enum';

function resolveFieldType(field: protobuf.Field, parentType: protobuf.Type): FieldValueType {
  switch (field.type) {
    case 'double': return 'double';
    case 'float': return 'float';
    case 'int64': case 'uint64': case 'sint64':
    case 'fixed64': case 'sfixed64': return 'fixed64';
    case 'int32': case 'uint32': case 'sint32':
    case 'fixed32': case 'sfixed32': return 'fixed32';
    case 'bool': return 'bool';
    case 'string': return 'string';
    case 'bytes': return 'bytes';
    default: {
      const resolved = parentType.lookupTypeOrEnum(field.type);
      if (resolved instanceof protobuf.Type) return 'message';
      return 'varint';
    }
  }
}

// ── Skip Unknown Fields ───────────────────────────

function skipField(reader: protobuf.Reader, wireType: number): void {
  switch (wireType) {
    case WIRE_VARINT:
      reader.skip();  // skip() without args skips a varint
      break;
    case WIRE_FIXED64:
      reader.skip(8);
      break;
    case WIRE_LENGTH_DELIMITED: {
      const len = reader.uint32();
      reader.skip(len);
      break;
    }
    case WIRE_FIXED32:
      reader.skip(4);
      break;
    default:
      throw new Error(`Unknown wire type: ${wireType}`);
  }
}

// ── Read Field Value ──────────────────────────────

function readField(
  reader: protobuf.Reader,
  wireType: number,
  fieldType: FieldValueType,
  field: protobuf.Field
): unknown {
  switch (fieldType) {
    case 'bool':
      return reader.uint32() !== 0;

    case 'varint':
    case 'fixed32':
      if (field.type === 'sint32') return reader.sint32();
      if (field.type === 'sint64') return Number(reader.sint64());
      if (field.type === 'int64' || field.type === 'uint64') {
        return Number(reader.uint64());
      }
      return reader.uint32();

    case 'float':
      return reader.float();

    case 'double':
      return reader.double();

    case 'fixed64': {
      if (field.type === 'sfixed64' || field.type === 'fixed64') {
        reader.skip(8);
        return 0;
      }
      return Number(reader.uint64());
    }

    case 'string':
      return reader.string();

    case 'bytes':
      return reader.bytes();

    case 'message': {
      const len = reader.uint32();
      const bytes = reader.buf.slice(reader.pos, reader.pos + len);
      reader.skip(len);
      return Buffer.from(bytes);
    }

    default:
      skipField(reader, wireType);
      return undefined;
  }
}

// ── Core decodeInto ───────────────────────────────

/**
 * Fill an existing object `target` with data from a binary buffer.
 * Uses `type` (protobuf.Type) metadata for parsing.
 *
 * @param target   - existing object (from MessagePool)
 * @param buffer   - Uint8Array with protobuf-encoded data
 * @param type     - protobufjs Type
 * @returns target — same object, now populated with data
 */
export function decodeInto<T>(
  target: T,
  buffer: Uint8Array,
  type: protobuf.Type
): T {
  const fieldMap = getFieldMap(type);
  const reader = protobuf.Reader.create(buffer);
  const obj = target as Record<string, unknown>;

  while (reader.pos < reader.len) {
    const token = reader.uint32();
    const fieldNumber = token >>> 3;
    const wireType = token & 0x07;

    const field = fieldMap.get(fieldNumber);
    if (!field) {
      skipField(reader, wireType);
      continue;
    }

    const fieldType = resolveFieldType(field, type);
    const value = readField(reader, wireType, fieldType, field);

    if (field.repeated) {
      if (!Array.isArray(obj[field.name])) {
        obj[field.name] = [] as unknown[];
      }
      (obj[field.name] as unknown[]).push(value);
    } else {
      obj[field.name] = value;
    }
  }

  return target;
}

/**
 * Decode multiple buffers into the same target object.
 */
export function decodeRepeatedInto<T>(
  target: T,
  buffers: Uint8Array[],
  type: protobuf.Type
): T {
  for (const buf of buffers) {
    decodeInto(target, buf, type);
  }
  return target;
}
