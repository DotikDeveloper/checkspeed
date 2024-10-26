export async function testDownloadSpeed() {
  const sizes = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]; // Размеры файлов в МБ
  const speeds = [];

  for (const size of sizes) {
    const startTime = Date.now();
    const response = await fetch(`/api/download?size=${size}`); // Запрос с указанием размера
    const data = await response.blob();
    const endTime = Date.now();

    const duration = (endTime - startTime) / 1000; // В секундах
    const bitsLoaded = data.size * 8; // Размер в битах
    const speedMbps = (bitsLoaded / (1024 * 1024)) / duration; // Скорость в Mbps

    console.log(`Size: ${size}MB, Duration: ${duration}s, Bits Loaded: ${bitsLoaded}, Speed: ${speedMbps.toFixed(1)} Mbps`); // Логирование
    speeds.push(speedMbps); // Сохраняем скорость
  }

  // Рассчитываем среднюю скорость
  const averageSpeed = speeds.reduce((acc, speed) => acc + speed, 0) / speeds.length;
  console.log(`Average Download Speed: ${averageSpeed.toFixed(1)} Mbps`); // Логирование средней скорости

  return parseFloat(averageSpeed.toFixed(1)); // Возвращаем среднюю скорость с округлением
}

export async function testUploadSpeed() {
  const sizes = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]; // Размеры файлов в МБ
  const speeds = [];

  for (const size of sizes) {
    const data = new Blob([new Uint8Array(size * 1024 * 1024).fill(97)], { // Создаем файл размером size МБ
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

    console.log(`Size: ${size}MB, Duration: ${duration}s, Bits Uploaded: ${bitsUploaded}, Speed: ${speedMbps} Mbps`); // Логирование
    speeds.push(speedMbps); // Сохраняем скорость
  }

  // Рассчитываем среднюю скорость
  const averageSpeed = speeds.reduce((acc, speed) => acc + speed, 0) / speeds.length;
  console.log(`Average Upload Speed: ${averageSpeed} Mbps`); // Логирование средней скорости

  return averageSpeed; // Возвращаем среднюю скорость
}

export async function testPing() {
  const sizes = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]; // Размеры файлов в МБ
  const latencies = [];

  for (const size of sizes) {
    const pingStart = Date.now();
    await fetch("/api/download", { method: "HEAD" }); // Используем метод HEAD для легкого запроса
    const pingEnd = Date.now();

    const latency = pingEnd - pingStart;
    console.log(`Size: ${size}MB, Latency: ${latency}ms`); // Логирование
    latencies.push(latency); // Сохраняем задержку
  }

  // Рассчитываем среднюю задержку
  const averageLatency = latencies.reduce((acc, latency) => acc + latency, 0) / latencies.length;
  console.log(`Average Ping: ${averageLatency.toFixed(1)}ms`); // Логирование средней задержки

  return parseFloat(averageLatency.toFixed(1)); // Возвращаем среднюю задержку с округлением
}
