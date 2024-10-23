export async function measureInternetSpeed(): Promise<{ ping: number; speedDownload: number; speedUpload: number }> {
    const testDataSize = 5e6; // Увеличиваем размер тестовых данных до 5 МБ
    const url = '/api/measure-speed';

    try {
        const [ping, speedDownload, speedUpload] = await Promise.all([
            measurePing(url),
            measureSpeedDownload(url, testDataSize),
            measureSpeedUpload(url, testDataSize)
        ]);

        console.log('Измерения завершены:', { ping, speedDownload, speedUpload });
        return { ping, speedDownload, speedUpload };
    } catch (error) {
        console.error('Ошибка при измерении скорости:', error);
        throw error;
    }
}

async function measurePing(url: string): Promise<number> {
    const attempts = 5;
    const pings = await Promise.all(
        Array(attempts).fill(null).map(async () => {
            const startTime = performance.now();
            await fetch(url, { method: 'HEAD', cache: 'no-store' });
            const pingTime = (performance.now() - startTime) / 1000;
            return pingTime;
        })
    );
    const minPing = Math.min(...pings);
    const roundPing = Math.round(minPing);
    
    return roundPing;
}

async function measureSpeedDownload(url: string, dataSize: number): Promise<number> {
    try {
        const response = await fetch(`${url}?size=${dataSize}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }
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
    } catch (error) {
        console.error('Ошибка при измерении скорости загрузки:', error);
        throw error;
    }
}

async function measureSpeedUpload(url: string, dataSize: number): Promise<number> {
    try {
        const testData = new Uint8Array(dataSize).fill(1);
        const startTime = performance.now();

        const response = await fetch(url, {
            method: 'POST',
            body: testData,
            headers: { 'Content-Type': 'application/octet-stream' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }

        const endTime = await response.json();
        const durationInSeconds = (endTime - startTime) / 1000;
        return calculateSpeed(dataSize, durationInSeconds);
    } catch (error) {
        console.error('Ошибка при измерении скорости отправки:', error);
        throw error;
    }
}

function calculateSpeed(bytes: number, seconds: number): number {
    return (bytes * 8) / (seconds * 1e6); // Возвращаем скорость в Mbps
}

// Пример вызова функции
// measureInternetSpeed().then(speed => console.log(speed));
