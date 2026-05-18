# Архитектура CheckSpeed

## Обзор

CheckSpeed — одностраничное Next.js-приложение (App Router). Клиент в браузере инициирует HTTP-запросы к API-маршрутам того же origin; сервер отдаёт синтетические данные (download) или потребляет тело (upload).

```text
┌─────────────┐     HEAD/GET/POST      ┌──────────────────────────┐
│  page.tsx   │ ──────────────────────►│  /api/ping               │
│  (React UI) │                        │  /api/download           │
│             │ ◄──────────────────────│  /api/upload             │
└──────┬──────┘                        └────────────┬─────────────┘
       │                                            │
       │ imports                                    │ BufferPool,
       ▼                                            │ randomFillSync
┌─────────────────────┐                    ┌───────▼────────┐
│ checkspeed.client.ts│                    │  src/proxy.ts  │
│ stats.ts, logger.ts │                    │  (rate limit)  │
└─────────────────────┘                    └────────────────┘
```

## Структура репозитория

```text
src/
├── app/
│   ├── page.tsx              # UI: графики, 10 итераций, качество
│   ├── layout.tsx, globals.css
│   └── api/
│       ├── download/route.ts # GET — синтетический бинарный ответ
│       ├── upload/route.ts   # POST — подсчёт принятых байт
│       ├── ping/route.ts     # HEAD/GET — latency
│       └── utils/
│           └── buffer-pool.ts
├── utils/
│   ├── checkspeed.client.ts  # Логика speedtest (клиент)
│   ├── stats.ts              # median, IQR, average
│   └── logger.ts
└── proxy.ts                  # Rate limiting для /api/*
docs/                         # Документация
```

## Слои

### Presentation (`page.tsx`)

- При монтировании и по кнопке запускает серию из **10** измерений.
- Ping — **один раз** в начале сессии.
- Каждая итерация: `testDownloadSpeed()` → `testUploadSpeed()`.
- Нулевые результаты (rate limit) не попадают в средние.
- Компонент `SpeedChart` — SVG-график динамики.

### Domain (`checkspeed.client.ts`)

Содержит константы теста, измерение потоков, агрегацию и публичный API для UI/тестов. Файл помечен `"use client"` — выполняется только в браузере.

### API routes

| Маршрут | Runtime | Особенности |
|---------|---------|-------------|
| `download` | Node | Пул буферов, копия перед `Response`, случайные байты |
| `upload` | Node | Потоковое чтение тела, сверка с `Content-Length` |
| `ping` | Edge-совместимый | Минимальный ответ 204 |

### Cross-cutting (`proxy.ts`)

Next.js 16 **proxy** (ранее middleware): проверка лимита до обработчика route. In-memory store (на нескольких инстансах лимит не общий — для production рекомендуется Redis).

## Поток данных download

1. Клиент делит `sizeMb` на 3 части.
2. Три параллельных `fetch` + `ReadableStream` reader.
3. Каждый поток возвращает `TransferSample` (байты, метки времени).
4. `aggregateParallelTransferSpeed` → Mbps для попытки.

## Поток данных upload

1. `createUploadPayload(sizeMb)` — нулевой `Uint8Array` (браузер всё равно отправляет байты).
2. Три параллельных XHR с частями payload.
3. Агрегация аналогична download.

## Тестирование

- **Vitest** + **jsdom**: `src/utils/checkspeed.test.ts`, `src/app/api/upload/route.test.ts`.
- Моки `fetch`, `XMLHttpRequest`, `performance.now`.
- Coverage (vitest): `src/utils/**/*`.

## Деплой

| Среда | Команда / URL |
|-------|----------------|
| Vercel | `git push` → автодеплой, https://checkspeed.vercel.app/ |
| Docker | `docker build` / `docker run -p 3000:3000` |
| Локально | `npm run dev` → http://localhost:3000 |

**Node.js:** `^24.0.0` (см. `engines` в `package.json`, образ `node:24-alpine` в Dockerfile).

## Расширения (заготовки)

- `findNearestServer()` — выбор сервера по минимальному ping среди списка.
- Multi-origin потребует CORS и абсолютные URL в `checkspeed.client.ts`.

Подробнее: [MEASUREMENT.md](./MEASUREMENT.md), [API.md](./API.md).
