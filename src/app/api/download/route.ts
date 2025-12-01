import { NextRequest } from 'next/server';
import { BufferPool } from '../utils/buffer-pool';

const DEFAULT_SIZE_MB = 1;
const MIN_SIZE_MB = 0.5;
const MAX_SIZE_MB = 10;

const ONE_MB_BYTES = 1024 * 1024;
const megabytesToBytes = (sizeMb: number) => Math.round(sizeMb * ONE_MB_BYTES);

// Глобальный пул буферов, который будет жить в рамках lifecycle функции.
const bufferPool = new BufferPool();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sizeParam = Number(url.searchParams.get('size'));
  const normalizedSizeMb = (() => {
    if (!Number.isFinite(sizeParam) || sizeParam <= 0) {
      return DEFAULT_SIZE_MB;
    }
    return Math.min(MAX_SIZE_MB, Math.max(MIN_SIZE_MB, sizeParam));
  })();

  const sizeBytes = megabytesToBytes(normalizedSizeMb);
  const buffer = bufferPool.get(sizeBytes);
  buffer.fill('x');

  // Создаём копию буфера для Response, чтобы избежать гонки данных при параллельных запросах.
  // Response не копирует содержимое, а использует ссылку, поэтому нужна явная копия.
  const bufferCopy = Buffer.from(buffer);
  bufferPool.release(buffer);

  const response = new Response(bufferCopy as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store'
    }
  });

  return response;
}
