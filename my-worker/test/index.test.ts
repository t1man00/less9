import { SELF } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
	vi.restoreAllMocks();
});

it("returns USD, EUR and KZT rates", async () => {
	// A Response must be created inside the request that reads it, hence mockImplementation.
	vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({
			result: "success",
			time_last_update_unix: 1_700_000_000,
			rates: { USD: 1, EUR: 0.9, KZT: 450, GBP: 0.8 },
		}),
	);

	const response = await SELF.fetch("https://example.com/api/rates");

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		updatedAt: 1_700_000_000,
		rates: { USD: 1, EUR: 0.9, KZT: 450 },
	});
});

it("returns 502 when the rates source fails", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(
		async () => new Response("down", { status: 503 }),
	);

	const response = await SELF.fetch("https://example.com/api/rates");

	expect(response.status).toBe(502);
});

it("returns 502 when a currency is missing", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({ result: "success", time_last_update_unix: 1_700_000_000, rates: { EUR: 0.9 } }),
	);

	const response = await SELF.fetch("https://example.com/api/rates");

	expect(response.status).toBe(502);
});

it("returns 404 for an unknown API route", async () => {
	const response = await SELF.fetch("https://example.com/api/missing");
	expect(response.status).toBe(404);
});
