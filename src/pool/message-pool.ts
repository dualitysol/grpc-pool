/**
 * MessagePool — Zero-allocation pool for Protobuf message objects.
 *
 * Analogous to DtoPool from layra-article, adapted for Protobuf:
 *   - Accepts a message factory (e.g. () => new MyMessage())
 *   - acquire() returns an existing object from the pool — O(1)
 *   - release() returns it to the pool — O(1)
 *   - reset(message) clears fields to defaults before re-use
 *
 * Key difference from DtoPool:
 *   DtoPool stores { dto, buf } pairs where dto.read() reads from buf.
 *   MessagePool stores message objects only.
 *   Data is written into the object via a custom decoder (decodeInto).
 */

export interface MessagePoolItem<T> {
  message: T;
  index: number;
}

/** Resets a Protobuf object to its default state. */
export type ResetFn<T> = (message: T) => void;

/** Creates a new message instance. */
export type MessageFactory<T> = () => T;

export class MessagePool<T> {
  private readonly freeList: MessagePoolItem<T>[];

  constructor(
    private readonly factory: MessageFactory<T>,
    poolSize: number,
    private readonly reset?: ResetFn<T>
  ) {
    if (typeof factory !== 'function') {
      throw new TypeError('factory must be a function');
    }
    if (poolSize <= 0 || !Number.isInteger(poolSize)) {
      throw new TypeError('poolSize must be a positive integer');
    }

    this.freeList = new Array(poolSize);
    for (let i = 0; i < poolSize; i++) {
      this.freeList[i] = { message: factory(), index: i };
    }
  }

  /** Acquire a message from the pool. Returns null if exhausted. */
  acquire(): MessagePoolItem<T> | null {
    if (this.freeList.length === 0) return null;
    return this.freeList.pop()!;
  }

  /** Return a message to the pool. Resets it first if resetFn provided. */
  release(item: MessagePoolItem<T> | null): void {
    if (item && typeof item.index === 'number') {
      if (this.reset) {
        this.reset(item.message);
      }
      this.freeList.push(item);
    }
  }

  /** Number of available messages. */
  available(): number {
    return this.freeList.length;
  }

  /** True if pool is empty. */
  get isExhausted(): boolean {
    return this.freeList.length === 0;
  }
}
