import { describe, expect, it } from 'vitest';

import { averageWithoutColdStart, bytesToMbps } from './checkspeed';

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
