/**
 * gRPC Interceptor — Zero-allocation deserialization via MessagePool.
 *
 * Wraps @grpc/grpc-js server methods to:
 *   1. Acquire a Protobuf message from MessagePool
 *   2. Decode binary data into the existing object (decodeInto)
 *   3. Pass the pooled object to the handler
 *   4. Release the object back to pool after the handler completes
 */

import {
  ServerInterceptingCall,
  ServerInterceptingCallInterface,
  ServerInterceptor,
  ServerMethodDefinition,
} from '@grpc/grpc-js';
import type { Type } from 'protobufjs';

import { MessagePool } from '../pool/message-pool.js';
import { decodeInto, resetMessage } from '../decoder/custom-decoder.js';

export interface PooledInterceptorOptions {
  messageType: Type;
  poolSize?: number;
  onExhausted?: () => void;
}

export function createPooledInterceptor(
  opts: PooledInterceptorOptions
): ServerInterceptor {
  const { messageType, poolSize = 10000, onExhausted } = opts;

  const pool = new MessagePool(
    () => {
      const Ctor = messageType.ctor as new () => any;
      return new Ctor();
    },
    poolSize,
    (msg: unknown) => resetMessage(msg, messageType)
  );

  return function pooledInterceptor(
    methodDescriptor: ServerMethodDefinition<any, any>,
    call: ServerInterceptingCallInterface
  ): ServerInterceptingCall {
    const originalDeserialize = methodDescriptor.requestDeserialize;

    methodDescriptor.requestDeserialize = function pooledDeserialize(data: Buffer): any {
      const item = pool.acquire();
      if (!item) {
        if (onExhausted) onExhausted();
        return originalDeserialize.call(this, data);
      }

      decodeInto(item.message as Record<string, unknown>, data, messageType);

      const msg = item.message;
      (msg as any).__poolItem = item;
      (msg as any).__pool = pool;
      return msg;
    };

    return new ServerInterceptingCall(call, {
      sendStatus(status, next) {
        next(status);
      },
    });
  };
}
