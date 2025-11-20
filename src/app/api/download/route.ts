import { NextRequest } from 'next/server';

const DEFAULT_SIZE_MB = 1;
const MIN_SIZE_MB = 0.5;
const MAX_SIZE_MB = 10;

const megabytesToBytes = (sizeMb: number) => Math.round(sizeMb * 1024 * 1024);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sizeParam = Number(url.searchParams.get('size'));
  const normalizedSizeMb = (() => {
    if (!Number.isFinite(sizeParam) || sizeParam <= 0) {
      return DEFAULT_SIZE_MB;
    }
    return Math.min(MAX_SIZE_MB, Math.max(MIN_SIZE_MB, sizeParam));
  })();

  const buffer = Buffer.alloc(megabytesToBytes(normalizedSizeMb), 'x');

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store'
    }
  });
}
