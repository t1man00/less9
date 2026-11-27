import { defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "my-bot",
		compatibilityDate: "2026-11-23",
		entrypoint,
		// Durable Object для вопроса «Да/Нет»
		exports: {
			QuestionBox: exports.durableObject({ storage: "sqlite" }),
		},
		// Логи в панели Cloudflare, чтобы видеть ошибки бота
		observability: { enabled: true },
		// Отдельные адреса для версий боту не нужны
		previewUrls: false,
		// Секрет TELEGRAM_BOT_TOKEN добавляется в панели Cloudflare, здесь его нет
	},
});
