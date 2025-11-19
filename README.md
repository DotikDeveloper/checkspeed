# CheckSpeed Application

Веб-приложение для измерения скорости интернет-соединения, построенное на современном стеке Next.js 16 + React 19. Актуальная версия доступна по адресу **https://checkspeed.vercel.app/**.

## Возможности

- измерение скорости загрузки и отдачи данных;
- вычисление текущего ping;
- отображение динамики измерений на графиках и расчёт средней скорости;
- готовность к деплою и на Vercel, и в Docker-контейнерах.

## Технологии

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS
- Docker

## Деплой

Проект развёрнут на Vercel: https://checkspeed.vercel.app/.

При публикации новой версии:

```bash
npm run build       # убедиться, что build проходит локально
npm run lint        # проверить качество кода
git push            # после пуша Vercel автоматически инициирует деплой
```

## Быстрый старт

```bash
git clone <repo>
cd checkspeed
npm install
npm run dev
```

### Проверки качества

```bash
npm run lint   # ESLint (flat-config на базе eslint-config-next)
npm run build  # production-сборка Next.js
```

## Запуск в Docker

```bash
docker build -t checkspeed .
docker run -p 3000:3000 checkspeed
```

После запуска контейнера приложение доступно на `http://localhost:3000`.

## Версионирование

- текущая версия хранится в `package.json`;
- история изменений описывается в [CHANGELOG.md](./CHANGELOG.md);
- для выпуска новой версии используйте `npm version <patch|minor|major>` — команда обновит номер версии и создаст Git-тег.

## Вклад в проект

Мы приветствуем вклад в развитие проекта. Перед созданием pull request ознакомьтесь с [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

Проект распространяется под лицензией MIT. Полный текст доступен в файле [LICENSE](LICENSE).
