/**
 * BufferPool — Zero-allocation pool for fixed-size buffers.
 *
 * Pre-allocates ONE large Buffer, partitions it into fixed-size slots.
 * acquire/release are O(1). Exhaustion returns null (backpressure).
 *
 * Inspired by layra-article/src/buffer-pool.js.
 */

export interface BufferPoolItem {
  buf: Buffer;
  index: number;
}

export class BufferPool {
  private readonly buffer: Buffer;
  private readonly freeList: number[];

  constructor(
    public readonly slotSize: number,
    public readonly poolSize: number
  ) {
    if (slotSize <= 0 || !Number.isInteger(slotSize)) {
      throw new TypeError('slotSize must be a positive integer');
    }
    if (poolSize <= 0 || !Number.isInteger(poolSize)) {
      throw new TypeError('poolSize must be a positive integer');
    }

    this.buffer = Buffer.allocUnsafe(slotSize * poolSize);
    this.freeList = new Array(poolSize);
    for (let i = 0; i < poolSize; i++) {
      this.freeList[i] = i;
    }
  }

  /** Acquire a buffer slot. Returns null if pool exhausted. */
  acquire(): BufferPoolItem | null {
    if (this.freeList.length === 0) return null;
    const index = this.freeList.pop()!;
    const offset = index * this.slotSize;
    return {
      buf: this.buffer.subarray(offset, offset + this.slotSize),
      index,
    };
  }

  /** Return a buffer slot to the pool. */
  release(item: BufferPoolItem | null): void {
    if (item && typeof item.index === 'number') {
      this.freeList.push(item.index);
    }
  }

  /** Number of available slots. */
  available(): number {
    return this.freeList.length;
  }

  /** True if pool is empty. */
  get isExhausted(): boolean {
    return this.freeList.length === 0;
  }
}
