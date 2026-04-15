import { NextResponse } from 'next/server';

const MAX_ALLOWED_BYTES = 5 * 1024 * 1024; // 5 МБ (соответствует максимальному размеру файла в тестах)

/**
 * Потребляет тело запроса полностью, чтобы избежать проблем в serverless окружениях.
 * Не читает данные, только потребляет поток.
 * Важно: не отменяем reader, чтобы не блокировать тело запроса для других обработчиков.
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
      
      // Если превышен лимит, продолжаем чтение до конца для корректного завершения потока
      if (totalBytes > MAX_ALLOWED_BYTES) {
        while (true) {
          const { done: isDone } = await reader.read();
          if (isDone) {
            break;
          }
        }
        throw new Error('Payload exceeds allowed limit');
      }
    }
  } catch (err) {
    // Если это наша ошибка о превышении лимита, пробрасываем её дальше
    if (err instanceof Error && err.message.includes('exceeds')) {
      throw err;
    }
    // Для других ошибок пробрасываем наверх
    throw err;
  }

  return totalBytes;
};

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length');
    let declaredSize: number | null = null;

    if (contentLength) {
      const parsedSize = parseInt(contentLength, 10);
      if (Number.isNaN(parsedSize) || parsedSize < 0) {
        return NextResponse.json({ error: 'Invalid Content-Length header' }, { status: 400 });
      }
      if (parsedSize > MAX_ALLOWED_BYTES) {
        return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
      }
      declaredSize = parsedSize;
    }

    // Всегда считаем фактический размер тела запроса.
    // Это защищает от некорректного Content-Length и даёт точное измерение upload.
    const actualSize = await readRequestSize(request);

    if (declaredSize !== null && declaredSize !== actualSize) {
      return NextResponse.json({ error: 'Content-Length does not match payload size' }, { status: 400 });
    }

    return NextResponse.json({ size: actualSize });
  } catch (err) {
    if (err instanceof Error && err.message.includes('exceeds')) {
      return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
    }
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
