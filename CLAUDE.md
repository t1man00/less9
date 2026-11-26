# less9: проект my-worker

SPA с курсами доллара, евро и тенге на Cloudflare Workers: чистый TypeScript, CLI `cf` 1.0.0-rc.6, Vite+.

## Команды (из папки `my-worker`)

- `npm run dev` — локальный сервер
- `npm run check` — типы, линт, форматирование
- `npm run format` — исправить форматирование
- `npm run test` — тесты
- `npm run build` — сборка
- `npx cf deploy` — публикация

## Структура

- `src/index.ts` — worker: `/api/rates` (кэш на час, 502 при сбое источника), остальные `/api/*` отвечают 404
- `index.html`, `client/` — фронтенд: роутер на History API, разделы `/` (курсы), `/converter`, `/about`
- `client/rates.ts` — типы, загрузка курсов, пересчёт и форматирование
- `client/tsconfig.json` — отдельные настройки с типами DOM для браузерного кода
- `cloudflare.config.ts` — `notFoundHandling: "single-page-application"`, `runWorkerFirst: ["/api/*"]`
- `test/index.test.ts` — тесты API с заглушкой источника; `Response` в заглушке создаётся через `mockImplementation`
- `.claude/launch.json` (в `less9`) — предпросмотр из приложения Claude

## Источник курсов

`https://open.er-api.com/v6/latest/USD`: без ключа, обновляется раз в день. Условия требуют ссылку «Rates By Exchange Rate API» (она в подвале сайта).

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
