export interface Execution<S = void, T = void> {
	readonly started: () => Promise<S>;

	readonly ended: () => Promise<T>;
}
