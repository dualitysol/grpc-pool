/**
 * @layra/grpc — Zero-allocation gRPC plugin
 *
 * Replaces per-request Protobuf message allocations with a pre-allocated
 * object pool. Works as a @grpc/grpc-js ServerInterceptor.
 *
 * ── Quick Start ──────────────────────────────────────────────
 *
 *   import { Server } from '@grpc/grpc-js';
 *   import { createPooledInterceptor } from '@layra/grpc';
 *   import { MyRequest } from './generated/proto.js';
 *
 *   const server = new Server({
 *     interceptors: [createPooledInterceptor({
 *       messageType: MyRequest,
 *       poolSize: 10000,
 *     })],
 *   });
 *   server.addService(protoService, handlers);
 *   server.bindAsync('0.0.0.0:50051', ...);
 *
 * ── What it does ─────────────────────────────────────────────
 *   - Intercepts requestDeserialize on every method
 *   - Acquires a pooled object instead of calling new Message()
 *   - Decodes binary data into the existing object (decodeInto)
 *   - Passes the pooled object to the handler
 *   - Releases the object back to the pool after handler completion
 *
 *   Result: Zero allocations for request deserialization.
 *   Under high load, GC pressure is dramatically reduced.
 */

export { MessagePool } from './pool/message-pool.js';
export type { MessagePoolItem, MessageFactory, ResetFn } from './pool/message-pool.js';

export { BufferPool } from './pool/buffer-pool.js';
export type { BufferPoolItem } from './pool/buffer-pool.js';

export { decodeInto, resetMessage, getDefaultValue } from './decoder/custom-decoder.js';

export { createPooledInterceptor } from './interceptor/grpc-interceptor.js';
export type { PooledInterceptorOptions } from './interceptor/grpc-interceptor.js';
