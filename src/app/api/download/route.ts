import { NextResponse } from 'next/server'; // Импортируем NextResponse

export async function GET(req: Request) { // Обрабатываем GET-запрос
  const response = NextResponse.json({ message: 'Download GET request' }); // Создаем JSON-ответ
  response.headers.set('Content-Type', 'application/octet-stream'); // Устанавливаем заголовок
  return response; // Возвращаем ответ
}
