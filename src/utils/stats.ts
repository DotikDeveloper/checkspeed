/**
 * Вычисляет среднее арифметическое значение массива чисел.
 * @param values - массив чисел
 * @returns среднее значение или 0 для пустого массива
 */
export const average = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

/**
 * Вычисляет медиану массива чисел.
 * @param values - массив чисел
 * @returns медианное значение или 0 для пустого массива
 */
export const median = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
  }

  return sorted[middleIndex];
};

/**
 * Удаляет выбросы из массива значений, используя метод межквартильного размаха (IQR).
 * Выбросами считаются значения, выходящие за пределы [Q1 - 1.5*IQR, Q3 + 1.5*IQR].
 * @param values - массив чисел
 * @returns массив значений без выбросов
 */
export const removeOutliers = (values: number[]): number[] => {
  if (values.length <= 2) {
    return values;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length / 4);
  const q3Index = Math.floor((3 * sorted.length) / 4);

  const q1 = sorted[q1Index] ?? 0;
  const q3 = sorted[q3Index] ?? 0;
  const iqr = q3 - q1;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return values.filter((value) => value >= lowerBound && value <= upperBound);
};

/**
 * Вычисляет среднее арифметическое, отбрасывая первые N элементов массива (cold start).
 * @param values - массив чисел
 * @param dropCount - количество элементов для отбрасывания с начала (по умолчанию 1)
 * @returns среднее значение без учёта отброшенных элементов или 0 для пустого массива
 */
export const averageWithoutColdStart = (values: number[], dropCount = 1): number => {
  if (!values.length) {
    return 0;
  }

  const startIndex = Math.min(dropCount, values.length - 1);
  const filtered = values.slice(startIndex);
  return average(filtered);
};
