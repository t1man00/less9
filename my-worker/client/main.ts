import {
	codes,
	convert,
	currencies,
	formatMoney,
	loadRates,
	type Currency,
	type Rates,
} from "./rates";

interface Page {
	title: string;
	render(root: HTMLElement): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text = "",
	className = "",
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.textContent = text;
	node.className = className;
	return node;
}

/** Shows a loading state, then the content, or an error with a retry button. */
function withRates(root: HTMLElement, show: (box: HTMLElement, data: Rates) => void): void {
	const box = element("section");
	root.append(box);

	const load = async () => {
		box.replaceChildren(element("p", "Загружаем курсы…", "status"));
		try {
			const data = await loadRates();
			box.replaceChildren();
			show(box, data);
		} catch {
			const retry = element("button", "Повторить");
			retry.addEventListener("click", load);
			box.replaceChildren(element("p", "Не удалось загрузить курсы.", "status"), retry);
		}
	};

	void load();
}

function updatedNote(data: Rates): HTMLElement {
	const date = new Date(data.updatedAt * 1000).toLocaleString("ru-RU", {
		dateStyle: "long",
		timeStyle: "short",
	});
	return element("p", `Обновлено: ${date}`, "status");
}

function rateCard(code: Currency, amount: number, quotes: Currency[], data: Rates): HTMLElement {
	const { name, symbol } = currencies[code];
	const card = element("article", "", `card card-${code.toLowerCase()}`);
	card.append(
		element("div", symbol, "badge"),
		element("h2", name),
		element("p", `${formatMoney(amount, code)} =`, "base"),
	);
	for (const quote of quotes) {
		card.append(element("p", formatMoney(convert(amount, code, quote, data), quote), "value"));
	}
	return card;
}

function renderRates(root: HTMLElement): void {
	withRates(root, (box, data) => {
		const grid = element("div", "", "grid");
		grid.append(
			rateCard("USD", 1, ["KZT", "EUR"], data),
			rateCard("EUR", 1, ["KZT", "USD"], data),
			rateCard("KZT", 1000, ["USD", "EUR"], data),
		);
		box.append(grid, updatedNote(data));
	});
}

function renderConverter(root: HTMLElement): void {
	withRates(root, (box, data) => {
		const form = element("form", "", "panel");

		const amount = element("input");
		amount.type = "number";
		amount.min = "0";
		amount.step = "any";
		amount.value = "100";
		amount.inputMode = "decimal";

		const from = element("select");
		for (const code of codes) from.add(new Option(`${code} — ${currencies[code].name}`, code));

		const amountLabel = element("label", "Сумма");
		amountLabel.append(amount);
		const fromLabel = element("label", "Из валюты");
		fromLabel.append(from);

		const results = element("output", "", "results");

		const update = () => {
			const value = amount.valueAsNumber;
			if (!Number.isFinite(value) || value < 0) {
				results.replaceChildren(element("p", "Введите сумму от нуля.", "status"));
				return;
			}
			const source = from.value as Currency;
			results.replaceChildren(
				...codes
					.filter((code) => code !== source)
					.map((code) =>
						element("p", formatMoney(convert(value, source, code, data), code), "value"),
					),
			);
		};

		form.addEventListener("input", update);
		form.addEventListener("submit", (event) => event.preventDefault());
		form.append(amountLabel, fromLabel, results);
		box.append(form, updatedNote(data));
		update();
	});
}

const pages: Record<string, Page> = {
	"/": {
		title: "Курсы валют",
		render: renderRates,
	},
	"/converter": {
		title: "Конвертер",
		render: renderConverter,
	},
	"/about": {
		title: "О проекте",
		render(root) {
			const panel = element("div", "", "panel");
			panel.append(
				element("p", "Курсы доллара, евро и тенге на Cloudflare Workers."),
				element(
					"p",
					"Источник обновляет данные раз в день. Это справочные курсы: в банках и обменниках они отличаются.",
				),
			);
			root.append(panel);
		},
	},
};

const notFound: Page = {
	title: "Страница не найдена",
	render(root) {
		root.append(element("p", "Такого раздела нет."));
	},
};

const app = document.querySelector<HTMLElement>("#app")!;

function render(): void {
	const page = pages[location.pathname] ?? notFound;
	document.title = page.title;
	app.replaceChildren(element("h1", page.title));
	page.render(app);

	for (const link of document.querySelectorAll<HTMLAnchorElement>("nav a")) {
		if (link.pathname === location.pathname) link.setAttribute("aria-current", "page");
		else link.removeAttribute("aria-current");
	}
}

document.addEventListener("click", (event) => {
	// Leave new-tab and other modified clicks to the browser.
	if (event.defaultPrevented || event.button !== 0) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

	const link = (event.target as Element).closest("a");
	if (!link || link.origin !== location.origin || link.target || link.hasAttribute("download")) {
		return;
	}

	event.preventDefault();
	if (link.href !== location.href) history.pushState(null, "", link.href);
	render();
});

window.addEventListener("popstate", render);
render();
