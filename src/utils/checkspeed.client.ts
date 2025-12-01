"use client";

import { average, averageWithoutColdStart, median, removeOutliers } from './stats';
import { logger } from './logger';

export { average, averageWithoutColdStart, median, removeOutliers };

const FILE_SIZES_MB = [0.5, 1, 2, 3] as const;
const MEASUREMENTS_PER_SIZE = 3;
const COLD_START_SKIP = 1;

export const DOWNLOAD_ENDPOINT = '/api/download';
export const UPLOAD_ENDPOINT = '/api/upload';
export const PING_ENDPOINT = '/api/ping';

const PING_ATTEMPTS = 10;
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

export const testDownloadSpeed = async (): Promise<number> => {
  logger.info('download', 'Начало тестирования download скорости');
  const aggregatedSpeeds: number[] = [];

  for (const sizeMb of FILE_SIZES_MB) {
    logger.debug('download', `Тестирование размера ${sizeMb} МБ`);
    const measurements: number[] = [];
    for (let attempt = 0; attempt < MEASUREMENTS_PER_SIZE; attempt += 1) {
      try {
        const speed = await measureDownloadOnce(sizeMb);
        measurements.push(speed);
        logger.debug('download', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE}: ${speed.toFixed(2)} Мбит/с`);
      } catch (error) {
        logger.warn('download', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE} завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`);
        // Пропускаем неудачные попытки, но продолжаем измерения
        // Если все попытки провалились, это будет обработано ниже
      }
    }
    
    // Если нет успешных измерений для этого размера, пропускаем его
    if (measurements.length === 0) {
      logger.warn('download', `Нет успешных измерений для размера ${sizeMb} МБ, пропускаем`);
      continue;
    }
    
    const cleanedMeasurements = removeOutliers(measurements);
    const avgSpeed = averageWithoutColdStart(cleanedMeasurements, COLD_START_SKIP);
    aggregatedSpeeds.push(avgSpeed);
    logger.debug('download', `Средняя скорость для ${sizeMb} МБ: ${avgSpeed.toFixed(2)} Мбит/с`);
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

    const handleUploadError = () => {
      cleanup();
      logger.error('upload', 'Ошибка при передаче данных');
      reject(new Error('Upload failed during transmission'));
    };

    const handleUploadAbort = () => {
      cleanup();
      logger.warn('upload', 'Upload отменён');
      reject(new Error('Upload aborted'));
    };

    const handleRequestError = () => {
      cleanup();
      // Статус 0 обычно означает таймаут или сетевая ошибка
      if (xhr.status === 0) {
        logger.error('upload', 'Запрос завершился с таймаутом или сетевой ошибкой');
        reject(new Error('Upload request timed out or network error'));
      } else {
        logger.error('upload', `Ошибка запроса: статус ${xhr.status}`);
        reject(new Error(`Upload request failed with status ${xhr.status}`));
      }
    };

    const handleLoad = () => {
      cleanup();
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

    const cleanup = () => {
      xhr.upload.removeEventListener('loadstart', handleLoadStart);
      xhr.upload.removeEventListener('loadend', handleLoadEnd);
      xhr.upload.removeEventListener('progress', handleProgress);
      xhr.upload.removeEventListener('error', handleUploadError);
      xhr.upload.removeEventListener('abort', handleUploadAbort);
      xhr.removeEventListener('error', handleRequestError);
      xhr.removeEventListener('timeout', handleTimeout);
      xhr.removeEventListener('load', handleLoad);
    };

    const handleTimeout = () => {
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

export const testUploadSpeed = async (): Promise<number> => {
  logger.info('upload', 'Начало тестирования upload скорости');
  const aggregatedSpeeds: number[] = [];

  for (const sizeMb of FILE_SIZES_MB) {
    logger.debug('upload', `Тестирование размера ${sizeMb} МБ`);
    const measurements: number[] = [];
    for (let attempt = 0; attempt < MEASUREMENTS_PER_SIZE; attempt += 1) {
      try {
        const speed = await measureUploadOnce(sizeMb);
        measurements.push(speed);
        logger.debug('upload', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE}: ${speed.toFixed(2)} Мбит/с`);
      } catch (error) {
        logger.warn('upload', `Попытка ${attempt + 1}/${MEASUREMENTS_PER_SIZE} завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`);
        // Пропускаем неудачные попытки, но продолжаем измерения
        // Если все попытки провалились, это будет обработано ниже
      }
    }
    
    // Если нет успешных измерений для этого размера, пропускаем его
    if (measurements.length === 0) {
      logger.warn('upload', `Нет успешных измерений для размера ${sizeMb} МБ, пропускаем`);
      continue;
    }
    
    const cleanedMeasurements = removeOutliers(measurements);
    const avgSpeed = averageWithoutColdStart(cleanedMeasurements, COLD_START_SKIP);
    aggregatedSpeeds.push(avgSpeed);
    logger.debug('upload', `Средняя скорость для ${sizeMb} МБ: ${avgSpeed.toFixed(2)} Мбит/с`);
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
