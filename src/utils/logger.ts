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

// Версия приложения (можно переопределить через переменную окружения)
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.3.0';

class SpeedLogger {
  private enabled: boolean;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private versionLogged = false;

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

    // Выводим версию приложения при первом логировании
    if (!this.versionLogged) {
      const versionMessage = `CheckSpeed v${APP_VERSION} - логирование включено`;
      console.log(`%c${versionMessage}`, 'color: #4CAF50; font-weight: bold; font-size: 12px;');
      this.versionLogged = true;
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
