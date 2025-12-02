import { NextRequest, NextResponse } from 'next/server';

/**
 * Интерфейс для хранения информации о запросах с одного IP
 */
interface RateLimitEntry {
  count: number;
  resetTime: number; // Время в миллисекундах, когда счетчик сбросится
}

/**
 * In-memory хранилище для rate limiting
 * В production рекомендуется использовать Redis или другой внешний store
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Конфигурация rate limiting
 * Лимит установлен с учетом процесса измерения скорости:
 * - Download: 2 размера × 2 измерения = 4 запроса
 * - Upload: 2 размера × 2 измерения = 4 запроса
 * - Ping: 8 попыток = 8 запросов
 * Итого: ~16 запросов на один полный тест
 * С учетом 10 измерений подряд: 10 × 16 = 160 запросов
 * С запасом: 200 запросов в минуту
 */
const RATE_LIMIT_CONFIG = {
  maxRequests: 200, // Максимальное количество запросов (достаточно для 10 полных тестов)
  windowMs: 60 * 1000, // Окно времени в миллисекундах (1 минута)
  cleanupInterval: 5 * 60 * 1000 // Интервал очистки старых записей (5 минут)
};

/**
 * Получает IP адрес из запроса
 * Учитывает заголовки прокси (X-Forwarded-For, X-Real-IP)
 */
function getClientIp(request: NextRequest): string {
  // Проверяем заголовок X-Forwarded-For (используется прокси/CDN)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // X-Forwarded-For может содержать несколько IP через запятую
    // Первый IP - это оригинальный клиент
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    return ips[0] || 'unknown';
  }

  // Проверяем заголовок X-Real-IP
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // В serverless окружениях (Vercel) IP может быть недоступен напрямую
  // Используем 'unknown' как fallback, что будет означать общий лимит для всех без IP
  return 'unknown';
}

/**
 * Очищает старые записи из хранилища
 * Вызывается периодически для предотвращения утечки памяти
 */
function cleanupOldEntries(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Проверяет rate limit для IP адреса
 * @returns true если лимит не превышен, false если превышен
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  // Если записи нет или время окна истекло, создаем новую
  if (!entry || now > entry.resetTime) {
    const resetTime = now + RATE_LIMIT_CONFIG.windowMs;
    rateLimitStore.set(ip, {
      count: 1,
      resetTime
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_CONFIG.maxRequests - 1,
      resetTime
    };
  }

  // Если лимит превышен
  if (entry.count >= RATE_LIMIT_CONFIG.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime
    };
  }

  // Увеличиваем счетчик
  entry.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_CONFIG.maxRequests - entry.count,
    resetTime: entry.resetTime
  };
}

/**
 * Proxy для rate limiting
 * Применяется ко всем запросам, но проверяет только API endpoints
 * Важно: proxy не читает тело запроса, только проверяет заголовки для rate limiting
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Применяем rate limiting только к API endpoints
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Получаем IP адрес клиента
  const clientIp = getClientIp(request);

  // Проверяем rate limit
  const { allowed, remaining, resetTime } = checkRateLimit(clientIp);

  // Периодическая очистка старых записей (каждые 5 минут)
  if (Math.random() < 0.01) {
    // ~1% запросов запускают очистку
    cleanupOldEntries();
  }

  // Если лимит превышен, возвращаем 429
  if (!allowed) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter // Время в секундах до следующей попытки
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.maxRequests),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)) // Unix timestamp в секундах
        }
      }
    );
  }

  // Добавляем заголовки с информацией о rate limit
  // Важно: не читаем тело запроса в proxy, только проверяем заголовки для rate limiting
  // NextResponse.next() корректно передает запрос дальше, не трогая тело запроса
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_CONFIG.maxRequests));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));

  return response;
}

/**
 * Конфигурация matcher для proxy
 * Применяется только к API routes
 */
export const config = {
  matcher: '/api/:path*'
};
