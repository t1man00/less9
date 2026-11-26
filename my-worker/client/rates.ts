export type Currency = "USD" | "EUR" | "KZT";

export interface Rates {
	/** Unix time in seconds of the source's last update. */
	updatedAt: number;
	/** Amount of each currency in one US dollar. */
	rates: Record<Currency, number>;
}

export const currencies: Record<Currency, { name: string; symbol: string }> = {
	USD: { name: "Доллар США", symbol: "$" },
	EUR: { name: "Евро", symbol: "€" },
	KZT: { name: "Казахстанский тенге", symbol: "₸" },
};

export const codes = Object.keys(currencies) as Currency[];

export function convert(amount: number, from: Currency, to: Currency, data: Rates): number {
	return (amount / data.rates[from]) * data.rates[to];
}

export function formatMoney(value: number, currency: Currency): string {
	const number = new Intl.NumberFormat("ru-RU", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
	return `${number} ${currencies[currency].symbol}`;
}

let cached: Promise<Rates> | undefined;

async function requestRates(): Promise<Rates> {
	const response = await fetch("/api/rates");
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as Rates;
}

/** Loads the rates once per page visit. A failed request can be retried. */
export function loadRates(): Promise<Rates> {
	cached ??= requestRates().catch((error: unknown) => {
		cached = undefined;
		throw error;
	});
	return cached;
}
