declare module "js-yaml" {
	interface LoadOptions {
		readonly schema?: unknown;
	}

	interface YamlApi {
		readonly JSON_SCHEMA: unknown;
		readonly load: (input: string, options?: LoadOptions) => unknown;
	}

	const yaml: YamlApi;
	export default yaml;
}
