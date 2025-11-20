const UPLOAD_SIZE = 1 * 1024 * 1024;   // 1 МБ

const FILE_SIZES_MB = [0.5, 1, 2, 5, 10] as const;
const MEASUREMENTS_PER_SIZE = 3;
const COLD_START_SKIP = 1;

export const DOWNLOAD_ENDPOINT = '/api/download';

export const bytesToMbps = (bytesTransferred: number, durationSeconds: number): number => {
  if (durationSeconds <= 0 || bytesTransferred <= 0) {
    return 0;
  }

  const megabits = (bytesTransferred * 8) / (1024 * 1024);
  return megabits / durationSeconds;
};

export const averageWithoutColdStart = (values: number[], dropCount = COLD_START_SKIP): number => {
  if (!values.length) {
    return 0;
  }

  const startIndex = Math.min(dropCount, values.length - 1);
  const filtered = values.slice(startIndex);
  const sum = filtered.reduce((acc, value) => acc + value, 0);
  return sum / filtered.length;
};

const buildDownloadUrl = (sizeMb: number) => `${DOWNLOAD_ENDPOINT}?size=${sizeMb}`;

const measureDownloadOnce = async (sizeMb: number): Promise<number> => {
  const response = await fetch(buildDownloadUrl(sizeMb));

  if (!response.ok) {
    throw new Error(`Download request failed with status ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Readable stream is not available for the download response.');
  }

  const reader = response.body.getReader();
  let bytesTransferred = 0;
  let startTime: number | null = null;
  let lastChunkTime = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    const chunkTime = performance.now();
    if (startTime === null) {
      startTime = chunkTime;
    }
    lastChunkTime = chunkTime;
    bytesTransferred += value.byteLength;
  }

  if (startTime === null || lastChunkTime <= startTime || bytesTransferred === 0) {
    return 0;
  }

  const durationSeconds = (lastChunkTime - startTime) / 1000;
  return bytesToMbps(bytesTransferred, durationSeconds);
};

export const testDownloadSpeed = async (): Promise<number> => {
  const aggregatedSpeeds: number[] = [];

  for (const sizeMb of FILE_SIZES_MB) {
    const measurements: number[] = [];
    for (let attempt = 0; attempt < MEASUREMENTS_PER_SIZE; attempt += 1) {
      const speed = await measureDownloadOnce(sizeMb);
      measurements.push(speed);
    }
    aggregatedSpeeds.push(averageWithoutColdStart(measurements));
  }

  const overallAverage =
    aggregatedSpeeds.reduce((acc, speed) => acc + speed, 0) / aggregatedSpeeds.length;

  return Math.round(overallAverage);
};

export const testUploadSpeed = async (): Promise<number> => {
  const data = new Uint8Array(UPLOAD_SIZE);
  const start = performance.now();
  await fetch('/api/upload', {
    method: 'POST',
    body: data,
  });
  const end = performance.now();
  const durationInSeconds = (end - start) / 1000;
  const speedMbps = (UPLOAD_SIZE * 8) / (1024 * 1024 * durationInSeconds);
  return Math.round(speedMbps);
};

export async function testPing() {
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Размеры файлов в КБ
  const latencies = [];

  for (let i = 0; i < sizes.length; i++) {
    const pingStart = Date.now();
    await fetch("/api/download", { method: "HEAD" }); // Используем метод HEAD для легкого запроса
    const pingEnd = Date.now();

    const latency = pingEnd - pingStart;
    latencies.push(latency); // Сохраняем задержку
  }

  // Рассчитываем среднюю задержку
  const averageLatency =
    latencies.reduce((acc, latency) => acc + latency, 0) / latencies.length + 1;

  return parseFloat(averageLatency.toFixed(1)); // Возвращаем среднюю задержку с округлением
}
