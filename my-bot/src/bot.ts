// Telegram-бот «Promise-лаборатория». Перенесён из less7/bot.ts.
// Здесь только то, что бот отвечает. Приём сообщений (webhook) — в index.ts.

import {
	ALMATY,
	compareCitiesAll,
	compareCitiesSettled,
	geocode,
	getDashboard,
	getRates,
	getWeather,
	raceRates,
	rejectAfter,
	sleep,
	weatherByCity,
	withTimeout,
} from "./dashboard.ts";
import type { CallTelegram, Keyboard, TgCallback, TgMessage, TgUpdate } from "./telegram.ts";

// Ожидание ответа на вопрос. В worker это Durable Object, в тестах — подделка
export interface Questions {
	waitForAnswer(id: string, ms: number): Promise<boolean | null>;
	answer(id: string, value: boolean): Promise<boolean>;
}

export interface BotContext {
	telegram: CallTelegram;
	questions: (chatId: number) => Questions;
}

// Сколько городов можно сравнить за раз: у worker ограничено число запросов наружу
const MAX_CITIES = 10;
const ANSWER_TIMEOUT_MS = 15_000;

async function sendMessage(
	bot: BotContext,
	chatId: number,
	text: string,
	keyboard?: Keyboard,
): Promise<void> {
	await bot.telegram("sendMessage", { chat_id: chatId, text, reply_markup: keyboard });
}

const fmt = (n: number | null | undefined) => (n == null ? "нет данных" : n.toFixed(2));

// ---------- Меню ----------

const MENU: Keyboard = {
	inline_keyboard: [
		[
			{ text: "📊 allSettled: дашборд", callback_data: "dashboard" },
			{ text: "🥇 any: курс", callback_data: "any" },
		],
		[
			{ text: "🏁 race: гонка", callback_data: "race" },
			{ text: "⚡ resolve: кэш", callback_data: "cache" },
		],
		[
			{ text: "📦 all vs allSettled", callback_data: "allsettled" },
			{ text: "🚫 reject / try", callback_data: "reject" },
		],
		[
			{ text: "🧱 then/catch/finally", callback_data: "chain" },
			{ text: "🙋 withResolvers: вопрос", callback_data: "ask" },
		],
		[{ text: "🧅 Матрёшка: порядок выполнения", callback_data: "matryoshka" }],
	],
};

export const COMMANDS = [
	{ command: "menu", description: "Меню с вариантами Promise" },
	{ command: "ask", description: "Вопрос Да/Нет (withResolvers)" },
	{ command: "help", description: "Что умеет бот" },
];

const HELP =
	"Привет! Я Promise-лаборатория 🧪\n" +
	"Жми кнопки — каждая показывает один вариант Promise на живых данных (погода и курсы валют).\n\n" +
	"А ещё я понимаю обычные сообщения:\n" +
	"• напиши город, например «Москва» — пришлю погоду\n" +
	"• «курс» — курс доллара от самого быстрого источника\n" +
	"• «сравни Москва Париж Лондон» — погода сразу в нескольких городах\n" +
	"• отправь геопозицию 📍 — погода в твоей точке\n" +
	"• /ask — вопрос Да/Нет, который ждёт твой клик\n" +
	"• /menu — показать меню снова";

// ---------- Демонстрации (каждая возвращает готовый текст) ----------

async function demoDashboard(): Promise<string> {
	const d = await getDashboard();
	return [
		"📊 Promise.allSettled — ждёт оба запроса, даже если один упал",
		"",
		...d.errors.map((e) => `❌ ${e}`),
		`🌤 ${d.city}: ${d.temperature ?? "нет данных"} °C, ветер ${d.wind ?? "нет данных"} км/ч`,
		`💱 1 USD = ${fmt(d.usdToKzt)} KZT (источник: ${d.rateSource ?? "—"})`,
		`💱 1 EUR = ${fmt(d.eurToKzt)} KZT, 1 RUB = ${fmt(d.rubToKzt)} KZT`,
	].join("\n");
}

async function demoAny(): Promise<string> {
	const ok = await getRates({ fresh: true, broken: "one" });
	const allDead = await getRates({ fresh: true, broken: "all" }).then(
		() => "не упал (странно)",
		(err: Error) => err.message,
	);
	return [
		"🥇 Promise.any — первый УСПЕШНЫЙ, ошибки молча пропускает",
		"",
		`Источников 4 (один сломан). Победил ${ok.source} за ${ok.ms} мс: 1 USD = ${fmt(ok.rates["KZT"])} KZT`,
		"",
		`Если сломаны все: ${allDead}`,
		"",
		"Отличие от race: race засчитывает и ошибку, any ждёт именно успех.",
	].join("\n");
}

async function demoRace(): Promise<string> {
	const winner = await raceRates();
	const timeout = await withTimeout(getWeather(ALMATY), 1, "open-meteo").then(
		() => "успела (странно)",
		(err: Error) => err.message,
	);
	const fastError = await Promise.race([
		rejectAfter(5, "быстрая ошибка"),
		sleep(300).then(() => "успех"),
	]).then(
		(v) => v,
		(err: Error) => `race отклонён: «${err.message}»`,
	);
	return [
		"🏁 Promise.race — побеждает ПЕРВЫЙ завершившийся (и успех, и ошибка)",
		"",
		`Гонка источников: победил ${winner.source} за ${winner.ms} мс (1 USD = ${fmt(winner.rates["KZT"])} KZT)`,
		`Таймаут: ${timeout}`,
		`Быстрая ошибка против медленного успеха: ${fastError}`,
	].join("\n");
}

async function demoCache(): Promise<string> {
	const first = await getRates({ fresh: true });
	const second = await getRates();
	return [
		"⚡ Promise.resolve — готовый ответ без ожидания",
		"",
		`1-й запрос: ${first.source}, ${first.ms} мс (сеть)`,
		`2-й запрос: ${second.source}, ${second.ms} мс, из кэша: ${second.fromCache}`,
		"",
		"Функция getRates видит свежий кэш и возвращает Promise.resolve(значение): сети нет, но снаружи это такой же Promise, и await работает так же.",
	].join("\n");
}

async function demoAllVsSettled(): Promise<string> {
	const good = ["Алматы", "Астана", "Шымкент"];
	const bad = ["Алматы", "Нарния", "Астана"];
	const t = Date.now();
	const ok = await compareCitiesAll(good);
	const okMs = Date.now() - t;
	const failed = await compareCitiesAll(bad).then(
		() => "не упал (странно)",
		(err: Error) => err.message,
	);
	const settled = await compareCitiesSettled(bad);
	return [
		"📦 Promise.all против 🧾 Promise.allSettled",
		"",
		`all, города ${good.join(", ")} (параллельно, ${okMs} мс):`,
		...ok.map((c) => `  ${c.place.name}: ${c.weather.current.temperature_2m} °C`),
		"",
		`all, города ${bad.join(", ")}: ОШИБКА целиком — «${failed}»`,
		"",
		"allSettled на тех же городах:",
		...settled.map((r, i) =>
			r.status === "fulfilled"
				? `  ✅ ${bad[i]}: ${r.value.weather.current.temperature_2m} °C`
				: `  ❌ ${bad[i]}: ${(r.reason as Error).message}`,
		),
	].join("\n");
}

async function demoReject(): Promise<string> {
	const message = (e: Error) => e.message;
	const short = await geocode("а").then((p) => p.name, message);
	const unknown = await geocode("Нарния🦁").then((p) => p.name, message);
	const parsed = await Promise.try(() => JSON.parse("{плохой json") as unknown).then(
		() => "разобрал (странно)",
		(e: Error) => `${e.name} → reject`,
	);
	const manual = await Promise.reject<string>(new Error("отказ вручную")).catch(
		(e: Error) => `поймал «${e.message}»`,
	);
	return [
		"🚫 Promise.reject и Promise.try",
		"",
		`geocode("а"): ${short}`,
		`geocode("Нарния🦁"): ${unknown}`,
		`Promise.try(JSON.parse): ${parsed}`,
		`Promise.reject(...): ${manual}`,
		"",
		"Во всех случаях ошибка не ломает бота: её ловит .catch, и пользователь видит понятный текст.",
	].join("\n");
}

async function demoChain(): Promise<string> {
	const okLog: string[] = [];
	const badLog: string[] = [];
	const [okText, badText] = await Promise.all([
		weatherByCity("Астана", okLog),
		weatherByCity("Нарния🦁", badLog),
	]);
	return [
		"🧱 then / catch / finally",
		"",
		"Успешная цепочка («Астана»):",
		...okLog.map((s, i) => `  ${i + 1}) ${s}`),
		`  Итог: ${okText}`,
		"",
		"Цепочка с ошибкой («Нарния»):",
		...badLog.map((s, i) => `  ${i + 1}) ${s}`),
		`  Итог: ${badText}`,
		"",
		"Ошибка пропускает все then и попадает в catch; finally выполняется всегда.",
	].join("\n");
}

async function demoMatryoshka(): Promise<string> {
	const log: string[] = [];
	const add = (s: string) => log.push(`${log.length + 1}. ${s}`);

	add("СИНХРОННО: начало");
	setTimeout(() => add("МАКРОтаска: setTimeout(…, 0)"), 0);
	const chain = Promise.resolve()
		.then(() => {
			add("микротаска: then #1");
		})
		.then(() => {
			add("микротаска: then #2");
		});
	const inner = (async () => {
		add("СИНХРОННО: тело async-функции до первого await");
		// Ждём уже выполненный промис: всё ниже всё равно станет микротаской
		await Promise.resolve();
		add("микротаска: продолжение после await");
	})();
	add("СИНХРОННО: конец");
	await Promise.all([chain, inner]);
	await sleep(20);

	const flat = await Promise.resolve(1)
		.then((x) => Promise.resolve(x + 1))
		.then((x) => Promise.resolve(x + 1));

	return [
		"🧅 Матрёшка Promise: порядок выполнения",
		"",
		...log,
		"",
		"Правило: синхронный код → ВСЕ микротаски (then/await) → макротаски (setTimeout).",
		`Сплющивание: 1 → then(промис) → then(промис) = ${flat}, а не Promise в Promise в Promise.`,
	].join("\n");
}

const DEMOS: Record<string, () => Promise<string>> = {
	dashboard: demoDashboard,
	any: demoAny,
	race: demoRace,
	cache: demoCache,
	allsettled: demoAllVsSettled,
	reject: demoReject,
	chain: demoChain,
	matryoshka: demoMatryoshka,
};

// ---------- Живой вопрос ----------

async function askQuestion(bot: BotContext, chatId: number): Promise<void> {
	// Случайный id: счётчик в памяти в Workers не годится
	const id = crypto.randomUUID();
	// Начинаем ждать ДО отправки вопроса, чтобы быстрый клик не потерялся.
	// Результат превращаем в значение сразу, чтобы ошибка не осталась без обработчика.
	const waiting = bot
		.questions(chatId)
		.waitForAnswer(id, ANSWER_TIMEOUT_MS)
		.then(
			(answer) => ({ answer }),
			(error: Error) => ({ error }),
		);

	await sendMessage(bot, chatId, "Показать курс доллара? У тебя 15 секунд ⏳", {
		inline_keyboard: [
			[
				{ text: "✅ Да", callback_data: `ask:${id}:yes` },
				{ text: "❌ Нет", callback_data: `ask:${id}:no` },
			],
		],
	});

	const result = await waiting;
	if ("error" in result) {
		await sendMessage(bot, chatId, `⚠️ ${result.error.message}`);
	} else if (result.answer === null) {
		await sendMessage(bot, chatId, "⌛ время вышло, ты не ответил");
	} else if (result.answer) {
		const text = await getRates().then(
			(r) => `💱 1 USD = ${fmt(r.rates["KZT"])} KZT (источник: ${r.source})`,
			(err: Error) => `⚠️ ${err.message}`,
		);
		await sendMessage(bot, chatId, text);
	} else {
		await sendMessage(bot, chatId, "Окей, не показываю 🙂");
	}
}

// ---------- Нажатие на кнопку ----------

async function handleCallback(bot: BotContext, cb: TgCallback): Promise<void> {
	const data = cb.data ?? "";
	const chatId = cb.message?.chat.id;
	if (chatId === undefined) return;

	const toast = (text?: string) =>
		bot.telegram("answerCallbackQuery", { callback_query_id: cb.id, text });

	// Ответ на вопрос из /ask: "ask:<id>:yes|no"
	if (data.startsWith("ask:")) {
		const [, id = "", answer] = data.split(":");
		const accepted = await bot.questions(chatId).answer(id, answer === "yes");
		await toast(accepted ? "Принято!" : "Вопрос уже закрыт");
		return;
	}

	if (data === "ask") {
		await toast();
		await askQuestion(bot, chatId);
		return;
	}

	const demo = Object.hasOwn(DEMOS, data) ? DEMOS[data] : undefined;
	if (!demo) {
		await toast("Неизвестная кнопка");
		return;
	}
	await toast("Считаю…");
	const text = await demo().catch((err: Error) => `⚠️ Демонстрация не удалась: ${err.message}`);
	await sendMessage(bot, chatId, text, MENU);
}

// ---------- Обычное сообщение ----------

async function handleMessage(bot: BotContext, msg: TgMessage): Promise<void> {
	const chatId = msg.chat.id;

	if (msg.location) {
		const place = { name: "твоя точка", lat: msg.location.latitude, lon: msg.location.longitude };
		const text = await getWeather(place).then(
			(w) =>
				`📍 В твоей точке: ${w.current.temperature_2m} °C, ветер ${w.current.wind_speed_10m} км/ч`,
			(err: Error) => `⚠️ ${err.message}`,
		);
		await sendMessage(bot, chatId, text);
		return;
	}

	const text = (msg.text ?? "").trim();
	if (!text) return;
	const lower = text.toLowerCase();

	if (lower.startsWith("/start") || lower.startsWith("/menu") || lower.startsWith("/help")) {
		await sendMessage(bot, chatId, HELP, MENU);
		return;
	}
	if (lower.startsWith("/ask")) {
		await askQuestion(bot, chatId);
		return;
	}
	if (lower.startsWith("/")) {
		await sendMessage(bot, chatId, "Не знаю такую команду. Попробуй /menu", MENU);
		return;
	}

	if (/^(привет|здравствуй|hi|hello|хай)/.test(lower)) {
		await sendMessage(bot, chatId, HELP, MENU);
		return;
	}

	if (lower.startsWith("сравни")) {
		const names = text
			.split(/[\s,]+/)
			.slice(1)
			.filter(Boolean);
		if (names.length < 2) {
			await sendMessage(bot, chatId, "Напиши минимум два города: «сравни Москва Париж»");
			return;
		}
		if (names.length > MAX_CITIES) {
			await sendMessage(bot, chatId, `Можно сравнить не больше ${MAX_CITIES} городов за раз`);
			return;
		}
		const results = await compareCitiesSettled(names);
		const lines = results.map((r, i) =>
			r.status === "fulfilled"
				? `${r.value.place.name}: ${r.value.weather.current.temperature_2m} °C`
				: `${names[i]}: ❌ ${(r.reason as Error).message}`,
		);
		await sendMessage(bot, chatId, ["🌍 Сравнение городов", ...lines].join("\n"));
		return;
	}

	if (/(курс|валют|доллар|usd|тенге)/.test(lower)) {
		const answer = await getRates().then(
			(r) =>
				`💱 1 USD = ${fmt(r.rates["KZT"])} KZT\n(источник: ${r.source}${r.fromCache ? ", из кэша" : `, ${r.ms} мс`})`,
			(err: Error) => `⚠️ ${err.message}`,
		);
		await sendMessage(bot, chatId, answer);
		return;
	}

	// Любой другой текст считаем названием города
	await sendMessage(bot, chatId, await weatherByCity(text));
}

export async function handleUpdate(bot: BotContext, update: TgUpdate): Promise<void> {
	if (update.callback_query) await handleCallback(bot, update.callback_query);
	else if (update.message) await handleMessage(bot, update.message);
}
