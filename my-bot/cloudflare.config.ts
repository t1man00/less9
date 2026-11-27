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
		observability: {
			enabled: true,
			// Логи: запись о каждом вызове worker и всё, что пишет console
			logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
			// ТРЕЙСЫ НЕ ВКЛЮЧАТЬ: они сохраняют полный адрес каждого fetch (url.full),
			// а адрес Telegram API содержит токен бота
			traces: { enabled: false },
			// Issues: группирует ошибки и ответы 5xx
			issues: { enabled: true },
		},
		// Отдельные адреса для версий боту не нужны
		previewUrls: false,
		// Секрет TELEGRAM_BOT_TOKEN добавляется в панели Cloudflare, здесь его нет
	},
});
