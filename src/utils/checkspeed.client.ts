"use client";

import { average, averageWithoutColdStart, median, removeOutliers } from './stats';
import { logger } from './logger';

export { average, averageWithoutColdStart, median, removeOutliers };

// Оптимизированные настройки: меньше запросов, больше размеры файлов
// Было: [0.5, 1, 2, 3] × 3 измерения = 12 запросов на download/upload
// Стало: [2, 5] × 2 измерения = 4 запроса на download/upload
const FILE_SIZES_MB = [2, 5] as const;
const MEASUREMENTS_PER_SIZE = 2;
// Уменьшено с 1 до 0, так как при 2 измерениях пропуск первого оставляет только 1 значение
// Это обеспечивает использование обоих измерений для более точного результата
const COLD_START_SKIP = 0;

export const DOWNLOAD_ENDPOINT = '/api/download';
export const UPLOAD_ENDPOINT = '/api/upload';
export const PING_ENDPOINT = '/api/ping';

// Уменьшено с 10 до 8 для оптимизации
const PING_ATTEMPTS = 8;
const PING_PRECISION = 1;

export const bytesToMbps = (bytesTransferred: number, durationSeconds: number): number => {
  if (durationSeconds <= 0 || bytesTransferred <= 0) {
    return 0;
  }

  const megabits = (bytesTransferred * 8) / (1024 * 1024);
  return megabits / durationSeconds;
};

const buildDownloadUrl = (sizeMb: number) => `${DOWNLOAD_ENDPOINT}?size=${sizeMb}`;

const megabytesToBytes = (sizeMb: number) => Math.round(sizeMb * 1024 * 1024);

export const createUploadPayload = (sizeMb: number): Uint8Array =>
  new Uint8Array(megabytesToBytes(sizeMb));

const measureDownloadOnce = async (sizeMb: number): Promise<number> => {
  const requestStart = performance.now();
  logger.debug('download', `Начало измерения download для размера ${sizeMb} МБ`);

  const response = await fetch(buildDownloadUrl(sizeMb));
  const ttfb = performance.now() - requestStart; // Time To First Byte

  if (!response.ok) {
    // 429 (Too Many Requests) - это ожидаемое поведение rate limiting, не ошибка
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 'неизвестно';
      logger.warn('download', `Rate limit превышен (429). Retry-After: ${retryAfter} сек`);
      return 0;
    }
    logger.error('download', `Запрос завершился с ошибкой: ${response.status}`);
    throw new Error(`Download request failed with status ${response.status}`);
  }
  if (!response.body) {
    logger.error('download', 'Поток данных недоступен');
    throw new Error('Readable stream is not available for the download response.');
  }

  logger.debug('download', `TTFB: ${ttfb.toFixed(2)} мс`);

  const reader = response.body.getReader();
  let bytesTransferred = 0;
  let firstChunkTime: number | null = null;
  let lastChunkTime = requestStart;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    const chunkTime = performance.now();
    if (firstChunkTime === null) {
      firstChunkTime = chunkTime;
      logger.debug('download', `Первый чанк получен через ${(chunkTime - requestStart).toFixed(2)} мс`);
    }
    lastChunkTime = chunkTime;
    bytesTransferred += value.byteLength;
  }

  const totalDuration = lastChunkTime - requestStart;
  const transferDuration = firstChunkTime ? lastChunkTime - firstChunkTime : totalDuration;

  if (totalDuration <= 0 || bytesTransferred === 0) {
    logger.warn('download', `Некорректные данные: duration=${totalDuration}ms, bytes=${bytesTransferred}`);
    return 0;
  }

  // Используем общее время от начала запроса до конца передачи
  const durationSeconds = totalDuration / 1000;
  const speed = bytesToMbps(bytesTransferred, durationSeconds);

  logger.info('download', `Измерение завершено`, {
    sizeMb,
    bytesTransferred,
    totalDurationMs: totalDuration.toFixed(2),
    transferDurationMs: transferDuration.toFixed(2),
    ttfbMs: ttfb.toFixed(2),
    speedMbps: speed.toFixed(2)
  });

  // Валидация: скорость не должна быть нереалистично высокой (>100 Гбит/с)
  const MAX_REALISTIC_SPEED_MBPS = 100000;
  if (speed > MAX_REALISTIC_SPEED_MBPS) {
    logger.warn('download', `Подозрительно высокая скорость: ${speed.toFixed(2)} Мбит/с`);
  }

  return speed;
};

/**
 * Выполняет измерения для одного размера файла параллельно
 */
const measureDownloadForSize = async (sizeMb: number): Promise<number> => {
  logger.debug('download', `Тестирование размера ${sizeMb} МБ`);
  const measurements: number[] = [];
  
  // Запускаем все измерения для этого размера параллельно
  const measurementPromises = Array.from({ length: MEASUREMENTS_PER_SIZE }, (_, attempt) =>
    measureDownloadOnce(sizeMb)
      .then((speed) => {
        logger.debug('download', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE}: ${speed.toFixed(2)} Мбит/с`);
        return speed;
      })
      .catch((error) => {
        logger.warn('download', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE} завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`);
        return 0; // Возвращаем 0 для неудачных попыток
      })
  );
  
  const results = await Promise.all(measurementPromises);
  measurements.push(...results.filter(speed => speed > 0));
  
  // Если нет успешных измерений для этого размера, возвращаем 0
  if (measurements.length === 0) {
    logger.warn('download', `Нет успешных измерений для размера ${sizeMb} МБ, пропускаем`);
    return 0;
  }
  
  const cleanedMeasurements = removeOutliers(measurements);
  const avgSpeed = averageWithoutColdStart(cleanedMeasurements, COLD_START_SKIP);
  logger.debug('download', `Средняя скорость для ${sizeMb} МБ: ${avgSpeed.toFixed(2)} Мбит/с`);
  
  return avgSpeed;
};

export const testDownloadSpeed = async (): Promise<number> => {
  logger.info('download', 'Начало тестирования download скорости');
  
  // Запускаем измерения для всех размеров файлов параллельно
  const sizePromises = FILE_SIZES_MB.map(sizeMb => measureDownloadForSize(sizeMb));
  const aggregatedSpeeds = (await Promise.all(sizePromises)).filter(speed => speed > 0);

  // Если нет успешных измерений вообще, возвращаем 0
  if (aggregatedSpeeds.length === 0) {
    logger.error('download', 'Нет успешных измерений download скорости');
    return 0;
  }

  // Если нет успешных измерений вообще, возвращаем 0
  if (aggregatedSpeeds.length === 0) {
    logger.error('download', 'Нет успешных измерений download скорости');
    return 0;
  }

  // Если нет успешных измерений вообще, возвращаем 0
  if (aggregatedSpeeds.length === 0) {
    logger.error('download', 'Нет успешных измерений download скорости');
    return 0;
  }

  const cleanedAggregated = removeOutliers(aggregatedSpeeds);
  const overallAverage = average(cleanedAggregated);
  const rounded = Math.round(overallAverage);

  logger.info('download', `Итоговая скорость: ${rounded} Мбит/с (среднее: ${overallAverage.toFixed(2)})`);

  return rounded;
};

const measureUploadOnce = (sizeMb: number): Promise<number> =>
  new Promise((resolve, reject) => {
    const requestStart = performance.now();
    logger.debug('upload', `Начало измерения upload для размера ${sizeMb} МБ`);

    const payload = createUploadPayload(sizeMb);
    const xhr = new XMLHttpRequest();

    let startTime: number | null = null;
    let endTime: number | null = null;
    let progressStartTime: number | null = null;

    const handleLoadStart = () => {
      startTime = performance.now();
      logger.debug('upload', `Upload начат через ${(startTime - requestStart).toFixed(2)} мс после создания запроса`);
    };

    const handleProgress = (event: ProgressEvent) => {
      if (progressStartTime === null && event.loaded > 0) {
        progressStartTime = performance.now();
        logger.debug('upload', `Первый байт отправлен через ${(progressStartTime - (startTime ?? requestStart)).toFixed(2)} мс`);
      }
    };

    const handleLoadEnd = () => {
      endTime = performance.now();
      logger.debug('upload', `Upload завершён, общее время: ${endTime - (startTime ?? requestStart)} мс`);
    };

    // Объявляем обработчики, которые вызывают cleanup
    let handleUploadError: () => void;
    let handleUploadAbort: () => void;
    let handleRequestError: () => void;
    let handleLoad: () => void;
    let handleTimeout: () => void;

    // Определяем cleanup перед обработчиками, которые её используют
    // Используем function declaration для hoisting
    function cleanup() {
      xhr.upload.removeEventListener('loadstart', handleLoadStart);
      xhr.upload.removeEventListener('loadend', handleLoadEnd);
      xhr.upload.removeEventListener('progress', handleProgress);
      xhr.upload.removeEventListener('error', handleUploadError);
      xhr.upload.removeEventListener('abort', handleUploadAbort);
      xhr.removeEventListener('error', handleRequestError);
      xhr.removeEventListener('timeout', handleTimeout);
      xhr.removeEventListener('load', handleLoad);
    }

    handleUploadError = () => {
      cleanup();
      logger.error('upload', 'Ошибка при передаче данных');
      reject(new Error('Upload failed during transmission'));
    };

    handleUploadAbort = () => {
      cleanup();
      logger.warn('upload', 'Upload отменён');
      reject(new Error('Upload aborted'));
    };

    handleRequestError = () => {
      cleanup();
      // 429 (Too Many Requests) - это ожидаемое поведение rate limiting, не ошибка
      if (xhr.status === 429) {
        const retryAfter = xhr.getResponseHeader('Retry-After') || 'неизвестно';
        logger.warn('upload', `Rate limit превышен (429). Retry-After: ${retryAfter} сек`);
        resolve(0);
        return;
      }
      // Статус 0 обычно означает таймаут или сетевая ошибка
      if (xhr.status === 0) {
        logger.error('upload', 'Запрос завершился с таймаутом или сетевой ошибкой');
        reject(new Error('Upload request timed out or network error'));
      } else {
        logger.error('upload', `Ошибка запроса: статус ${xhr.status}`);
        reject(new Error(`Upload request failed with status ${xhr.status}`));
      }
    };

    handleLoad = () => {
      cleanup();
      // Проверяем статус ответа - 429 может прийти через событие load
      if (xhr.status === 429) {
        const retryAfter = xhr.getResponseHeader('Retry-After') || 'неизвестно';
        logger.warn('upload', `Rate limit превышен (429). Retry-After: ${retryAfter} сек`);
        resolve(0);
        return;
      }
      if (startTime === null || endTime === null || endTime <= startTime) {
        logger.warn('upload', 'Некорректные временные метки');
        resolve(0);
        return;
      }
      const durationSeconds = (endTime - startTime) / 1000;
      const speed = bytesToMbps(payload.byteLength, durationSeconds);

      logger.info('upload', `Измерение завершено`, {
        sizeMb,
        bytesTransferred: payload.byteLength,
        durationMs: (endTime - startTime).toFixed(2),
        speedMbps: speed.toFixed(2)
      });

      // Валидация скорости
      const MAX_REALISTIC_SPEED_MBPS = 100000;
      if (speed > MAX_REALISTIC_SPEED_MBPS) {
        logger.warn('upload', `Подозрительно высокая скорость: ${speed.toFixed(2)} Мбит/с`);
      }

      resolve(speed);
    };

    handleTimeout = () => {
      cleanup();
      logger.error('upload', 'Запрос превысил таймаут (30 секунд)');
      reject(new Error('Upload request timed out after 30 seconds'));
    };

    xhr.open('POST', UPLOAD_ENDPOINT);
    xhr.responseType = 'json';
    // Уменьшаем таймаут до 30 секунд для serverless функций (Vercel имеет лимиты)
    // Для файлов до 3 МБ это должно быть достаточно
    xhr.timeout = 30000; // 30 секунд таймаут

    xhr.upload.addEventListener('loadstart', handleLoadStart);
    xhr.upload.addEventListener('loadend', handleLoadEnd);
    xhr.upload.addEventListener('progress', handleProgress);
    xhr.upload.addEventListener('error', handleUploadError);
    xhr.upload.addEventListener('abort', handleUploadAbort);
    xhr.addEventListener('error', handleRequestError);
    xhr.addEventListener('timeout', handleTimeout);
    xhr.addEventListener('load', handleLoad);

    const bodyView = payload.slice();
    xhr.send(bodyView.buffer);
  });

/**
 * Выполняет измерения для одного размера файла параллельно
 */
const measureUploadForSize = async (sizeMb: number): Promise<number> => {
  logger.debug('upload', `Тестирование размера ${sizeMb} МБ`);
  const measurements: number[] = [];
  
  // Запускаем все измерения для этого размера параллельно
  const measurementPromises = Array.from({ length: MEASUREMENTS_PER_SIZE }, (_, attempt) =>
    measureUploadOnce(sizeMb)
      .then((speed) => {
        logger.debug('upload', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE}: ${speed.toFixed(2)} Мбит/с`);
        return speed;
      })
      .catch((error) => {
        logger.warn('upload', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE} завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`);
        return 0; // Возвращаем 0 для неудачных попыток
      })
  );
  
  const results = await Promise.all(measurementPromises);
  measurements.push(...results.filter(speed => speed > 0));
  
  // Если нет успешных измерений для этого размера, возвращаем 0
  if (measurements.length === 0) {
    logger.warn('upload', `Нет успешных измерений для размера ${sizeMb} МБ, пропускаем`);
    return 0;
  }
  
  const cleanedMeasurements = removeOutliers(measurements);
  const avgSpeed = averageWithoutColdStart(cleanedMeasurements, COLD_START_SKIP);
  logger.debug('upload', `Средняя скорость для ${sizeMb} МБ: ${avgSpeed.toFixed(2)} Мбит/с`);
  
  return avgSpeed;
};

export const testUploadSpeed = async (): Promise<number> => {
  logger.info('upload', 'Начало тестирования upload скорости');
  
  // Запускаем измерения для всех размеров файлов параллельно
  const sizePromises = FILE_SIZES_MB.map(sizeMb => measureUploadForSize(sizeMb));
  const aggregatedSpeeds = (await Promise.all(sizePromises)).filter(speed => speed > 0);

  // Если нет успешных измерений вообще, возвращаем 0
  if (aggregatedSpeeds.length === 0) {
    logger.error('upload', 'Нет успешных измерений upload скорости');
    return 0;
  }

  // Если нет успешных измерений вообще, возвращаем 0
  if (aggregatedSpeeds.length === 0) {
    logger.error('upload', 'Нет успешных измерений upload скорости');
    return 0;
  }

  // Если нет успешных измерений вообще, возвращаем 0
  if (aggregatedSpeeds.length === 0) {
    logger.error('upload', 'Нет успешных измерений upload скорости');
    return 0;
  }

  const cleanedAggregated = removeOutliers(aggregatedSpeeds);
  const overallAverage = average(cleanedAggregated);
  const rounded = Math.round(overallAverage);

  logger.info('upload', `Итоговая скорость: ${rounded} Мбит/с (среднее: ${overallAverage.toFixed(2)})`);

  return rounded;
};

const measurePingOnce = async (): Promise<number> => {
  const requestStart = performance.now();
  const response = await fetch(PING_ENDPOINT, {
    method: 'HEAD',
    cache: 'no-store'
  });

  if (!response.ok) {
    // 429 (Too Many Requests) - это ожидаемое поведение rate limiting, не ошибка
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 'неизвестно';
      logger.warn('ping', `Rate limit превышен (429). Retry-After: ${retryAfter} сек`);
      return 0;
    }
    logger.error('ping', `Запрос завершился с ошибкой: ${response.status}`);
    throw new Error(`Ping request failed with status ${response.status}`);
  }

  const requestEnd = performance.now();
  const latency = requestEnd - requestStart;

  // Валидация: пинг не должен быть отрицательным или нереалистично большим (>10 секунд)
  if (latency < 0 || latency > 10000) {
    logger.warn('ping', `Подозрительное значение пинга: ${latency.toFixed(2)} мс`);
  }

  return latency;
};

export async function testPing(): Promise<number> {
  logger.info('ping', 'Начало тестирования ping');
  const rawMeasurements: number[] = [];

  for (let attempt = 0; attempt < PING_ATTEMPTS; attempt += 1) {
    try {
      const latency = await measurePingOnce();
      rawMeasurements.push(latency);
      logger.debug('ping', `Попытка ${attempt + 1}/${PING_ATTEMPTS}: ${latency.toFixed(2)} мс`);
    } catch (error) {
      logger.warn('ping', `Попытка ${attempt + 1}/${PING_ATTEMPTS} завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`);
      // Пропускаем неудачные попытки, но продолжаем измерения
      // Если все попытки провалились, это будет обработано ниже
    }
  }

  // Если нет успешных измерений, возвращаем 0
  if (rawMeasurements.length === 0) {
    logger.error('ping', 'Нет успешных измерений ping');
    return 0;
  }

  logger.debug('ping', `Сырые измерения: ${rawMeasurements.map(v => v.toFixed(2)).join(', ')} мс`);

  const trimmedMeasurements =
    rawMeasurements.length > 2 ? rawMeasurements.slice(1, rawMeasurements.length - 1) : rawMeasurements;

  logger.debug('ping', `После обрезки: ${trimmedMeasurements.map(v => v.toFixed(2)).join(', ')} мс`);

  const cleanedMeasurements = removeOutliers(trimmedMeasurements);
  
  // Если после удаления выбросов не осталось измерений, возвращаем 0
  if (cleanedMeasurements.length === 0) {
    logger.error('ping', 'Нет валидных измерений ping после обработки');
    return 0;
  }
  
  logger.debug('ping', `После удаления выбросов: ${cleanedMeasurements.map(v => v.toFixed(2)).join(', ')} мс`);

  const representativeLatency = median(cleanedMeasurements);
  const rounded = Number(representativeLatency.toFixed(PING_PRECISION));

  logger.info('ping', `Итоговый пинг: ${rounded} мс (медиана: ${representativeLatency.toFixed(2)})`);

  return rounded;
}

/**
 * Интерфейс для результатов всех измерений
 */
export interface SpeedTestResults {
  download: number;
  upload: number;
  ping: number;
}

/**
 * Выполняет все измерения скорости параллельно
 * Download, Upload и Ping выполняются одновременно для сокращения общего времени измерения
 * 
 * @returns Promise с результатами всех измерений
 */
export async function testAllSpeeds(): Promise<SpeedTestResults> {
  logger.info('speedtest', 'Начало параллельного тестирования всех параметров скорости');
  const startTime = performance.now();

  // Запускаем все три теста параллельно
  const [download, upload, ping] = await Promise.all([
    testDownloadSpeed(),
    testUploadSpeed(),
    testPing()
  ]);

  const totalTime = performance.now() - startTime;
  logger.info('speedtest', `Все измерения завершены за ${(totalTime / 1000).toFixed(2)} секунд`, {
    download: `${download} Мбит/с`,
    upload: `${upload} Мбит/с`,
    ping: `${ping} мс`
  });

  return { download, upload, ping };
}

/**
 * Интерфейс для информации о сервере
 */
export interface ServerInfo {
  id: string;
  name: string;
  url: string;
  location?: string;
}

/**
 * Определяет ближайший сервер на основе ping
 * В текущей реализации возвращает локальный сервер
 * Подготовка к будущему расширению с несколькими серверами
 * 
 * @param servers - Список доступных серверов
 * @returns Promise с информацией о ближайшем сервере
 */
export async function findNearestServer(servers: ServerInfo[] = []): Promise<ServerInfo> {
  // Если серверы не предоставлены, используем локальный сервер по умолчанию
  if (servers.length === 0) {
    return {
      id: 'local',
      name: 'Локальный сервер',
      url: '',
      location: 'Локально'
    };
  }

  // Если только один сервер, возвращаем его
  if (servers.length === 1) {
    return servers[0];
  }

  logger.info('server', `Проверка ${servers.length} серверов для определения ближайшего`);

  // Измеряем ping для всех серверов параллельно
  const pingPromises = servers.map(async (server) => {
    try {
      const startTime = performance.now();
      const response = await fetch(`${server.url}${PING_ENDPOINT}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000) // Таймаут 5 секунд для каждого сервера
      });
      const endTime = performance.now();
      
      if (response.ok) {
        const latency = endTime - startTime;
        logger.debug('server', `Сервер ${server.name}: ${latency.toFixed(2)} мс`);
        return { server, latency };
      }
      return { server, latency: Infinity };
    } catch (error) {
      logger.warn('server', `Ошибка при проверке сервера ${server.name}: ${error instanceof Error ? error.message : String(error)}`);
      return { server, latency: Infinity };
    }
  });

  const results = await Promise.all(pingPromises);
  
  // Находим сервер с минимальным ping
  const nearest = results.reduce((best, current) => 
    current.latency < best.latency ? current : best
  );

  if (nearest.latency === Infinity) {
    logger.warn('server', 'Не удалось определить ближайший сервер, используем первый доступный');
    return servers[0];
  }

  logger.info('server', `Выбран ближайший сервер: ${nearest.server.name} (${nearest.latency.toFixed(2)} мс)`);
  return nearest.server;
}
