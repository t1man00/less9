import type { Dashboard } from "./dashboard-types.ts";

// Оба источника бесплатные, без ключа. Оба требуют ссылку на себя (она в подвале сайта).
// Погода в Алматы: open-meteo, время просим в секундах Unix.
const WEATHER_URL =
	"https://api.open-meteo.com/v1/forecast?latitude=43.24&longitude=76.89&current=temperature_2m,wind_speed_10m&timeformat=unixtime";
// Курсы относительно доллара: open.er-api.com, обновляются раз в день.
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

interface Weather {
	current?: {
		time?: number;
		temperature_2m?: number;
		wind_speed_10m?: number;
	};
}

interface Rates {
	result?: string;
	time_last_update_unix?: number;
	rates?: Record<string, number>;
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
	return isNumber(value) && value > 0;
}

async function getJson<T>(url: string, label: string, cacheSeconds: number): Promise<T> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(8000),
		// Успешные ответы кэшируем, ошибки — никогда.
		cf: {
			cacheTtlByStatus: { "200-299": cacheSeconds, "300-599": 0 },
			cacheEverything: true,
		},
	});
	if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
	return await response.json<T>();
}

async function getWeather() {
	const data = await getJson<Weather>(WEATHER_URL, "Погода", 600);
	const { time, temperature_2m: temperature, wind_speed_10m: wind } = data.current ?? {};
	if (!isPositive(time) || !isNumber(temperature) || !isNumber(wind)) {
		throw new Error("Погода: неожиданный ответ");
	}
	return { time, temperature, wind };
}

async function getRates() {
	const data = await getJson<Rates>(RATES_URL, "Курсы", 3600);
	const kzt = data.rates?.KZT;
	const eur = data.rates?.EUR;
	const rub = data.rates?.RUB;
	const updatedAt = data.time_last_update_unix;
	if (
		data.result !== "success" ||
		!isPositive(kzt) ||
		!isPositive(eur) ||
		!isPositive(rub) ||
		!isPositive(updatedAt)
	) {
		throw new Error("Курсы: неожиданный ответ");
	}
	return { updatedAt, kzt, eur, rub };
}

async function getDashboard(): Promise<Dashboard> {
	// Promise.all запускает ОБА запроса одновременно и ждёт оба.
	// Время ожидания равно самому медленному запросу, а не сумме двух.
	// Если хотя бы один упал, падает весь результат.
	const [weather, rates] = await Promise.all([getWeather(), getRates()]);

	return {
		city: "Алматы",
		temperature: weather.temperature,
		wind: weather.wind,
		usdToKzt: rates.kzt,
		// Курсы даны за 1 доллар: тенге за доллар делим на евро (рубли) за доллар.
		eurToKzt: rates.kzt / rates.eur,
		rubToKzt: rates.kzt / rates.rub,
		weatherTime: weather.time,
		ratesUpdatedAt: rates.updatedAt,
	};
}

export default {
	async fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname !== "/api/dashboard") {
			return Response.json({ error: "Not found" }, { status: 404 });
		}

		try {
			return Response.json(await getDashboard());
		} catch (error) {
			// Объект вместо строки: в Workers Logs по его полям можно фильтровать.
			console.error({
				event: "dashboard_failed",
				error: error instanceof Error ? error.message : String(error),
			});
			return Response.json({ error: "Data is unavailable" }, { status: 502 });
		}
	},
} satisfies ExportedHandler;
