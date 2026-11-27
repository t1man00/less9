import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "my-worker",
		compatibilityDate: "2026-11-23",
		entrypoint,
		assets: {
			// Unknown paths get index.html, so client-side routes survive a reload.
			notFoundHandling: "single-page-application",
			// The API always goes to the Worker, even for browser navigations.
			runWorkerFirst: ["/api/*"],
		},
		observability: {
			enabled: true,
			// Логи: запись о каждом вызове worker и всё, что пишет console
			logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
			// Трейсы: сколько занял каждый запрос к погоде и курсам
			traces: { enabled: true, headSamplingRate: 1 },
			// Issues: группирует ошибки и ответы 5xx
			issues: { enabled: true },
		},
	},
});
