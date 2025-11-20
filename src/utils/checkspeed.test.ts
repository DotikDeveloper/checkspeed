import { describe, expect, it } from 'vitest';

import { bytesToMbps, createUploadPayload } from './checkspeed.client';
import { average, averageWithoutColdStart, median, removeOutliers } from './stats';

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
