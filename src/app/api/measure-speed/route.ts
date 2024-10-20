import { NextRequest, NextResponse } from 'next/server';
import { measureInternetSpeed } from '@/utils/checkspeed';

export async function GET() {
  try {
    const speed = await measureInternetSpeed();
    return NextResponse.json(speed);
  } catch (error) {
    console.error('Ошибка при измерении скорости:', error);
    return NextResponse.json({ error: 'Ошибка при измерении скорости' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();
  const size = body.byteLength;
  const startTime = Date.now();
  
  // Имитация обработки загруженных данных
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000; // в секундах
  const speedMbps = (size * 8) / (duration * 1000000); // Мбит/с

  return NextResponse.json({ speed: speedMbps });
}
