const ONE_MB_BYTES = 1024 * 1024;
const DEFAULT_POOL_LIMIT = 10;

export type SupportedBufferSizeMb = 0.5 | 1 | 2 | 5 | 10;

const SUPPORTED_SIZES_MB: SupportedBufferSizeMb[] = [0.5, 1, 2, 5, 10];

const megabytesToBytes = (sizeMb: number): number => Math.round(sizeMb * ONE_MB_BYTES);

export class BufferPool {
  private readonly limitPerSize: number;

  private readonly pools: Map<number, Buffer[]>;

  constructor(limitPerSize: number = DEFAULT_POOL_LIMIT) {
    this.limitPerSize = limitPerSize;
    this.pools = new Map();

    for (const sizeMb of SUPPORTED_SIZES_MB) {
      const sizeBytes = megabytesToBytes(sizeMb);
      this.pools.set(sizeBytes, []);
    }
  }

  /**
   * Возвращает буфер заданного размера в байтах. Если в пуле есть свободный
   * буфер — он будет переиспользован, иначе создаётся новый.
   */
  get(sizeBytes: number): Buffer {
    const pool = this.pools.get(sizeBytes);

    if (!pool) {
      // Для нестандартных размеров пока не создаём пул, а просто выделяем буфер.
      return Buffer.alloc(sizeBytes);
    }

    const existing = pool.pop();
    if (existing) {
      return existing;
    }

    return Buffer.alloc(sizeBytes);
  }

  /**
   * Возвращает буфер обратно в пул, если для этого размера пул ещё не заполнен.
   */
  release(buffer: Buffer): void {
    const sizeBytes = buffer.byteLength;
    const pool = this.pools.get(sizeBytes);

    if (!pool) {
      return;
    }

    if (pool.length >= this.limitPerSize) {
      return;
    }

    pool.push(buffer);
  }
}
