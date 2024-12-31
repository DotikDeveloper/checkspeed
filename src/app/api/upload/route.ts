import { NextResponse } from "next/server"; // Импортируем NextResponse

export async function POST(request: Request) {
  // Обрабатываем POST-запрос
  try {
    // Читаем только первый 1 МБ данных
    const buffer = await request.arrayBuffer();
    const size = Math.min(buffer.byteLength, 1 * 1024 * 1024);
    
    return NextResponse.json({ size });
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
