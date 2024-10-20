export async function measureInternetSpeed(): Promise<{ ping: number; speedDownload: number; speedUpload: number }> {
    const testDataSize = 5e6; // Увеличиваем размер тестовых данных до 5 МБ
    const url = '/api/measure-speed';

    const [ping, speedDownload, speedUpload] = await Promise.all([
        measurePing(url),
        measureSpeedDownload(url, testDataSize),
        measureSpeedUpload(url, testDataSize)
    ]);

    return { ping, speedDownload, speedUpload };
}

async function measurePing(url: string): Promise<number> {
    const attempts = 5;
    const pings = await Promise.all(
        Array(attempts).fill(null).map(async () => {
            const startTime = performance.now();
            await fetch(url, { method: 'HEAD', cache: 'no-store' });
            return performance.now() - startTime;
        })
    );
    return Math.min(...pings);
}

async function measureSpeedDownload(url: string, dataSize: number): Promise<number> {
    const response = await fetch(`${url}?size=${dataSize}`, { cache: 'no-store' });
    const data = await response.arrayBuffer();
    const endTime = performance.now();
    
    const startTime = Number(response.headers.get('X-Start-Time'));
    if (isNaN(startTime)) {
        throw new Error('Недопустимое значение X-Start-Time');
    }

    const durationInSeconds = (endTime - startTime) / 1000;
    if (durationInSeconds <= 0) {
        throw new Error('Недопустимая продолжительность');
    }
    return calculateSpeed(data.byteLength, durationInSeconds);
}

async function measureSpeedUpload(url: string, dataSize: number): Promise<number> {
    const testData = new Uint8Array(dataSize).fill(1);
    const startTime = performance.now();

    const response = await fetch(url, {
        method: 'POST',
        body: testData,
        headers: { 'Content-Type': 'application/octet-stream' }
    });

    const endTime = await response.json();
    const durationInSeconds = (endTime - startTime) / 1000;
    return calculateSpeed(dataSize, durationInSeconds);
}

function calculateSpeed(bytes: number, seconds: number): number {
    return (bytes * 8) / (seconds * 1e6); // Возвращаем скорость в Mbps
}

// Пример вызова функции
// measureInternetSpeed().then(speed => console.log(speed));
