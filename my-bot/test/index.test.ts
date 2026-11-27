import { SELF } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// Ненастоящий токен: настоящий в тестах не нужен, запросы наружу подменяются
const TOKEN = "111:test-token";
const testEnv = env as { TELEGRAM_BOT_TOKEN?: string };

interface TelegramCall {
	method: string;
	body: Record<string, unknown>;
}

let calls: TelegramCall[] = [];

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Response {
	const url = input instanceof Request ? input.url : String(input);
	if (url.startsWith("https://api.telegram.org/")) {
		const method = url.split("/").at(-1) ?? "";
		calls.push({ method, body: JSON.parse(init?.body as string) as Record<string, unknown> });
		const results: Record<string, unknown> = {
			getMe: { username: "test_bot" },
			getWebhookInfo: { url: "https://example.com/webhook", pending_update_count: 0 },
		};
		return Response.json({ ok: true, result: results[method] ?? true });
	}
	if (url.includes("open.er-api.com")) {
		return Response.json({ result: "success", rates: { KZT: 450, EUR: 0.9, RUB: 90 } });
	}
	return new Response("not mocked", { status: 503 });
}

async function sha256(text: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendUpdate(update: object, secret?: string): Promise<Response> {
	return SELF.fetch("https://example.com/webhook", {
		method: "POST",
		headers: {
			"X-Telegram-Bot-Api-Secret-Token": secret ?? (await sha256(`webhook:${TOKEN}`)),
		},
		body: JSON.stringify(update),
	});
}

const message = (text: string) => ({ update_id: 1, message: { chat: { id: 42 }, text } });

function sentTexts(): string[] {
	return calls.filter((c) => c.method === "sendMessage").map((c) => String(c.body.text));
}

beforeEach(() => {
	calls = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => fakeFetch(input, init));
});

afterEach(() => {
	vi.restoreAllMocks();
	delete testEnv.TELEGRAM_BOT_TOKEN;
});

describe("без секрета", () => {
	it("сообщает, что токен не задан", async () => {
		const response = await SELF.fetch("https://example.com/");
		expect(await response.json()).toEqual({ ok: true, tokenConfigured: false });
		expect((await sendUpdate(message("/menu"))).status).toBe(503);
		expect(calls).toHaveLength(0);
	});
});

describe("с секретом", () => {
	beforeEach(() => {
		testEnv.TELEGRAM_BOT_TOKEN = TOKEN;
	});

	it("не пускает запрос без правильного пароля webhook", async () => {
		const response = await sendUpdate(message("/menu"), "wrong");
		expect(response.status).toBe(403);
		expect(calls).toHaveLength(0);
	});

	it("отвечает на /menu меню с кнопками", async () => {
		expect((await sendUpdate(message("/menu"))).status).toBe(200);
		await vi.waitFor(() => expect(sentTexts()[0]).toContain("Promise-лаборатория"));
		expect(calls[0]?.body.reply_markup).toHaveProperty("inline_keyboard");
	});

	it("/ask: клик из второго запроса завершает ожидание первого", async () => {
		await sendUpdate(message("/ask"));
		await vi.waitFor(() => expect(sentTexts()).toHaveLength(1));

		const keyboard = calls[0]?.body.reply_markup as {
			inline_keyboard: { callback_data: string }[][];
		};
		const yes = keyboard.inline_keyboard[0]?.[0]?.callback_data;
		const click = {
			update_id: 2,
			callback_query: { id: "cb1", data: yes, message: { chat: { id: 42 } } },
		};
		await sendUpdate(click);

		await vi.waitFor(() => expect(sentTexts()[1]).toContain("1 USD = 450.00 KZT"), {
			timeout: 4000,
		});
		expect(calls.find((c) => c.method === "answerCallbackQuery")?.body.text).toBe("Принято!");
	});

	it("вопрос без ответа закрывается по таймауту", async () => {
		const box = exports.QuestionBox.getByName("timeout-test");
		expect(await box.waitForAnswer("q1", 20)).toBeNull();
		expect(await box.answer("q1", true)).toBe(false);
	});

	it("/setup подключает webhook на свой адрес и не раскрывает токен", async () => {
		const response = await SELF.fetch("https://example.com/setup", { method: "POST" });
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(text).not.toContain(TOKEN);
		const setWebhook = calls.find((c) => c.method === "setWebhook");
		expect(setWebhook?.body.url).toBe("https://example.com/webhook");
		expect(setWebhook?.body.secret_token).toBe(await sha256(`webhook:${TOKEN}`));
	});
});
