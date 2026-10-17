import type { DaemonPaths } from "./paths.js";

const startupFlights = new Map<string, Promise<void>>();

export function startupLockPath(paths: DaemonPaths): string {
	return `${paths.lock}.start`;
}

export function runStartupSingleFlight(paths: DaemonPaths, start: () => Promise<void>): Promise<void> {
	const flightKey = startupLockPath(paths);
	const active = startupFlights.get(flightKey);
	if (active !== undefined) return active;

	const startup = start();
	startupFlights.set(flightKey, startup);
	const clearFlight = (): void => {
		if (startupFlights.get(flightKey) === startup) startupFlights.delete(flightKey);
	};
	void startup.then(clearFlight, clearFlight);
	return startup;
}
