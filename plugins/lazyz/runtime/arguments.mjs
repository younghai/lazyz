export class CliUsageError extends Error {
	constructor(message) {
		super(message);
		this.name = "CliUsageError";
	}
}

export function parseFlags(args, allowed) {
	const flags = new Map();
	const positional = [];
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value.startsWith("--")) {
			positional.push(value);
			continue;
		}
		if (!allowed.has(value)) throw new CliUsageError(`unknown option: ${value}`);
		if (allowed.get(value) === "boolean") {
			flags.set(value, true);
			continue;
		}
		const optionValue = args[index + 1];
		if (optionValue === undefined || optionValue.startsWith("--")) throw new CliUsageError(`${value} requires a value`);
		flags.set(value, optionValue);
		index += 1;
	}
	return { flags, positional };
}
