const DOWNLOAD_SIZE = 1 * 1024 * 1024; // 1 МБ
const UPLOAD_SIZE = 1 * 1024 * 1024;   // 1 МБ

export const testDownloadSpeed = async (): Promise<number> => {
  const start = performance.now();
  const response = await fetch('/api/download');
  await response.arrayBuffer();
  const end = performance.now();
  const durationInSeconds = (end - start) / 1000;
  const speedMbps = (DOWNLOAD_SIZE * 8) / (1024 * 1024 * durationInSeconds);
  return Math.round(speedMbps);
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
