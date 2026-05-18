# CheckSpeed

**Версия:** 1.5.0

Веб-приложение для измерения скорости сетевого соединения (получение, отдача, ping). Подходит для проверки канала в интернете или во внутренней сети при развёртывании на собственном сервере.

**Демо:** https://checkspeed.vercel.app/

## Возможности

- измерение скорости **получения** и **отдачи** с несколькими размерами payload (2, 5, 8 МБ);
- **3 параллельных TCP-потока** на направление для насыщения быстрых каналов;
- расчёт **ping** (минимум успешных замеров);
- графики динамики и **10 итераций** с усреднением;
- индикатор **качества измерения** (стабильность и полнота серии);
- rate limiting API, защита от сжатия payload (случайные байты);
- деплой на **Vercel** или в **Docker**.

## Технологии

| Компонент | Версия |
|-----------|--------|
| Next.js (App Router) | 16 |
| React | 19 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Node.js | ^24 |

## Быстрый старт

```bash
git clone https://github.com/DotikDeveloper/checkspeed.git
cd checkspeed
npm install
npm run dev
```

Откройте http://localhost:3000 — измерение начнётся автоматически.

### Проверки качества

```bash
npm run lint   # ESLint
npm run test   # Vitest (40 тестов)
npm run build  # production-сборка
```

## Docker

```bash
docker build -t checkspeed .
docker run -p 3000:3000 checkspeed
```

Приложение: http://localhost:3000

## Документация

| Документ | Содержание |
|----------|------------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Структура проекта, слои, потоки данных |
| [docs/MEASUREMENT.md](./docs/MEASUREMENT.md) | Методика измерения, константы, агрегация |
| [docs/API.md](./docs/API.md) | HTTP API: download, upload, ping |
| [CHANGELOG.md](./CHANGELOG.md) | История версий |

## API (кратко)

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/api/download?size=<МБ>` | Бинарный payload 0,5–10 МБ |
| `POST` | `/api/upload` | Приём тела до 10 МБ, ответ `{ size }` |
| `HEAD` | `/api/ping` | Задержка (204) |

Лимит: **500 запросов/мин** на IP. Подробности — [docs/API.md](./docs/API.md).

## Деплой

### Vercel

```bash
npm run build
npm run lint
git push origin master
```

После push Vercel выполняет автоматический деплой.

### Собственный сервер

Соберите production-образ или выполните `npm run build && npm run start` за reverse-proxy (nginx, Caddy) с TLS.

## Версионирование

- номер версии — в `package.json`;
- история — [CHANGELOG.md](./CHANGELOG.md);
- релиз: `npm version minor` (или `patch` / `major`) и push с тегами.

## Вклад в проект

См. [CONTRIBUTING.md](./CONTRIBUTING.md).

## Лицензия

MIT — [LICENSE](./LICENSE).
