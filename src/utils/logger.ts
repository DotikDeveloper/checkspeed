/**
 * Утилита для логирования процесса измерения скорости интернета.
 * Логирование можно включить через URL параметр ?debug=true или переменную окружения.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

class SpeedLogger {
  private enabled: boolean;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  constructor() {
    // Включаем логирование если:
    // 1. Есть параметр ?debug=true в URL
    // 2. Или переменная окружения NEXT_PUBLIC_DEBUG=true
    // 3. Или мы на localhost (только для клиентской части)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      this.enabled =
        urlParams.get('debug') === 'true' ||
        process.env.NEXT_PUBLIC_DEBUG === 'true' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
    } else {
      // На сервере включаем если есть переменная окружения
      this.enabled = process.env.DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === 'true';
    }
  }

  private log(level: LogLevel, category: string, message: string, data?: unknown): void {
    if (!this.enabled) {
      return;
    }

    const entry: LogEntry = {
      timestamp: performance.now(),
      level,
      category,
      message,
      data
    };

    this.logs.push(entry);

    // Ограничиваем размер массива логов
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Выводим в консоль
    const prefix = `[${category}]`;
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${prefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage, data || '');
        break;
      case 'warn':
        console.warn(logMessage, data || '');
        break;
      case 'debug':
        console.debug(logMessage, data || '');
        break;
      default:
        console.log(logMessage, data || '');
    }
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.log('error', category, message, data);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log('debug', category, message, data);
  }

  /**
   * Получить все логи для отладки
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Очистить логи
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Экспортировать логи в JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Проверить, включено ли логирование
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Создаём глобальный экземпляр логгера
export const logger = new SpeedLogger();
