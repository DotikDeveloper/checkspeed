import { NextResponse } from 'next/server';

const MAX_ALLOWED_BYTES = 5 * 1024 * 1024; // 5 МБ (соответствует максимальному размеру файла в тестах)

/**
 * Потребляет тело запроса полностью, чтобы избежать проблем в serverless окружениях.
 * Не читает данные, только потребляет поток.
 * Важно: не отменяем reader, чтобы не блокировать тело запроса для других обработчиков.
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
  } catch {
    // Игнорируем ошибки при чтении
  }
  // Не отменяем reader, чтобы не блокировать тело запроса
  // Reader автоматически закроется при завершении чтения
};

/**
 * Оптимизированное чтение размера запроса.
 * Читаем поток до конца для проверки размера.
 * Важно: не отменяем reader, чтобы не блокировать тело запроса.
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
        // Продолжаем чтение до конца, чтобы не блокировать поток
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
    // Для других ошибок просто возвращаем текущий размер
  }
  // Reader автоматически закроется при завершении чтения

  return totalBytes;
};

export async function POST(request: Request) {
  // Клонируем запрос для безопасного чтения тела
  // Это необходимо для предотвращения ошибки "Response body object should not be disturbed or locked"
  // при параллельном выполнении нескольких запросов
  let requestToRead = request;
  try {
    // Пытаемся клонировать запрос для безопасного чтения
    // Если клонирование не удалось (тело уже прочитано), используем оригинальный запрос
    try {
      requestToRead = request.clone();
    } catch {
      // Если клонирование не удалось, используем оригинальный запрос
      requestToRead = request;
    }
  } catch {
    // В случае ошибки используем оригинальный запрос
    requestToRead = request;
  }

  try {
    // Получаем Content-Length из заголовков, если доступен
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      
      // Валидация: проверяем, что Content-Length является валидным числом
      if (isNaN(size) || size < 0) {
        // Если Content-Length невалиден, потребляем тело и возвращаем ошибку
        try {
          await consumeRequestBody(requestToRead);
        } catch {
          // Игнорируем ошибки при потреблении тела
        }
        return NextResponse.json({ error: 'Invalid Content-Length header' }, { status: 400 });
      }
      
      if (size > MAX_ALLOWED_BYTES) {
        // Потребляем тело запроса перед возвратом ошибки
        try {
          await consumeRequestBody(requestToRead);
        } catch {
          // Игнорируем ошибки при потреблении тела
        }
        return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
      }
      
      // Если Content-Length доступен и валиден, используем его вместо чтения потока
      // Потребляем тело запроса, чтобы избежать проблем в serverless окружениях
      try {
        await consumeRequestBody(requestToRead);
      } catch {
        // Игнорируем ошибки при потреблении тела
      }
      return NextResponse.json({ size });
    }

    // Если Content-Length недоступен, читаем поток (но это медленнее)
    const size = await readRequestSize(requestToRead);
    return NextResponse.json({ size });
  } catch (err) {
    console.error('Upload error:', err);
    
    // Пытаемся потреблять тело запроса даже при ошибке
    try {
      await consumeRequestBody(requestToRead);
    } catch {
      // Игнорируем ошибки при потреблении тела
    }
    
    if (err instanceof Error && err.message.includes('exceeds')) {
      return NextResponse.json({ error: 'Payload exceeds allowed limit' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
