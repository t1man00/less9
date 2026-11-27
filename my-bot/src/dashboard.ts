// Слой данных: погода и курсы валют. Перенесён из less7/dashboard.ts.
// Здесь используются разные варианты Promise (где — написано в комментариях):
//   new Promise ........ sleep, rejectAfter
//   then/catch/finally . weatherByCity
//   Promise.race ....... withTimeout, raceRates
//   Promise.any ........ getRates (несколько зеркал курса)
//   Promise.all ........ compareCitiesAll
//   Promise.allSettled . getDashboard, compareCitiesSettled
//   Promise.resolve .... кэш в getRates
//   Promise.reject ..... проверки в getWeather и geocode
//   Promise.try ........ ratesFromCdn
//   Promise.withResolvers — в question-box.ts (вопрос «Да/Нет»)

// ---------- Типы ----------

// JSON-ответ сервиса погоды (open-meteo)
export interface Weather {
	current: {
		time: string;
		temperature_2m: number; // °C
		wind_speed_10m: number; // км/ч
	};
}

// Единый формат курсов: разные источники приводим к одному виду
export interface Rates {
	source: string; // какой источник ответил
	ms: number; // сколько миллисекунд ушло на запрос
	fromCache: boolean; // true, если ответ взят из кэша
	rates: Record<string, number>; // код валюты -> курс к USD
}

export interface Place {
	name: string;
	lat: number;
	lon: number;
}

export const ALMATY: Place = { name: "Алматы", lat: 43.24, lon: 76.89 };

// ---------- Фундамент: самые простые промисы ----------

// new Promise: успех наступает через ms миллисекунд
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Промис, который через ms миллисекунд завершается ошибкой (для таймаутов).
// В отличие от Node.js, в Workers у setTimeout нет метода unref().
export function rejectAfter(ms: number, message: string): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => reject(new Error(message)), ms);
	});
}

// Promise.race: если запрос не успел за ms, побеждает таймер
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return Promise.race([promise, rejectAfter(ms, `${label}: таймаут ${ms} мс`)]);
}

async function getJson<T>(url: string): Promise<T> {
	const host = new URL(url).hostname;
	const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => {
		throw new Error(`${host}: не удалось подключиться`);
	});
	if (!response.ok) throw new Error(`${host}: HTTP ${response.status}`);
	return await response.json<T>();
}

// ---------- Погода ----------

export async function getWeather(place: Place = ALMATY): Promise<Weather> {
	// Promise.reject: проверяем координаты, не ходя в сеть
	if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
		return Promise.reject(new Error("Погода: неверные координаты"));
	}
	const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,wind_speed_10m`;
	return withTimeout(getJson<Weather>(url), 5000, "open-meteo");
}

// Поиск города по названию → координаты
export async function geocode(city: string): Promise<Place> {
	const q = city.trim();
	if (q.length < 2) return Promise.reject(new Error("слишком короткое название города"));
	const data = await getJson<{
		results?: { name: string; latitude: number; longitude: number }[];
	}>(
		`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ru&format=json`,
	);
	const first = data.results?.[0];
	if (!first) throw new Error(`город «${q}» не найден`);
	return { name: first.name, lat: first.latitude, lon: first.longitude };
}

// Цепочка then/catch/finally: город → координаты → погода → текст. log собирает шаги
export function weatherByCity(city: string, log: string[] = []): Promise<string> {
	return geocode(city)
		.then((place) => {
			log.push(`then: нашёл «${place.name}»`);
			// Вернули промис внутри then — он «сплющится»
			return getWeather(place).then((weather) => ({ place, weather }));
		})
		.then(({ place, weather }) => {
			log.push("then: получил погоду, собираю текст");
			return `🌤 ${place.name}: ${weather.current.temperature_2m} °C, ветер ${weather.current.wind_speed_10m} км/ч`;
		})
		.catch((err: Error) => {
			// catch ловит ошибку из любого шага выше
			log.push(`catch: ${err.message}`);
			return `🤷 ${err.message}`;
		})
		.finally(() => {
			log.push("finally: выполнился в любом случае");
		});
}

// ---------- Несколько городов: all против allSettled ----------

export interface CityWeather {
	place: Place;
	weather: Weather;
}

async function cityWeather(name: string): Promise<CityWeather> {
	const place = await geocode(name);
	const weather = await getWeather(place);
	return { place, weather };
}

// Promise.all: нужны все города, иначе отклоняется весь результат
export function compareCitiesAll(names: string[]): Promise<CityWeather[]> {
	return Promise.all(names.map(cityWeather));
}

// Promise.allSettled: статус по каждому городу
export function compareCitiesSettled(
	names: string[],
): Promise<PromiseSettledResult<CityWeather>[]> {
	return Promise.allSettled(names.map(cityWeather));
}

// ---------- Курсы валют ----------

async function ratesFromEr(): Promise<Rates> {
	const data = await getJson<{ result: string; rates: Record<string, number> }>(
		"https://open.er-api.com/v6/latest/USD",
	);
	if (data.result !== "success") throw new Error("er-api: API вернул ошибку");
	return { source: "er-api", ms: 0, fromCache: false, rates: data.rates };
}

async function ratesFromCdn(url: string, source: string): Promise<Rates> {
	const data = await getJson<{ usd: Record<string, number> }>(url);
	// Promise.try: любая ошибка внутри функции превращается в reject
	return Promise.try(() => ({
		source,
		ms: 0,
		fromCache: false,
		// Коды валют приводим к верхнему регистру (kzt → KZT)
		rates: Object.fromEntries(
			Object.entries(data.usd).map(([code, value]) => [code.toUpperCase(), value]),
		),
	}));
}

interface RateSource {
	name: string;
	load: () => Promise<Rates>;
}

const RATE_SOURCES: RateSource[] = [
	{ name: "er-api", load: ratesFromEr },
	{
		name: "jsdelivr",
		load: () =>
			ratesFromCdn(
				"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
				"jsdelivr",
			),
	},
	{
		name: "pages.dev",
		load: () =>
			ratesFromCdn("https://latest.currency-api.pages.dev/v1/currencies/usd.json", "pages.dev"),
	},
];

// Нарочно сломанный источник для демонстрации
const BROKEN_SOURCE: RateSource = {
	name: "сломанный-хост",
	load: () => ratesFromCdn("https://rates.broken-host.invalid/usd", "сломанный-хост"),
};

// Один источник с таймаутом (race) и замером времени
async function timedSource(source: RateSource): Promise<Rates> {
	const start = Date.now();
	const rates = await withTimeout(source.load(), 5000, source.name);
	return { ...rates, source: source.name, ms: Date.now() - start };
}

// Кэш курсов на 60 секунд. В Workers он живёт, пока жива эта копия worker,
// поэтому иногда второй запрос всё же пойдёт в сеть.
let cache: { value: Rates; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export interface RatesOptions {
	fresh?: boolean; // true — игнорировать кэш
	broken?: "one" | "all"; // добавить сломанный источник или оставить только сломанные
}

export function getRates(options: RatesOptions = {}): Promise<Rates> {
	// Promise.resolve: свежий кэш отдаём как уже выполненный промис
	if (!options.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return Promise.resolve({ ...cache.value, fromCache: true, ms: 0 });
	}
	const sources =
		options.broken === "all"
			? [
					BROKEN_SOURCE,
					{
						name: "сломанный-2",
						load: () => Promise.reject<Rates>(new Error("сломанный-2: всегда ошибка")),
					},
				]
			: options.broken === "one"
				? [BROKEN_SOURCE, ...RATE_SOURCES]
				: RATE_SOURCES;
	// Promise.any: первый успешный ответ
	return Promise.any(sources.map(timedSource))
		.then((rates) => {
			cache = { value: rates, at: Date.now() };
			return rates;
		})
		.catch((err: AggregateError) => {
			const reasons = err.errors.map((e: Error) => e.message).join("; ");
			throw new Error(`Все источники курса недоступны (${reasons})`);
		});
}

// Promise.race: побеждает тот, кто ответил первым (даже если это ошибка)
export function raceRates(): Promise<Rates> {
	return Promise.race(RATE_SOURCES.map(timedSource));
}

// ---------- Погода + курсы параллельно ----------

export async function getDashboard(place: Place = ALMATY) {
	// Promise.allSettled ждёт оба запроса, даже если один упал
	const [weatherResult, ratesResult] = await Promise.allSettled([getWeather(place), getRates()]);

	const errors: string[] = [];
	const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
	const rates = ratesResult.status === "fulfilled" ? ratesResult.value : null;
	if (weatherResult.status === "rejected") {
		errors.push(`Погода недоступна: ${(weatherResult.reason as Error).message}`);
	}
	if (ratesResult.status === "rejected") {
		errors.push(`Курсы недоступны: ${(ratesResult.reason as Error).message}`);
	}

	const kzt = rates?.rates["KZT"] ?? null;
	// Тенге за 1 единицу валюты: тенге за доллар делим на эту валюту за доллар
	const inTenge = (code: string) => {
		const perDollar = rates?.rates[code];
		return kzt !== null && perDollar ? kzt / perDollar : null;
	};

	return {
		city: place.name,
		temperature: weather ? weather.current.temperature_2m : null,
		wind: weather ? weather.current.wind_speed_10m : null,
		usdToKzt: kzt,
		eurToKzt: inTenge("EUR"),
		rubToKzt: inTenge("RUB"),
		rateSource: rates ? (rates.fromCache ? `${rates.source} (кэш)` : rates.source) : null,
		errors,
	};
}
