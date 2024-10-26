import { NextResponse } from 'next/server'; // Импортируем NextResponse

export async function POST(req: Request) { // Обрабатываем POST-запрос
  try {
    const body = await req.text(); // Получаем тело запроса как текст

    // Предположим, что вы хотите узнать размер загруженных данных
    const uploadedBytes = Buffer.byteLength(body); // Подсчитываем байты

    return NextResponse.json({ uploadedBytes }); // Возвращаем JSON-ответ
  } catch (error) {
    console.error(error); // Логируем ошибку для отладки
    return NextResponse.json({ error: 'Ошибка при обработке запроса' }, { status: 500 }); // Обработка ошибок
  }
}
