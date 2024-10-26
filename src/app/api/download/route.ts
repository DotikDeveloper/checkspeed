export async function GET(req: Request) {
  // Обрабатываем GET-запрос
  const sizeInMB = 5; // Размер файла в МБ
  const fileContent = new Uint8Array(sizeInMB * 1024 * 1024).fill(97); // Создаем массив размером 5 МБ
  const response = new Response(fileContent, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": fileContent.byteLength.toString(), // Преобразуем в строку
    },
  });
  return response; // Возвращаем ответ с данными
}
