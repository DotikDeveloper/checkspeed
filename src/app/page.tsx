"use client";

import {
  testAllSpeeds,
  testDownloadSpeed,
  testPing,
  testUploadSpeed,
  type SpeedTestResults,
} from "@/utils/checkspeed.client";
import { logger } from "@/utils/logger";
import { median } from "@/utils/stats";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

const SAMPLE_COUNT = 10;

type SpeedChartProps = {
  title: string;
  samples: number[];
  average: number | null;
  color: string;
  unit?: string;
  isMeasuring: boolean;
};

function SpeedChart({
  title,
  samples,
  average,
  color,
  unit = "Мбит/с",
  isMeasuring,
}: SpeedChartProps) {
  const chartWidth = 360;
  const chartHeight = 160;
  const paddingX = 18;
  const paddingY = 18;

  const maxValue = useMemo(() => {
    if (!samples.length) {
      return 0;
    }
    return Math.max(...samples);
  }, [samples]);

  const normalizedPoints = useMemo(() => {
    if (!samples.length) {
      return "";
    }

    const effectiveMax = maxValue > 0 ? maxValue : 1;

    if (samples.length === 1) {
      const x = chartWidth / 2;
      const y =
        chartHeight -
        paddingY -
        (samples[0] / effectiveMax) * (chartHeight - paddingY * 2);
      return `${x},${y}`;
    }

    const stepX = (chartWidth - paddingX * 2) / (samples.length - 1);

    return samples
      .map((value, index) => {
        const x = paddingX + index * stepX;
        const y =
          chartHeight -
          paddingY -
          (value / effectiveMax) * (chartHeight - paddingY * 2);
        return `${x},${y}`;
      })
      .join(" ");
  }, [samples, maxValue, chartHeight, chartWidth]);

  const latestSample = samples.at(-1) ?? null;
  const averageDisplay = average !== null ? `${average} ${unit}` : "—";
  const progressLabel = `${samples.length}/${SAMPLE_COUNT}`;

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-lg w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-400">
            Измерений: {progressLabel}{" "}
            {isMeasuring && <span className="text-blue-400">(в процессе)</span>}
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Текущее значение: {latestSample !== null ? `${latestSample} ${unit}` : "—"}
        </div>
      </div>

      <div className="h-40 w-full flex items-center justify-center bg-gray-950/60 rounded-xl">
        {samples.length ? (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`gradient-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline
              points={`0,${chartHeight - paddingY} ${chartWidth},${chartHeight - paddingY}`}
              fill="none"
              stroke="#1f2937"
              strokeWidth={1}
            />
            {samples.length > 1 && (
              <polygon
                points={`${normalizedPoints} ${chartWidth - paddingX},${chartHeight - paddingY} ${paddingX},${chartHeight - paddingY}`}
                fill={`url(#gradient-${title})`}
                stroke="none"
              />
            )}
            <polyline
              points={normalizedPoints}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {samples.map((value, index) => {
              const effectiveMax = maxValue > 0 ? maxValue : 1;
              const x =
                samples.length === 1
                  ? chartWidth / 2
                  : paddingX +
                    index *
                      ((chartWidth - paddingX * 2) /
                        Math.max(samples.length - 1, 1));
              const y =
                chartHeight -
                paddingY -
                (value / effectiveMax) * (chartHeight - paddingY * 2);
              return <circle key={`${title}-point-${index}`} cx={x} cy={y} r={4} fill={color} />;
            })}
          </svg>
        ) : (
          <div className="text-sm text-gray-500">Ожидание результатов измерений…</div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-300">
        Средняя скорость: <span className="text-white font-semibold">{averageDisplay}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [downloadSamples, setDownloadSamples] = useState<number[]>([]);
  const [uploadSamples, setUploadSamples] = useState<number[]>([]);
  const [downloadAverage, setDownloadAverage] = useState<number | null>(null);
  const [uploadAverage, setUploadAverage] = useState<number | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);

  const measureSpeed = useCallback(async () => {
    startTransition(() => {
      setIsMeasuring(true);
      setDownloadSamples([]);
      setUploadSamples([]);
      setDownloadAverage(null);
      setUploadAverage(null);
      setPing(null);
    });

    const downloadSeries: number[] = [];
    const uploadSeries: number[] = [];
    const pingSeries: number[] = [];

    try {
      // Выполняем серию измерений
      // Каждое измерение выполняется параллельно (download, upload, ping одновременно)
      for (let i = 0; i < SAMPLE_COUNT; i += 1) {
        try {
          // Запускаем все три теста параллельно для каждого измерения
          const results = await testAllSpeeds();
          
          // Добавляем только валидные (не нулевые) значения в соответствующие серии
          // Это предотвращает занижение средних значений из-за rate limiting
          let hasValidResults = false;
          
          if (results.download > 0) {
            downloadSeries.push(results.download);
            hasValidResults = true;
            startTransition(() => {
              setDownloadSamples((prev) => [...prev, results.download]);
            });
          }
          
          if (results.upload > 0) {
            uploadSeries.push(results.upload);
            hasValidResults = true;
            startTransition(() => {
              setUploadSamples((prev) => [...prev, results.upload]);
            });
          }
          
          if (results.ping > 0) {
            pingSeries.push(results.ping);
            hasValidResults = true;
            // Обновляем ping только последним значением (обычно ping не меняется сильно)
            if (i === SAMPLE_COUNT - 1) {
              startTransition(() => {
                setPing(results.ping);
              });
            }
          }
          
          // Если все результаты нулевые (возможно, rate limit), добавляем небольшую задержку
          if (!hasValidResults) {
            logger.warn('speedtest', `Измерение ${i + 1} вернуло нулевые результаты, возможно rate limit`);
            // Небольшая задержка перед следующим измерением
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          // Обрабатываем ошибки отдельных измерений, но продолжаем цикл
          logger.warn('speedtest', `Ошибка при измерении ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
          // Добавляем задержку перед следующим измерением
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Вычисляем средние значения
      const downloadAvg = Math.round(
        downloadSeries.reduce((acc, value) => acc + value, 0) /
          Math.max(downloadSeries.length, 1),
      );
      const uploadAvg = Math.round(
        uploadSeries.reduce((acc, value) => acc + value, 0) /
          Math.max(uploadSeries.length, 1),
      );
      // Для ping используем медиану из всех измерений
      // Используем функцию median, которая правильно обрабатывает четные массивы
      const pingMedian = pingSeries.length > 0 
        ? median(pingSeries)
        : 0;

      startTransition(() => {
        setDownloadAverage(downloadAvg);
        setUploadAverage(uploadAvg);
        setPing(pingMedian);
      });
    } finally {
      startTransition(() => {
        setIsMeasuring(false);
      });
    }
  }, []);

  useEffect(() => {
    void measureSpeed();
  }, [measureSpeed]);

  const handleMeasureSpeed = (): void => {
    if (isMeasuring) {
      return;
    }
    void measureSpeed();
  };

  const buttonLabel = isMeasuring ? "Идёт измерение…" : "Повторить измерение";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-10 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-5xl">
          <div className="bg-gray-900 rounded-xl p-6 text-center border border-gray-800 shadow-md">
            <h2 className="text-2xl font-semibold text-gray-300 mb-2">Отдача</h2>
            {uploadAverage !== null ? (
              <>
                <p className="text-4xl font-bold text-white">{uploadAverage}</p>
                <span className="text-2xl font-bold text-white">Мбит/с</span>
              </>
            ) : (
              <>
                <div className="h-10 w-32 text-4xl font-bold text-white mx-auto animate-pulse">
                  000
                </div>
                <span className="text-2xl font-bold text-white">Мбит/с</span>
              </>
            )}
          </div>
          <div className="bg-gray-900 rounded-xl p-6 text-center border border-gray-800 shadow-md">
            <h2 className="text-2xl font-semibold text-gray-300 mb-2">Получение</h2>
            {downloadAverage !== null ? (
              <>
                <p className="text-4xl font-bold text-white">{downloadAverage}</p>
                <span className="text-2xl font-bold text-white">Мбит/с</span>
              </>
            ) : (
              <>
                <div className="h-10 w-32 text-4xl font-bold text-white mx-auto animate-pulse">
                  000
                </div>
                <span className="text-2xl font-bold text-white">Мбит/с</span>
              </>
            )}
          </div>
          <div className="bg-gray-900 rounded-xl p-6 text-center border border-gray-800 shadow-md">
            <h2 className="text-2xl font-semibold text-gray-300 mb-2">Пинг</h2>
            {ping !== null ? (
              <>
                <p className="text-4xl font-bold text-white">{ping}</p>
                <span className="text-lg font-semibold text-gray-400">мс</span>
              </>
            ) : (
              <>
                <div className="h-10 w-32 text-4xl font-bold text-white mx-auto animate-pulse">
                  000
                </div>
                <span className="text-lg font-semibold text-gray-400">мс</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-5xl">
          <SpeedChart
            title="Динамика загрузки"
            samples={downloadSamples}
            average={downloadAverage}
            color="#60a5fa"
            isMeasuring={isMeasuring}
          />
          <SpeedChart
            title="Динамика отдачи"
            samples={uploadSamples}
            average={uploadAverage}
            color="#34d399"
            isMeasuring={isMeasuring}
          />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-5xl">
          <button
            className="rounded-full px-10 py-3 text-lg font-medium text-white bg-blue-500 hover:bg-blue-600 transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleMeasureSpeed}
            disabled={isMeasuring}
            aria-label="Повторить измерение скорости интернета"
          >
            {buttonLabel}
          </button>
          <p className="text-sm text-gray-400 text-center">
            Каждое измерение выполняется {SAMPLE_COUNT} раз. Средняя скорость вычисляется по результатам серии тестов.
            {downloadSamples.length < SAMPLE_COUNT && downloadSamples.length > 0 && (
              <span className="block mt-1 text-yellow-400">
                Выполнено {downloadSamples.length} из {SAMPLE_COUNT} измерений
              </span>
            )}
          </p>
        </div>
      </main>
      <footer className="flex mt-auto gap-6 flex-wrap items-center justify-center text-gray-500">
        <a
          href="https://dotdev.site"
          className="text-sm hover:text-gray-300 transition duration-200"
          target="_blank"
          rel="noopener noreferrer"
        >
          dotdev.site
        </a>
      </footer>
    </div>
  );
}