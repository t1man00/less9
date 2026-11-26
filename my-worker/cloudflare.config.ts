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
	},
});
