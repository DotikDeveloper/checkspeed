export async function testDownloadSpeed() {
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Размеры файлов в КБ
  const speeds = [];

  for (const size of sizes) {
    const startTime = Date.now();
    const response = await fetch(`/api/download?size=${size * 1024}`); // Запрос с указанием размера в КБ
    const data = await response.blob();
    const endTime = Date.now();

    const duration = (endTime - startTime) / 1000; // В секундах
    const bitsLoaded = data.size * 8; // Размер в битах
    const speedMbps = bitsLoaded / (1024 * 1024) / duration; // Скорость в Mbps

    speeds.push(speedMbps); // Сохраняем скорость
  }

  // Рассчитываем среднюю скорость
  const averageSpeed = speeds.reduce((acc, speed) => acc + speed, 0) / speeds.length;

  return parseFloat(averageSpeed.toFixed(1)); // Возвращаем среднюю скорость с округлением
}

export async function testUploadSpeed() {
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Размеры файлов в КБ
  const speeds = [];

  for (const size of sizes) {
    const data = new Blob([new Uint8Array(size * 1024).fill(97)], { // Создаем файл размером size КБ
      type: "application/octet-stream",
    });
    
    const startTime = Date.now();
    await fetch("/api/upload", {
      method: "POST",
      body: data,
    });
    const endTime = Date.now();

    const duration = (endTime - startTime) / 1000; // В секундах
    const bitsUploaded = data.size * 8;
    const speedMbps = Math.round(bitsUploaded / (1024 * 1024) / duration); // Округление до целого числа

    speeds.push(speedMbps); // Сохраняем скорость
  }  

  // Рассчитываем среднюю скорость
  const averageSpeed =
    speeds.reduce((acc, speed) => acc + speed, 0) / speeds.length;

  return averageSpeed; // Возвращаем среднюю скорость
}

export async function testPing() {
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Размеры файлов в КБ
  const latencies = [];

  for (const size of sizes) {
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
