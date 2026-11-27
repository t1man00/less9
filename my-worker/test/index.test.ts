import { SELF } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vite-plus/test";

const weather = {
	current: { time: 1_700_000_000, temperature_2m: -3.5, wind_speed_10m: 7.2 },
};

const rates = {
	result: "success",
	time_last_update_unix: 1_699_900_000,
	rates: { USD: 1, KZT: 450, EUR: 0.9, RUB: 90 },
};

// Answers by URL. A Response must be created inside the request that reads it.
function answer(
	input: RequestInfo | URL,
	overrides: { weather?: () => Response; rates?: () => Response } = {},
): Response {
	const url = input instanceof Request ? input.url : String(input);
	if (url.includes("open-meteo")) return overrides.weather?.() ?? Response.json(weather);
	return overrides.rates?.() ?? Response.json(rates);
}

function getDashboard() {
	return SELF.fetch("https://example.com/api/dashboard");
}

afterEach(() => {
	vi.restoreAllMocks();
});

it("returns the weather and the rates in one answer", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => answer(input));

	const response = await getDashboard();

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		city: "Алматы",
		temperature: -3.5,
		wind: 7.2,
		usdToKzt: 450,
		eurToKzt: 500,
		rubToKzt: 5,
		weatherTime: 1_700_000_000,
		ratesUpdatedAt: 1_699_900_000,
	});
});

it("sends both requests at the same time", async () => {
	let started = 0;
	let releaseBoth!: () => void;
	const bothStarted = new Promise<void>((resolve) => {
		releaseBoth = resolve;
	});

	// Neither request gets an answer until the other one has started.
	// With one await after another, the first would never finish and the Worker would fail.
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		started += 1;
		if (started === 2) releaseBoth();
		await Promise.race([
			bothStarted,
			new Promise((_, reject) => setTimeout(() => reject(new Error("not parallel")), 500)),
		]);
		return answer(input);
	});

	const response = await getDashboard();

	expect(response.status).toBe(200);
	expect(started).toBe(2);
});

it("returns 502 when the weather request fails", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
		answer(input, { weather: () => new Response("down", { status: 503 }) }),
	);

	expect((await getDashboard()).status).toBe(502);
});

it("returns 502 when the rates request fails", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
		answer(input, { rates: () => new Response("down", { status: 503 }) }),
	);

	expect((await getDashboard()).status).toBe(502);
});

it("returns 502 when a currency is missing", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
		answer(input, { rates: () => Response.json({ ...rates, rates: { KZT: 450, EUR: 0.9 } }) }),
	);

	expect((await getDashboard()).status).toBe(502);
});

it("returns 404 for an unknown API route", async () => {
	const response = await SELF.fetch("https://example.com/api/rates");
	expect(response.status).toBe(404);
});
