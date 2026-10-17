import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export class UnsafeSetupPathError extends Error {
	constructor(path) {
		super(`Refusing unsafe setup directory: ${path}`);
		this.name = "UnsafeSetupPathError";
	}
}

export async function assertSetupDirectory(home, directory) {
	const relativePath = relative(resolve(home), resolve(directory));
	if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
		throw new UnsafeSetupPathError(directory);
	}
	let current = await realpath(home);
	for (const part of relativePath.split(sep).filter(Boolean)) {
		current = join(current, part);
		try {
			const info = await lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory()) throw new UnsafeSetupPathError(current);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
	}
}
