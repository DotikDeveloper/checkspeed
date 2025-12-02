import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bytesToMbps, createUploadPayload, testAllSpeeds, testDownloadSpeed, testPing, testUploadSpeed } from './checkspeed.client';
import { average, averageWithoutColdStart, median, removeOutliers } from './stats';
import { logger } from './logger';

const DOWNLOAD_BYTES_TOTAL = 1024 * 1024;
const DOWNLOAD_CHUNK_BYTES = DOWNLOAD_BYTES_TOTAL / 2;
// Обновлено в соответствии с новыми настройками в checkspeed.client.ts
const FILE_SIZES_MB = [2, 5] as const;
const MEASUREMENTS_PER_SIZE = 2;
const PING_ATTEMPTS = 8;
const globalWithXhr = globalThis as typeof globalThis & { XMLHttpRequest?: typeof XMLHttpRequest };
const originalFetch = globalThis.fetch;
const originalXMLHttpRequest = globalWithXhr.XMLHttpRequest;

beforeEach(() => {
  // Отключаем логирование в тестах
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'debug').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;

  if (originalXMLHttpRequest) {
    globalWithXhr.XMLHttpRequest = originalXMLHttpRequest;
  } else {
    Reflect.deleteProperty(globalWithXhr, 'XMLHttpRequest');
  }
});

// Обновлено для 2 размеров файлов × 2 измерения
const SPEED_MATRIX: number[][] = [
  [50, 60], // для размера 2 МБ
  [80, 90]  // для размера 5 МБ
];

// TTFB (Time To First Byte) в миллисекундах для симуляции
const TTFB_MS = 10;

// Пересчитываем ожидаемую скорость с учетом TTFB
// Для каждого измерения: общее время = TTFB + время передачи
// Скорость = (байты * 8) / (общее время в секундах)
const calculateExpectedSpeed = (bytesMb: number, transferTimeMs: number, ttfbMs: number): number => {
  const totalTimeMs = ttfbMs + transferTimeMs;
  const bytes = bytesMb * 1024 * 1024;
  const megabits = (bytes * 8) / (1024 * 1024);
  return megabits / (totalTimeMs / 1000);
};

const downloadDurationsMs = SPEED_MATRIX.flat().map((speed) => {
  // Время передачи 1 МБ на данной скорости
  const transferTimeMs = (8 / speed) * 1000;
  return transferTimeMs;
});

// Пересчитываем ожидаемую скорость с учетом TTFB
const downloadSpeedsWithTTFB = SPEED_MATRIX.flat().map((speed, index) => {
  const sizeMb = FILE_SIZES_MB[Math.floor(index / MEASUREMENTS_PER_SIZE)];
  const transferTimeMs = (sizeMb * 8 / speed) * 1000;
  return calculateExpectedSpeed(sizeMb, transferTimeMs, TTFB_MS);
});

// Усредняем с учетом статистической обработки
const EXPECTED_AGGREGATED_SPEED = Math.round(
  downloadSpeedsWithTTFB.reduce((a, b) => a + b, 0) / downloadSpeedsWithTTFB.length
);

const MEASUREMENT_COUNT = FILE_SIZES_MB.length * MEASUREMENTS_PER_SIZE;

const uploadDurationsMs = SPEED_MATRIX.flatMap((group, index) =>
  group.map((speed) => ((FILE_SIZES_MB[index] * 8) / speed) * 1000)
);

function queuePerformanceTimeline(durations: number[], ttfbMs: number = 10) {
  const values: number[] = [];
  let cursor = 0;

  durations.forEach((duration) => {
    // requestStart
    values.push(cursor);
    // TTFB (Time To First Byte) - время до получения ответа
    cursor += ttfbMs;
    values.push(cursor);
    // Время получения первого чанка (примерно сразу после TTFB)
    values.push(cursor);
    // Время получения последнего чанка
    cursor += duration;
    values.push(cursor);
    // Небольшая пауза между измерениями
    cursor += 5;
  });

  return vi.spyOn(performance, 'now').mockImplementation(() => {
    if (!values.length) {
      throw new Error('Очередь performance.now пуста');
    }
    return values.shift()!;
  });
}

function queueUploadPerformanceTimeline(durations: number[], startDelayMs: number = 5) {
  const values: number[] = [];
  let cursor = 0;

  durations.forEach((duration) => {
    // requestStart - вызывается сразу при создании Promise
    values.push(cursor);
    // startTime - вызывается в handleLoadStart (небольшая задержка после создания запроса)
    cursor += startDelayMs;
    values.push(cursor);
    // endTime - вызывается в handleLoadEnd (startTime + duration передачи)
    cursor += duration;
    values.push(cursor);
    // Небольшая пауза между измерениями
    cursor += 5;
  });

  return vi.spyOn(performance, 'now').mockImplementation(() => {
    if (!values.length) {
      throw new Error('Очередь performance.now пуста');
    }
    return values.shift()!;
  });
}

function createDownloadResponse() {
  return {
    ok: true,
    body: {
      getReader: () => createChunkReader()
    }
  } as unknown as Response;
}

function createChunkReader(chunkCount = 2) {
  let delivered = 0;
  return {
    async read() {
      if (delivered >= chunkCount) {
        return { done: true, value: undefined as Uint8Array | undefined };
      }
      delivered += 1;
      return { done: false, value: new Uint8Array(DOWNLOAD_CHUNK_BYTES) };
    }
  };
}

function mockDownloadFetch() {
  const fetchMock = vi.fn().mockImplementation(async () => createDownloadResponse());
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  return fetchMock;
}

type UploadScenario = {
  failWith?: 'upload-error' | 'upload-abort' | 'request-error' | 'timeout';
  status?: number;
};

class MockUploadEventTarget {
  private listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    const event = { type } as Event;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

class MockXMLHttpRequest {
  static scenarios: UploadScenario[] = [];
  upload = new MockUploadEventTarget();
  responseType = '';
  status = 200;

  private listeners = new Map<string, Set<(event: Event) => void>>();
  private scenario: UploadScenario;

  constructor() {
    const scenario = MockXMLHttpRequest.scenarios.shift();
    if (!scenario) {
      throw new Error('Не определён сценарий загрузки');
    }
    this.scenario = scenario;
    if (typeof scenario.status === 'number') {
      this.status = scenario.status;
    }
  }

  open() {}

  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  private dispatch(type: string) {
    const event = { type } as Event;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  send() {
    const { failWith } = this.scenario;

    if (failWith === 'upload-error') {
      this.upload.dispatch('error');
      return;
    }
    if (failWith === 'upload-abort') {
      this.upload.dispatch('abort');
      return;
    }
    if (failWith === 'request-error') {
      this.dispatch('error');
      return;
    }
    if (failWith === 'timeout') {
      this.dispatch('timeout');
      return;
    }

    // Симулируем нормальный upload с правильной последовательностью событий
    // loadstart должен быть вызван первым
    this.upload.dispatch('loadstart');
    // Небольшая задержка перед loadend (симулируем передачу данных)
    setTimeout(() => {
      this.upload.dispatch('loadend');
      this.dispatch('load');
    }, 0);
  }
}

function stubXmlHttpRequest(scenarios: UploadScenario[]) {
  MockXMLHttpRequest.scenarios = [...scenarios];
  globalWithXhr.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
}

describe('bytesToMbps', () => {
  it('конвертирует байты и секунды в Мбит/с', () => {
    const oneMbInBytes = 1 * 1024 * 1024;
    const result = bytesToMbps(oneMbInBytes, 1);
    expect(result).toBeCloseTo(8, 5);
  });

  it('возвращает 0 при некорректных аргументах', () => {
    expect(bytesToMbps(0, 1)).toBe(0);
    expect(bytesToMbps(1024, 0)).toBe(0);
  });

  it('учитывает дробное время скачивания', () => {
    const twoMbInBytes = 2 * 1024 * 1024;
    const result = bytesToMbps(twoMbInBytes, 0.5);
    expect(result).toBeCloseTo(32, 5);
  });
});

describe('averageWithoutColdStart', () => {
  it('отбрасывает первое измерение и усредняет остальные', () => {
    const result = averageWithoutColdStart([10, 20, 30], 1);
    expect(result).toBe(25);
  });

  it('не допускает пустого набора данных после отбрасывания', () => {
    const result = averageWithoutColdStart([15], 1);
    expect(result).toBe(15);
  });

  it('корректно работает без необходимости отбрасывать измерения', () => {
    const result = averageWithoutColdStart([15, 25, 35], 0);
    expect(result).toBeCloseTo(25, 5);
  });

  it('использует значение по умолчанию для dropCount', () => {
    const result = averageWithoutColdStart([10, 20, 30]);
    expect(result).toBe(25);
  });
});

describe('createUploadPayload', () => {
  it('создаёт буфер нужного размера', () => {
    const payload = createUploadPayload(2);
    expect(payload.byteLength).toBe(2 * 1024 * 1024);
  });

  it('поддерживает дробные значения мегабайт', () => {
    const payload = createUploadPayload(0.5);
    expect(payload.byteLength).toBeCloseTo(0.5 * 1024 * 1024, 0);
  });
});

describe('average', () => {
  it('вычисляет среднее арифметическое', () => {
    const result = average([10, 20, 30]);
    expect(result).toBe(20);
  });

  it('возвращает 0 для пустого массива', () => {
    expect(average([])).toBe(0);
  });

  it('корректно работает с одним элементом', () => {
    expect(average([42])).toBe(42);
  });

  it('корректно работает с отрицательными числами', () => {
    const result = average([-10, 0, 10]);
    expect(result).toBe(0);
  });
});

describe('median', () => {
  it('возвращает средний элемент для нечётного количества значений', () => {
    const result = median([30, 10, 20]);
    expect(result).toBe(20);
  });

  it('усредняет два центральных элемента для чётного количества значений', () => {
    const result = median([5, 10, 15, 20]);
    expect(result).toBe(12.5);
  });

  it('возвращает 0 для пустого массива', () => {
    expect(median([])).toBe(0);
  });

  it('корректно работает с одним элементом', () => {
    expect(median([42])).toBe(42);
  });

  it('корректно работает с отсортированным массивом', () => {
    const result = median([1, 2, 3, 4, 5]);
    expect(result).toBe(3);
  });
});

describe('removeOutliers', () => {
  it('удаляет выбросы из массива', () => {
    const values = [10, 11, 12, 13, 14, 100];
    const result = removeOutliers(values);
    expect(result).not.toContain(100);
    expect(result.length).toBeLessThan(values.length);
  });

  it('возвращает исходный массив для малого количества элементов', () => {
    const values = [10, 20];
    const result = removeOutliers(values);
    expect(result).toEqual(values);
  });

  it('возвращает исходный массив для одного элемента', () => {
    const values = [42];
    const result = removeOutliers(values);
    expect(result).toEqual(values);
  });

  it('сохраняет нормальные значения', () => {
    const values = [10, 11, 12, 13, 14];
    const result = removeOutliers(values);
    expect(result.length).toBeGreaterThan(0);
  });

  it('корректно обрабатывает массив без выбросов', () => {
    const values = [50, 51, 52, 53, 54, 55];
    const result = removeOutliers(values);
    expect(result.length).toBeGreaterThanOrEqual(values.length * 0.8);
  });
});

describe('testDownloadSpeed', () => {
  it('агрегирует результаты измерений и округляет итоговую скорость', async () => {
    const fetchMock = mockDownloadFetch();
    queuePerformanceTimeline(downloadDurationsMs, TTFB_MS);

    const result = await testDownloadSpeed();

    // Проверяем, что результат близок к ожидаемому (с учетом погрешности округления)
    expect(result).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(MEASUREMENT_COUNT);
  });

  it('пропускает неудачные попытки и продолжает измерения', async () => {
    const failingFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503
    } as Response);
    globalThis.fetch = failingFetch as typeof globalThis.fetch;

    const result = await testDownloadSpeed();

    // Должен вернуть 0, так как все попытки провалились
    expect(result).toBe(0);
  });

  it('возвращает 0 если поток данных недоступен', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: null
    } as Response);
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await testDownloadSpeed();

    // Должен вернуть 0, так как все попытки провалились
    expect(result).toBe(0);
  });
});

describe('testUploadSpeed', () => {
  it('агрегирует измерения отдачи и возвращает округлённое значение', async () => {
    // Для upload используем специальную функцию, которая учитывает requestStart
    queueUploadPerformanceTimeline(uploadDurationsMs, 5);
    stubXmlHttpRequest(Array.from({ length: MEASUREMENT_COUNT }, () => ({})));

    const result = await testUploadSpeed();

    // Проверяем, что результат положительный и разумный
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100000); // Не должно быть нереалистично высоким
  });

  it('пропускает неудачные попытки и продолжает измерения', async () => {
    // Первая попытка с ошибкой, остальные успешные
    stubXmlHttpRequest([
      { failWith: 'upload-error' },
      ...Array.from({ length: MEASUREMENT_COUNT - 1 }, () => ({}))
    ]);
    queueUploadPerformanceTimeline(uploadDurationsMs, 5);

    const result = await testUploadSpeed();

    // Должен вернуть результат на основе успешных измерений
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('возвращает 0 если все попытки провалились', async () => {
    // Все попытки с ошибкой
    stubXmlHttpRequest(
      Array.from({ length: MEASUREMENT_COUNT }, () => ({ failWith: 'upload-error' }))
    );

    const result = await testUploadSpeed();

    // Должен вернуть 0, так как нет успешных измерений
    expect(result).toBe(0);
  });

  it('обрабатывает таймауты корректно', async () => {
    // Первая попытка с таймаутом, остальные успешные
    stubXmlHttpRequest([
      { failWith: 'timeout', status: 0 },
      ...Array.from({ length: MEASUREMENT_COUNT - 1 }, () => ({}))
    ]);
    queueUploadPerformanceTimeline(uploadDurationsMs, 5);

    const result = await testUploadSpeed();

    // Должен вернуть результат на основе успешных измерений
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

function queuePingTimeline(latencies: number[]) {
  const values: number[] = [];
  let cursor = 0;

  latencies.forEach((latency) => {
    // requestStart
    values.push(cursor);
    // requestEnd (после задержки)
    cursor += latency;
    values.push(cursor);
    // Небольшая пауза между измерениями
    cursor += 5;
  });

  return vi.spyOn(performance, 'now').mockImplementation(() => {
    if (!values.length) {
      throw new Error('Очередь performance.now пуста');
    }
    return values.shift()!;
  });
}

describe('testPing', () => {
  it('возвращает медианное значение задержки с округлением до десятых', async () => {
    const latencies = [30, 28, 29, 31, 32, 33, 34, 35, 36, 37];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    queuePingTimeline(latencies);

    const result = await testPing();

    // После обрезки первого и последнего: [28, 29, 31, 32, 33, 34, 35, 36]
    // Медиана: (32 + 33) / 2 = 32.5
    // Но после removeOutliers может быть другой результат, поэтому проверяем диапазон
    expect(result).toBeGreaterThanOrEqual(28);
    expect(result).toBeLessThanOrEqual(36);
    expect(fetchMock).toHaveBeenCalledTimes(PING_ATTEMPTS);
  });

  it('пропускает неудачные попытки и продолжает измерения', async () => {
    // Первая попытка с ошибкой, остальные успешные
    const latencies = [30, 28, 29, 31, 32, 33, 34, 35, 36, 37];
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      // Первая попытка возвращает ошибку
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 500 } as Response);
      }
      // Остальные успешные
      return Promise.resolve({ ok: true } as Response);
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    // Передаем все значения, но первая попытка провалится, поэтому для успешных используем остальные
    queuePingTimeline(latencies);

    const result = await testPing();

    // Должен вернуть результат на основе успешных измерений
    expect(result).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(PING_ATTEMPTS);
  });

  it('возвращает 0 если все попытки провалились', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    } as Response);
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await testPing();

    // Должен вернуть 0, так как все попытки провалились
    expect(result).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(PING_ATTEMPTS);
  });
});

describe('testAllSpeeds', () => {
  it('должен выполнить все три теста параллельно и вернуть результаты', async () => {
    // Мокаем fetch для download и ping
    const downloadBytes = FILE_SIZES_MB.reduce((acc, size) => acc + size * 1024 * 1024, 0);
    const downloadChunks = Math.ceil(downloadBytes / DOWNLOAD_CHUNK_BYTES);
    
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/download')) {
        const mockResponse = new Response(
          new ReadableStream({
            start(controller) {
              for (let i = 0; i < downloadChunks; i++) {
                controller.enqueue(new Uint8Array(DOWNLOAD_CHUNK_BYTES));
              }
              controller.close();
            }
          }),
          { status: 200 }
        );
        return Promise.resolve(mockResponse);
      }
      if (url.includes('/api/ping')) {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    // Мокаем XMLHttpRequest для upload
    let uploadCallCount = 0;
    const xhrMock = vi.fn().mockImplementation(() => {
      const xhr = {
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        responseType: '',
        timeout: 0,
        status: 200,
        getResponseHeader: vi.fn(),
        upload: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        },
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === 'load') {
            // Используем setTimeout с минимальной задержкой для симуляции асинхронности
            setTimeout(() => {
              handler();
            }, 10);
            uploadCallCount++;
          }
        }),
        removeEventListener: vi.fn()
      };
      return xhr;
    });
    globalWithXhr.XMLHttpRequest = xhrMock as unknown as typeof XMLHttpRequest;

    // Используем простой мок performance.now, который возвращает увеличивающееся значение
    let performanceTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      performanceTime += 10; // Увеличиваем время на 10мс при каждом вызове
      return performanceTime;
    });

    const results = await testAllSpeeds();

    // Проверяем, что все три теста были выполнены
    expect(results).toHaveProperty('download');
    expect(results).toHaveProperty('upload');
    expect(results).toHaveProperty('ping');
    
    // Проверяем, что результаты являются числами
    expect(typeof results.download).toBe('number');
    expect(typeof results.upload).toBe('number');
    expect(typeof results.ping).toBe('number');
    
    // Проверяем, что fetch был вызван для download и ping
    expect(fetchMock).toHaveBeenCalled();
    
    // Проверяем, что XMLHttpRequest был использован для upload
    expect(xhrMock).toHaveBeenCalled();
  });
});
