export async function GET() {
  // Создаем буфер размером 1 МБ вместо большего размера
  const buffer = Buffer.alloc(1 * 1024 * 1024, 'x');
  
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store'
    }
  });
}
