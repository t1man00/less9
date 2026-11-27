import { DurableObject } from "cloudflare:workers";

// Ожидающие вопросы «Да/Нет». Это Durable Object: на каждый чат он один,
// поэтому и вопрос, и клик по кнопке (два разных запроса) попадают в один и тот же объект.
// Обычная переменная в worker так не умеет: клик мог бы прийти в другую копию.
export class QuestionBox extends DurableObject {
	// id вопроса → resolve, которым «из будущего» завершим промис
	#pending = new Map<string, (answer: boolean) => void>();

	// Ждёт ответа не дольше ms. Возвращает null, если время вышло
	async waitForAnswer(id: string, ms: number): Promise<boolean | null> {
		// Promise.withResolvers: промис и его resolve получаем отдельно
		const { promise, resolve } = Promise.withResolvers<boolean>();
		this.#pending.set(id, resolve);

		let timer: number | null = null;
		const timeout = new Promise<null>((done) => {
			timer = setTimeout(() => done(null), ms);
		});

		try {
			// Promise.race: либо клик, либо таймаут
			return await Promise.race([promise, timeout]);
		} finally {
			clearTimeout(timer);
			this.#pending.delete(id);
		}
	}

	// Вызывается при нажатии кнопки. false — вопрос уже закрыт
	answer(id: string, value: boolean): boolean {
		const resolve = this.#pending.get(id);
		if (!resolve) return false;
		this.#pending.delete(id);
		resolve(value);
		return true;
	}
}
