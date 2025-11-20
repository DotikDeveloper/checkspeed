const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store'
} as const;

export async function HEAD() {
  return new Response(null, {
    status: 204,
    headers: NO_STORE_HEADERS
  });
}

export async function GET() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/json'
    }
  });
}
