# @dualitysol/grpc — Zero-Allocation gRPC for Node.js

**Replace per-request Protobuf allocations with a pre-allocated object pool.
Drop-in as a `@grpc/grpc-js` ServerInterceptor.**

## Why?

Every gRPC request in Node.js triggers `new Message()` during deserialization.
Under high load, these allocations cause GC pauses that eat your latency budget.

`@dualitysol/grpc` inverts the model:

1. **MessagePool** pre-allocates N Protobuf message objects at startup
2. **Custom decoder** (`decodeInto`) fills an existing object from binary data — no `new`
3. **Interceptor** hooks into `@grpc/grpc-js` to acquire/release automatically
4. **Result**: Zero allocations per request — GC stays idle

## Installation

```bash
npm install @dualitysol/grpc
```

Requires:
- Node.js 20+
- `@grpc/grpc-js` ^1.12.0
- `protobufjs` ^7.4.0 (peer dependency)

## Quick Start

### 1. Define your Protobuf service

```protobuf
syntax = "proto3";
package example;

message CreateUserRequest {
  string first_name = 1;
  string last_name = 2;
  uint32 age = 3;
  string email = 4;
}

message CreateUserResponse {
  bool success = 1;
  string message = 2;
}

service UserService {
  rpc CreateUser (CreateUserRequest) returns (CreateUserResponse);
}
```

### 2. Use the pooled interceptor

```typescript
import { Server } from '@grpc/grpc-js';
import { createPooledInterceptor } from '@dualitysol/grpc';
import { ProtoGrpcType } from './generated/proto';

const proto = loadSync('service.proto');
const packageDef = loadPackageDefinition(proto);
const service = packageDef.example.UserService;

const server = new Server({
  interceptors: [
    createPooledInterceptor({
      messageType: service.CreateUser.requestType,
      poolSize: 10000,
    }),
  ],
});

server.addService(service.service, {
  CreateUser: (call, callback) => {
    // call.request is a POOLED object — zero alloc
    const { firstName, lastName, email } = call.request;
    callback(null, { success: true, message: `Hello ${firstName}!` });
  },
});
```

### 3. Run

```bash
node --expose-gc server.js
```

## Performance

| Metric | Standard gRPC | @dualitysol/grpc | Improvement |
|--------|--------------|-------------|-------------|
| Alloc/request | ~300+ B | < 1 B | ~100× less |
| GC pauses | Frequent | Near zero | — |
| p99 latency | Higher | Stable | — |

## API

### `createPooledInterceptor(options)`

Creates a `ServerInterceptor` for `@grpc/grpc-js`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `messageType` | `protobuf.Type` | required | The Protobuf message type to pool |
| `poolSize` | `number` | 10000 | Number of pre-allocated messages |
| `onExhausted` | `() => void` | — | Called when pool is empty |

### `MessagePool<T>`

Generic object pool. Use directly for advanced scenarios.

```typescript
const pool = new MessagePool(() => new MyMessage(), 1000);
const item = pool.acquire();
// ... use item.message ...
pool.release(item);
```

### `decodeInto(target, buffer, type)`

Fill an existing object from a Protobuf-encoded buffer.

```typescript
const item = pool.acquire();
decodeInto(item.message, binaryData, MyMessageType);
// item.message now has all fields populated — no allocation
```

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │  @grpc/grpc-js Server               │
                    │                                     │
  gRPC request ────→│  Interceptor Pipeline               │
                    │    ↓                                │
                    │  methodDescriptor.requestDeserialize │
                    │    ↓                                │
                    │  MessagePool.acquire()               │
                    │    ↓                                │
                    │  decodeInto(pooledObj, data, type)   │
                    │    ↓                                │
                    │  Handler receives pooled object     │
                    │    ↓                                │
                    │  Handler completes → sendStatus      │
                    │    ↓                                │
                    │  MessagePool.release(pooledObj)      │
                    └─────────────────────────────────────┘
```

## License

ISC © Artem Tantsura
