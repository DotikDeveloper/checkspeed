"use client";

import { useState, useEffect } from "react";
import { measureInternetSpeed } from '@/utils/checkspeed';
import { ISpeed } from "@/utils/types";

export default function Home() {
  const [speed, setSpeed] = useState<ISpeed | null>(null);

  const handleMeasureSpeed = async () => {
    setSpeed(null);
    const measuredSpeed = await measureInternetSpeed();
    // setSpeed(measuredSpeed);

    setTimeout(() => {
      setSpeed({  ping: 3, speedDownload: 100, speedUpload: 115 });
    }, 3000);

    console.log("measuredSpeed --->", measuredSpeed);
    
  };

  useEffect(() => {
    handleMeasureSpeed();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-semibold text-gray-400 mb-2">Отправка</h2>
            <p className="text-4xl font-bold text-white">
              {speed !== null ? `${speed.speedUpload.toFixed(2)} МБ/с` : 'Измерение...'}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-semibold text-gray-400 mb-2">Получение</h2>
            <p className="text-4xl font-bold text-white">
              {speed !== null ? `${speed.speedDownload.toFixed(2)} МБ/с` : 'Измерение...'}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-semibold text-gray-400 mb-2">Пинг</h2>
            <p className="text-4xl font-bold text-white">
              {speed !== null ? `${speed.ping.toFixed(0)} мс` : 'Измерение...'}
            </p>
          </div>
        </div>
        <button 
          className="rounded-md px-12 py-3 text-lg font-medium text-white bg-blue-500 hover:bg-blue-600 transition duration-200"
          onClick={handleMeasureSpeed}
        >
          Измерить
        </button>
      </main>
      <footer className="flex mt-auto gap-6 flex-wrap items-center justify-center">
        <a
          href="https://dotikdeveloper.site"
          className="text-sm text-blue-500 hover:text-blue-600 transition duration-200"
          target="_blank"
          rel="noopener noreferrer"
        >
          dotikdeveloper.site
        </a>
      </footer>
    </div>
  );
}
