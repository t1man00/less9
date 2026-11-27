# less9: проект my-worker

SPA с погодой в Алматы и курсами валют на Cloudflare Workers: чистый TypeScript, CLI `cf` 1.0.0-rc.6, Vite+.

## Команды (из папки `my-worker`)

- `npm run dev` — локальный сервер
- `npm run check` — типы, линт, форматирование
- `npm run format` — исправить форматирование
- `npm run test` — тесты
- `npm run build` — сборка
- `npx cf deploy` — публикация

## Структура

- `src/index.ts` — worker: `/api/dashboard` берёт погоду и курсы одновременно через `Promise.all` (как в ДЗ `lesson8-usd-weather`); если упал любой запрос — 502. Остальные `/api/*` отвечают 404
- `src/dashboard-types.ts` — тип ответа `/api/dashboard`, общий для worker и фронтенда
- `index.html`, `client/` — фронтенд: роутер на History API, разделы `/` (погода и курсы), `/converter`, `/about`
- `client/rates.ts` — загрузка данных, пересчёт и форматирование
- `client/tsconfig.json` — отдельные настройки с типами DOM для браузерного кода
- `cloudflare.config.ts` — `notFoundHandling: "single-page-application"`, `runWorkerFirst: ["/api/*"]`
- `test/index.test.ts` — тесты API с заглушкой источника; `Response` в заглушке создаётся через `mockImplementation`
- `.claude/launch.json` (в `less9`) — предпросмотр из приложения Claude

## Источники

- Курсы: `https://open.er-api.com/v6/latest/USD`, без ключа, обновляется раз в день, кэш на час. Нужна ссылка «Rates By Exchange Rate API».
- Погода: `https://api.open-meteo.com/v1/forecast` (текущая, Алматы), без ключа, кэш на 10 минут. Нужна ссылка на Open-Meteo.

Обе ссылки стоят в подвале сайта.

## Второй Worker: my-bot (Telegram-бот)

Перенесён из `less7/bot.ts` и `less7/dashboard.ts` на webhook. Команды npm те же, из папки `my-bot`.

- `src/index.ts` — `GET /` (задан ли токен), `POST /webhook` (проверка секретного заголовка, обработка через `ctx.waitUntil`), `POST /setup` (подключает webhook и команды)
- `src/bot.ts`, `src/dashboard.ts`, `src/telegram.ts` — ответы бота, данные, Telegram API
- `src/question-box.ts` — Durable Object для вопроса `/ask`, по одному на чат
- Секрет `TELEGRAM_BOT_TOKEN` пользователь добавляет в панели Cloudflare. В код, git и переписку токен не попадает. Пароль webhook вычисляется из токена
- Деплой: автоматически через Workers Builds после push в `main`, если менялись файлы в `my-bot/` (Root directory `my-bot`, preview-сборки выключены, команды сборки и деплоя как у `my-worker`). Поэтому пушить в `main` — только по просьбе пользователя
- Адрес: https://my-bot.t1man-0015.workers.dev
- 27.11.2026 webhook подключён к @TTT_les9Bot, пользователь подтвердил, что бот отвечает. Секрет добавляется в панели с галочкой Secret; обычная переменная с тем же именем мешает создать секрет

## Observability

Настраивается только в `cloudflare.config.ts`: деплой перезаписывает то, что включено в панели.

- `my-worker`: логи (с invocation logs), трейсы и Issues, выборка 100%
- `my-bot`: логи и Issues. **Трейсы не включать:** они сохраняют `url.full` каждого fetch, а адрес Telegram API содержит токен
- Свои записи — объекты с полем `event`: `dashboard_failed`, `update_handled`, `update_failed`, `webhook_forbidden`, `setup_failed`. Не писать в логи токен, номера чатов и тексты сообщений

## История и состояние на 27.11.2026

1. Проект создан в `less7` командой `npx cf@latest init my-worker --package-manager npm`.
2. Выполнен вход в Cloudflare командой `npx cf auth login`.
3. Проект переделан в SPA и перенесён из `less7` в `less9`.
4. Добавлены курсы валют, конвертер и новый дизайн. Версия задеплоена: https://my-worker.t1man-0015.workers.dev

Деплой — только по просьбе пользователя.

## CI/CD: Cloudflare Workers Builds

GitHub Actions пользователю не нужен. Репозиторий подключается в панели Cloudflare (Worker `my-worker` → Settings → Builds); подключает сам пользователь. Подключён 27.11.2026.

| Настройка | Значение |
| --- | --- |
| Git branch | `main` |
| Root directory | `my-worker` |
| Build command | `npm run check && npm run test && npm run build` |
| Deploy command | `npx cf deploy --prebuilt --mode production` |
| Preview command | `npx cf previews deploy` |

После подключения каждый push в `main` деплоит сайт, поэтому пушить в `main` — только по просьбе пользователя. Версия npm зафиксирована в `packageManager`.

npm при установке предупреждал, что postinstall-скрипты `workerd` и `esbuild` не входят в `allowScripts`; они не разрешались.

Репозиторий на GitHub: `t1man00/less9`. В сообщения коммитов не добавлять строку `Co-Authored-By` про Claude.

Пользователь общается на русском.
