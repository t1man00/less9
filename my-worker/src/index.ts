// Free open-access endpoint: no API key, updated once a day, attribution required.
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

interface UpstreamRates {
	result?: string;
	time_last_update_unix?: number;
	rates?: Record<string, number>;
}

function isPositive(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function getRates(): Promise<Response> {
	try {
		const upstream = await fetch(RATES_URL, {
			// Cache successful answers for an hour, never cache errors.
			cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 }, cacheEverything: true },
		});
		if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);

		const data = await upstream.json<UpstreamRates>();
		const eur = data.rates?.EUR;
		const kzt = data.rates?.KZT;
		const updatedAt = data.time_last_update_unix;
		if (
			data.result !== "success" ||
			!isPositive(eur) ||
			!isPositive(kzt) ||
			!isPositive(updatedAt)
		) {
			throw new Error("Unexpected upstream response");
		}

		// Each rate is the amount of that currency in one US dollar.
		return Response.json({ updatedAt, rates: { USD: 1, EUR: eur, KZT: kzt } });
	} catch (error) {
		console.error("Failed to load exchange rates", error);
		return Response.json({ error: "Rates are unavailable" }, { status: 502 });
	}
}

export default {
	fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === "/api/rates") return getRates();

		return Response.json({ error: "Not found" }, { status: 404 });
	},
} satisfies ExportedHandler;
