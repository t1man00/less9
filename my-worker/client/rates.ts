import type { Dashboard } from "../src/dashboard-types";

export type { Dashboard };

export type Currency = "USD" | "EUR" | "KZT" | "RUB";

export const currencies: Record<Currency, { name: string; symbol: string }> = {
	USD: { name: "Доллар США", symbol: "$" },
	EUR: { name: "Евро", symbol: "€" },
	KZT: { name: "Казахстанский тенге", symbol: "₸" },
	RUB: { name: "Российский рубль", symbol: "₽" },
};

export const codes = Object.keys(currencies) as Currency[];

/** How many tenge one unit of the currency costs. */
function inTenge(currency: Currency, data: Dashboard): number {
	const prices: Record<Currency, number> = {
		USD: data.usdToKzt,
		EUR: data.eurToKzt,
		KZT: 1,
		RUB: data.rubToKzt,
	};
	return prices[currency];
}

export function convert(amount: number, from: Currency, to: Currency, data: Dashboard): number {
	return (amount * inTenge(from, data)) / inTenge(to, data);
}

export function formatMoney(value: number, currency: Currency): string {
	const number = new Intl.NumberFormat("ru-RU", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
	return `${number} ${currencies[currency].symbol}`;
}

// The weather changes during a visit, so the data is only reused for a few minutes.
const MAX_AGE_MS = 5 * 60 * 1000;

let cached: { request: Promise<Dashboard>; at: number } | undefined;

async function requestDashboard(): Promise<Dashboard> {
	const response = await fetch("/api/dashboard");
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as Dashboard;
}

/** Loads the weather and the rates in one request. A failed request can be retried. */
export function loadDashboard(): Promise<Dashboard> {
	if (!cached || Date.now() - cached.at > MAX_AGE_MS) {
		const request = requestDashboard().catch((error: unknown) => {
			cached = undefined;
			throw error;
		});
		cached = { request, at: Date.now() };
	}
	return cached.request;
}
