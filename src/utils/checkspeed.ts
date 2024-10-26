export async function testDownloadSpeed() {
  const startTime = Date.now();
  const response = await fetch("/api/download");
  const data = await response.blob();
  const endTime = Date.now();

  const duration = (endTime - startTime) / 1000; // В секундах
  const bitsLoaded = data.size * 8;
  const speedMbps = bitsLoaded / (1024 * 1024) / duration;

  return speedMbps;
}

export async function testUploadSpeed() {
  const data = new Blob([new Uint8Array(1024 * 1024).fill(97)], { // Используем Uint8Array вместо обычного массива
    type: "application/octet-stream",
  }); // 1 МБ данных
  const startTime = Date.now();
  await fetch("/api/upload", {
    method: "POST",
    body: data,
  });
  const endTime = Date.now();

  const duration = (endTime - startTime) / 1000; // В секундах
  const bitsUploaded = data.size * 8;
  const speedMbps = bitsUploaded / (1024 * 1024) / duration;

  return speedMbps;
}

export async function testPing() {
  const pingStart = Date.now();
  await fetch("/api/download"); // Можем сделать легкий запрос
  const pingEnd = Date.now();

  const latency = pingEnd - pingStart;
  return latency;
}
