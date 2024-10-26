import { NextResponse } from "next/server";
import { createFiles } from "../utils/creator";

// простой сервер для обработки get и post запросов
export async function POST(request: Request) {
  const { dir } = await request.json(); // Получаем директорию из запроса
  await createFiles(dir); // Создаем файлы в указанной директории
  return NextResponse.json({ message: "Файлы успешно созданы!" }); // Возвращаем ответ
}