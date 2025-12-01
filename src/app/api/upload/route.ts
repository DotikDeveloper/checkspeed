import { NextResponse } from 'next/server';

const MAX_ALLOWED_BYTES = 3 * 1024 * 1024; // 3 МБ

/**
 * Оптимизированное чтение размера запроса.
 * Читаем только первые чанки для проверки размера, затем отменяем чтение.
 */
const readRequestSize = async (request: Request): Promise<number> => {
  if (!request.body) {
    return 0;
  }

  const reader = request.body.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      
      // Если превышен лимит, отменяем чтение и возвращаем ошибку
      if (totalBytes > MAX_ALLOWED_BYTES) {
        await reader.cancel();
        throw new Error('Payload exceeds allowed limit');
      }
    }
  } finally {
    // Убеждаемся, что reader закрыт
    try {
      await reader.cancel();
    } catch {
      // Игнорируем ошибки при отмене
    }
  }

  return totalBytes;
};

export async function POST(request: Request) {
  try {
    // Получаем Content-Length из заголовков, если доступен
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > MAX_ALLOWED_BYTES) {
        return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
      }
      // Если Content-Length доступен, используем его вместо чтения потока
      // Это значительно быстрее для больших файлов
      return NextResponse.json({ size });
    }

    // Если Content-Length недоступен, читаем поток (но это медленнее)
    const size = await readRequestSize(request);
    return NextResponse.json({ size });
  } catch (err) {
    console.error('Upload error:', err);
    if (err instanceof Error && err.message.includes('exceeds')) {
      return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
