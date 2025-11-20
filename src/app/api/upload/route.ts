import { NextResponse } from 'next/server';

const MAX_ALLOWED_BYTES = 10 * 1024 * 1024; // 10 МБ

const readRequestSize = async (request: Request): Promise<number> => {
  if (!request.body) {
    return 0;
  }

  const reader = request.body.getReader();
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_ALLOWED_BYTES) {
      throw new Error('Payload exceeds allowed limit');
    }
  }

  return totalBytes;
};

export async function POST(request: Request) {
  try {
    const size = await readRequestSize(request);
    return NextResponse.json({ size });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
