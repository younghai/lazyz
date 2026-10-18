for (const stream of [process.stdout, process.stderr]) {
	const write = stream.write.bind(stream);
	stream.write = (...args) => {
		setTimeout(() => write(...args), 25);
		return true;
	};
}
