/** The JSON returned by /api/dashboard. Shared by the Worker and the browser code. */
export interface Dashboard {
	city: string;
	/** °C */
	temperature: number;
	/** km/h */
	wind: number;
	usdToKzt: number;
	eurToKzt: number;
	rubToKzt: number;
	/** Unix time in seconds of the weather measurement. */
	weatherTime: number;
	/** Unix time in seconds of the rates source's last update. */
	ratesUpdatedAt: number;
}
