// Вход worker. Вместо цикла getUpdates Telegram сам присылает события на /webhook.
import { env } from "cloudflare:workers";
import { COMMANDS, handleUpdate, type BotContext } from "./bot.ts";
import { createTelegram, type TgUpdate } from "./telegram.ts";

export { QuestionBox } from "./question-box.ts";

// Токен — секрет Worker. Его добавляют в панели Cloudflare, в коде и в git его нет.
// Мы не объявляем его в cloudflare.config.ts, чтобы первый деплой прошёл без секрета.
function getToken(): string | undefined {
	const { TELEGRAM_BOT_TOKEN } = env as { TELEGRAM_BOT_TOKEN?: string };
	return TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

// Пароль webhook. Telegram присылает его в заголовке, и так мы отличаем Telegram от посторонних.
// Он вычисляется из токена, поэтому второй секрет заводить не нужно.
async function webhookSecret(token: string): Promise<string> {
	const bytes = new TextEncoder().encode(`webhook:${token}`);
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
	return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameSecret(received: string, expected: string): boolean {
	const a = new TextEncoder().encode(received);
	const b = new TextEncoder().encode(expected);
	// Сравнение за постоянное время, чтобы пароль нельзя было подобрать по задержке
	return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

async function handleWebhook(
	request: Request,
	token: string,
	ctx: ExecutionContext,
): Promise<Response> {
	const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
	if (!sameSecret(received, await webhookSecret(token))) {
		console.warn({ event: "webhook_forbidden" });
		return new Response("Forbidden", { status: 403 });
	}

	let update: TgUpdate;
	try {
		update = await request.json<TgUpdate>();
	} catch {
		return new Response("Bad request", { status: 400 });
	}

	const bot: BotContext = {
		telegram: createTelegram(token),
		// Один объект на чат
		questions: (chatId) => ctx.exports.QuestionBox.getByName(String(chatId)),
	};

	// В логи пишем только тип события и время: без текста сообщений и номеров чатов
	const kind = update.callback_query ? "button" : update.message ? "message" : "other";
	const startedAt = Date.now();

	// ВАЖНО: отвечаем Telegram сразу, а сообщение обрабатываем «в фоне».
	// Иначе вопрос /ask ждал бы клик, пока Telegram ждёт ответ на предыдущий запрос.
	ctx.waitUntil(
		handleUpdate(bot, update).then(
			() => {
				console.log({ event: "update_handled", kind, durationMs: Date.now() - startedAt });
			},
			(err: unknown) => {
				console.error({
					event: "update_failed",
					kind,
					durationMs: Date.now() - startedAt,
					error: err instanceof Error ? err.message : String(err),
				});
			},
		),
	);
	return new Response("OK");
}

// Подключает webhook к адресу этого worker. Повторный вызов ничего не ломает:
// адрес всегда берётся из самого запроса, а токен наружу не отдаётся.
async function setupWebhook(request: Request, token: string): Promise<Response> {
	const telegram = createTelegram(token);
	const url = `${new URL(request.url).origin}/webhook`;
	try {
		const me = await telegram<{ username: string }>("getMe", {});
		await telegram("setWebhook", {
			url,
			secret_token: await webhookSecret(token),
			allowed_updates: ["message", "callback_query"],
		});
		await telegram("setMyCommands", { commands: COMMANDS });
		const info = await telegram<{
			url: string;
			pending_update_count: number;
			last_error_message?: string;
		}>("getWebhookInfo", {});
		return Response.json({
			ok: true,
			bot: me.username,
			webhook: info.url,
			pendingUpdates: info.pending_update_count,
			lastError: info.last_error_message ?? null,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		console.error({ event: "setup_failed", error: message });
		return Response.json({ ok: false, error: message }, { status: 502 });
	}
}

export default {
	fetch(request, _env, ctx) {
		const { pathname } = new URL(request.url);
		const token = getToken();

		if (request.method === "GET" && pathname === "/") {
			return Response.json({ ok: true, tokenConfigured: token !== undefined });
		}

		const isRoute = pathname === "/webhook" || pathname === "/setup";
		if (request.method !== "POST" || !isRoute) {
			return new Response("Not found", { status: 404 });
		}
		if (!token) {
			return new Response("TELEGRAM_BOT_TOKEN secret is not set", { status: 503 });
		}

		return pathname === "/setup"
			? setupWebhook(request, token)
			: handleWebhook(request, token, ctx);
	},
} satisfies ExportedHandler;
