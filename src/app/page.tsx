"use client";

import {
  testDownloadSpeed,
  testPing,
  testUploadSpeed,
} from "@/utils/checkspeed";
import { useEffect, useState } from "react";

export default function Home() {
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
  const [ping, setPing] = useState<number | null>(null);

  // запуск функции расчета скорости загрузки

  const fetchSpeed = async () => {
    setDownloadSpeed(await testDownloadSpeed());
    setUploadSpeed(await testUploadSpeed());
    setPing(await testPing());
  };

  useEffect(() => {
    fetchSpeed();
  }, []);

  const handleMeasureSpeed = (): void => {
    console.log("click btn");
    fetchSpeed();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {!uploadSpeed ? (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-gray-400 mb-2">
                Отправка
              </h2>
              <div className="h-10 w-32 text-4xl font-bold text-white mx-auto animate-pulse">
                000
              </div>
              <span className="text-2xl font-bold text-white">Мбит/с</span>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-gray-400 mb-2">
                Отправка
              </h2>
              <p className="text-4xl font-bold text-white">
                {uploadSpeed}
              </p>
              <span className="text-2xl font-bold text-white">Мбит/с</span>
            </div>
          )}
          {!downloadSpeed ? (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-gray-400 mb-2">
                Получение
              </h2>
              <div className="h-10 w-32 text-4xl font-bold text-white mx-auto animate-pulse">
                000
              </div>
              <span className="text-2xl font-bold text-white">Мбит/с</span>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-gray-400 mb-2">
                Получение
              </h2>
              <p className="text-4xl font-bold text-white">
                {downloadSpeed}
              </p>
              <span className="text-2xl font-bold text-white">Мбит/с</span>
            </div>
          )}
          {!ping ? (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-gray-400 mb-2">
                Пинг
              </h2>
              <div className="h-10 w-32 text-4xl font-bold text-white mx-auto animate-pulse">
                000
              </div>
              <span className="text-2xl font-bold text-white">мс</span>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-gray-400 mb-2">
                Пинг
              </h2>
              <p className="text-4xl font-bold text-white">{ping}</p>
              <span className="text-2xl font-bold text-white">мс</span>
            </div>
          )}
        </div>
        <button
          className="rounded-md px-12 py-3 text-lg font-medium text-white bg-blue-500 hover:bg-blue-600 transition duration-200"
          onClick={handleMeasureSpeed}
          aria-label="Измерить скорость интернета"
        >
          Измерить
        </button>
      </main>
      <footer className="flex mt-auto gap-6 flex-wrap items-center justify-center">
        <a
          href="https://dotdev.site"
          className="text-sm text-blue-500 hover:text-blue-600 transition duration-200"
          target="_blank"
          rel="noopener noreferrer"
        >
          dotdev.site
        </a>
      </footer>
    </div>
  );
}
