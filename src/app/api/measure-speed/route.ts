import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TEST_FILE_SIZES = [1_000_000, 5_000_000, 10_000_000]; // Размеры в байтах
const NUM_TESTS = 3;
const TEST_FILE_DIR = path.join(process.cwd(), 'temp');

export async function GET() {
  try {
    await ensureTestFileDirectory();
    const { downloadSpeeds, uploadSpeed } = await measureInternetSpeed();
    const averageDownloadSpeed = downloadSpeeds.reduce((a, b) => a + b, 0) / downloadSpeeds.length;
    
    return NextResponse.json({ 
      downloadSpeeds, 
      averageDownloadSpeed: averageDownloadSpeed.toFixed(2),
      uploadSpeed: uploadSpeed.toFixed(2),
      unit: 'Мбит/с'
    });
  } catch (error) {
    console.error('Ошибка при измерении скорости:', error);
    return NextResponse.json({ error: 'Ошибка при измерении скорости' }, { status: 500 });
  }
}

async function ensureTestFileDirectory() {
  await fs.mkdir(TEST_FILE_DIR, { recursive: true });
}

async function measureInternetSpeed(): Promise<{ downloadSpeeds: number[], uploadSpeed: number }> {
  const downloadSpeeds: number[] = [];

  for (const size of TEST_FILE_SIZES) {
    const filePath = await createTestFile(size);
    const testSpeeds: number[] = [];
    for (let i = 0; i < NUM_TESTS; i++) {
      const speed = await performDownloadSpeedTest(filePath);
      testSpeeds.push(speed);
    }
    const averageSpeed = testSpeeds.reduce((a, b) => a + b, 0) / NUM_TESTS;
    downloadSpeeds.push(averageSpeed);
    await fs.unlink(filePath);
  }

  const uploadSpeed = await performUploadSpeedTest(TEST_FILE_SIZES[1]); // Используем средний размер файла для теста загрузки

  return { downloadSpeeds, uploadSpeed };
}

async function createTestFile(size: number): Promise<string> {
  const fileName = `test_file_${size}.bin`;
  const filePath = path.join(TEST_FILE_DIR, fileName);
  
  const buffer = crypto.randomBytes(size);
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}

async function performDownloadSpeedTest(filePath: string): Promise<number> {
  const startTime = performance.now();
  
  const fileContent = await fs.readFile(filePath);
  
  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000; // в секундах
  return (fileContent.length * 8) / (duration * 1000000); // Мбит/с
}

async function performUploadSpeedTest(size: number): Promise<number> {
  const testData = crypto.randomBytes(size);
  const startTime = performance.now();

  // Имитация отправки данных на сервер
  await new Promise(resolve => setTimeout(resolve, 100));

  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000; // в секундах
  return (size * 8) / (duration * 1000000); // Мбит/с
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.arrayBuffer();
    const size = body.byteLength;
    const startTime = performance.now();
  
    // Имитация обработки загруженных данных
    await new Promise(resolve => setTimeout(resolve, 100));
  
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // в секундах
    const speedMbps = (size * 8) / (duration * 1000000); // Мбит/с

    return NextResponse.json({ uploadSpeed: speedMbps.toFixed(2), unit: 'Мбит/с' });
  } catch (error) {
    console.error('Ошибка при измерении скорости загрузки:', error);
    return NextResponse.json({ error: 'Ошибка при измерении скорости загрузки' }, { status: 500 });
  }
}
