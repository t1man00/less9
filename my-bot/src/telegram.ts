// Типы Telegram Bot API и вызов его методов.

export interface TgMessage {
	chat: { id: number };
	text?: string;
	location?: { latitude: number; longitude: number };
}

export interface TgCallback {
	id: string;
	data?: string;
	message?: TgMessage;
}

export interface TgUpdate {
	update_id: number;
	message?: TgMessage;
	callback_query?: TgCallback;
}

export type Keyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

export type CallTelegram = <T>(method: string, body: object) => Promise<T>;

export function createTelegram(token: string): CallTelegram {
	return async <T>(method: string, body: object): Promise<T> => {
		// Адрес содержит токен, поэтому в тексты ошибок и логи он не попадает
		const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}).catch(() => {
			throw new Error(`Telegram ${method}: не удалось подключиться`);
		});
		const data = await response
			.json<{ ok: boolean; result: T; description?: string }>()
			.catch(() => {
				throw new Error(`Telegram ${method}: HTTP ${response.status}, ответ не JSON`);
			});
		if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
		return data.result;
	};
}
