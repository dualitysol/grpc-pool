/**
 * MessagePool Tests — zero allocation validation
 *
 * Run: npx tsx --expose-gc tests/message-pool.test.ts
 */

import { MessagePool } from '../src/pool/message-pool';

// ── Test Message Interface ────────────────────────────────────

interface TestMessage {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

function createTestMessage(): TestMessage {
  return { id: 0, name: '', email: '', active: false };
}

function resetTestMessage(msg: TestMessage): void {
  msg.id = 0;
  msg.name = '';
  msg.email = '';
  msg.active = false;
}

// ── Helpers ───────────────────────────────────────────────────

const gc: () => void = (global as any).gc || (() => {
  console.warn('  WARNING: Run with --expose-gc for accurate GC metrics');
});

function measureHeap(): number {
  gc(); gc();
  return process.memoryUsage().heapUsed;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.log(`  FAIL: ${message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('='.repeat(58));
console.log('  MessagePool — Zero-Allocation Tests');
console.log('='.repeat(58));

// ── TEST 1: Pool creation ─────────────────────────────────────
console.log('\nTEST 1: Pool creation');
{
  const pool = new MessagePool(createTestMessage, 100);
  assert(pool.available() === 100, 'pool has 100 items');
  assert(!pool.isExhausted, 'pool is not exhausted');

  for (let i = 0; i < 100; i++) {
    const item = pool.acquire();
    assert(item !== null, `item ${i} acquired`);
    assert(typeof item!.message.id === 'number', `item ${i} has id field`);
    pool.release(item);
  }
}

// ── TEST 2: Acquire/Release cycle ─────────────────────────────
console.log('\nTEST 2: Acquire/Release cycle');
{
  const pool = new MessagePool(createTestMessage, 10);

  const items: Array<ReturnType<typeof pool.acquire>> = [];
  for (let i = 0; i < 10; i++) {
    const item = pool.acquire();
    assert(item !== null, `acquire #${i} succeeded`);
    items.push(item);
  }
  assert(pool.available() === 0, 'pool empty after acquiring all');
  assert(pool.isExhausted, 'pool is exhausted');

  for (const item of items) {
    pool.release(item);
  }
  assert(pool.available() === 10, 'pool full after releasing all');
}

// ── TEST 3: Pool exhaustion returns null ──────────────────────
console.log('\nTEST 3: Pool exhaustion');
{
  const pool = new MessagePool(createTestMessage, 5);
  for (let i = 0; i < 5; i++) pool.acquire();
  const exhausted = pool.acquire();
  assert(exhausted === null, 'acquire returns null when exhausted');
}

// ── TEST 4: Reset function works ──────────────────────────────
console.log('\nTEST 4: Reset function');
{
  const pool = new MessagePool(createTestMessage, 5, resetTestMessage);

  const item = pool.acquire()!;
  item.message.id = 42;
  item.message.name = 'John';
  pool.release(item);

  const recycled = pool.acquire()!;
  assert(recycled.message.id === 0, 'id reset to 0');
  assert(recycled.message.name === '', 'name reset to empty string');
  assert(recycled.message.active === false, 'active reset to false');
}

// ── TEST 5: Zero allocation under load ────────────────────────
console.log('\nTEST 5: Zero allocation under load');
{
  const pool = new MessagePool(createTestMessage, 1000);

  const startHeap = measureHeap();
  const iterations = 100000;

  for (let i = 0; i < iterations; i++) {
    const item = pool.acquire()!;
    item.message.id = i;
    item.message.name = 'User' + i;
    pool.release(item);
  }

  const endHeap = measureHeap();
  const heapDelta = endHeap - startHeap;
  const allocPerOp = heapDelta / iterations;

  console.log('  Iterations: ' + iterations);
  console.log('  Heap delta: ' + heapDelta + ' bytes');
  console.log('  Alloc/op:   ' + allocPerOp.toFixed(2) + ' bytes');

  assert(allocPerOp < 10, 'Alloc/op < 10 bytes (got ' + allocPerOp.toFixed(2) + ')');
}

// ── Summary ───────────────────────────────────────────────────
console.log('');
console.log('='.repeat(58));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(58));
console.log('');

process.exit(failed > 0 ? 1 : 0);
