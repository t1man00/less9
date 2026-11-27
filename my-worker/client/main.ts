import {
	codes,
	convert,
	currencies,
	formatMoney,
	loadDashboard,
	type Currency,
	type Dashboard,
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
function withData(root: HTMLElement, show: (box: HTMLElement, data: Dashboard) => void): void {
	const box = element("section");
	root.append(box);

	const load = async () => {
		box.replaceChildren(element("p", "Загружаем данные…", "status"));
		try {
			const data = await loadDashboard();
			box.replaceChildren();
			show(box, data);
		} catch {
			const retry = element("button", "Повторить");
			retry.addEventListener("click", load);
			box.replaceChildren(element("p", "Не удалось загрузить данные.", "status"), retry);
		}
	};

	void load();
}

function formatTime(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleString("ru-RU", {
		dateStyle: "long",
		timeStyle: "short",
	});
}

function ratesNote(data: Dashboard): HTMLElement {
	return element("p", `Курсы обновлены: ${formatTime(data.ratesUpdatedAt)}`, "status");
}

function weatherCard(data: Dashboard): HTMLElement {
	const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
	const card = element("article", "", "card card-weather");
	card.append(
		element("h2", `Погода сейчас: ${data.city}`),
		element("p", `${format.format(data.temperature)} °C`, "temperature"),
		element("p", `Ветер ${format.format(data.wind)} км/ч`, "base"),
		element("p", `Измерено: ${formatTime(data.weatherTime)}`, "status"),
	);
	return card;
}

function rateCard(
	code: Currency,
	amount: number,
	quotes: Currency[],
	data: Dashboard,
): HTMLElement {
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

function renderHome(root: HTMLElement): void {
	withData(root, (box, data) => {
		const grid = element("div", "", "grid");
		grid.append(
			rateCard("USD", 1, ["KZT", "EUR"], data),
			rateCard("EUR", 1, ["KZT", "USD"], data),
			rateCard("RUB", 100, ["KZT", "USD"], data),
			rateCard("KZT", 1000, ["USD", "RUB"], data),
		);
		box.append(weatherCard(data), grid, ratesNote(data));
	});
}

function renderConverter(root: HTMLElement): void {
	withData(root, (box, data) => {
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
		box.append(form, ratesNote(data));
		update();
	});
}

const pages: Record<string, Page> = {
	"/": {
		title: "Погода и курсы",
		render: renderHome,
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
				element(
					"p",
					"Погода в Алматы и курсы валют. Worker запрашивает их одновременно через Promise.all.",
				),
				element(
					"p",
					"Курсы обновляются раз в день. Это справочные курсы: в банках и обменниках они отличаются.",
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
