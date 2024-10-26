import fs from "fs";
import path from "path";

// функция которая создает папку и файлы в ней размером: 1 мб, 3 мб, 5 мб
export const createFiles = async (dir: string) => {
  const sizes = [1, 3, 5]; // Размеры файлов в МБ
  await fs.promises.mkdir(dir, { recursive: true }); // Создаем папку

  for (const size of sizes) {
    const filePath = path.join(dir, `${size}mb_file.txt`);
    const fileContent = "0".repeat(size * 1024 * 1024); // Создаем контент файла
    await fs.promises.writeFile(filePath, fileContent); // Записываем файл
  }
};

// функция которая очищает папку и удаляет файлы в ней
export const clearDirectory = async (dir: string) => {
  const files = await fs.promises.readdir(dir); // Читаем содержимое директории
  const deletePromises = files.map((file) => {
    const filePath = path.join(dir, file);
    return fs.promises.unlink(filePath); // Удаляем файл
  });
  await Promise.all(deletePromises); // Ждем завершения всех операций удаления
  await fs.promises.rmdir(dir); // Удаляем саму директорию
};
