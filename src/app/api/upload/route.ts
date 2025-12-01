import { NextResponse } from 'next/server';

const MAX_ALLOWED_BYTES = 3 * 1024 * 1024; // 3 МБ

/**
 * Потребляет тело запроса полностью, чтобы избежать проблем в serverless окружениях.
 * Не читает данные, только потребляет поток.
 */
const consumeRequestBody = async (request: Request): Promise<void> => {
  if (!request.body) {
    return;
  }

  const reader = request.body.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Игнорируем ошибки при отмене
    }
  }
};

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
      
      // Валидация: проверяем, что Content-Length является валидным числом
      if (isNaN(size) || size < 0) {
        // Если Content-Length невалиден, потребляем тело и возвращаем ошибку
        // Ошибки от consumeRequestBody не должны влиять на статус-код ответа
        try {
          await consumeRequestBody(request);
        } catch {
          // Игнорируем ошибки при потреблении тела, но все равно возвращаем правильный статус
        }
        return NextResponse.json({ error: 'Invalid Content-Length header' }, { status: 400 });
      }
      
      if (size > MAX_ALLOWED_BYTES) {
        // Потребляем тело запроса перед возвратом ошибки
        // Ошибки от consumeRequestBody не должны влиять на статус-код ответа
        try {
          await consumeRequestBody(request);
        } catch {
          // Игнорируем ошибки при потреблении тела, но все равно возвращаем правильный статус
        }
        return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
      }
      
      // Если Content-Length доступен и валиден, используем его вместо чтения потока
      // Но все равно потребляем тело запроса, чтобы избежать проблем в serverless окружениях
      try {
        await consumeRequestBody(request);
      } catch {
        // Игнорируем ошибки при потреблении тела, но продолжаем выполнение
      }
      return NextResponse.json({ size });
    }

    // Если Content-Length недоступен, читаем поток (но это медленнее)
    const size = await readRequestSize(request);
    return NextResponse.json({ size });
  } catch (err) {
    console.error('Upload error:', err);
    // Пытаемся потреблять тело запроса даже при ошибке
    try {
      await consumeRequestBody(request);
    } catch {
      // Игнорируем ошибки при потреблении тела
    }
    
    if (err instanceof Error && err.message.includes('exceeds')) {
      return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
