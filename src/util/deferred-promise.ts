type PromiseResolver<T> = (value: T) => void;
type PromiseRejector = (reason?: any) => void;

export class DeferredPromise<T = void> {
	private readonly promiseInstance: Promise<T>;
	private readonly promiseResolver: PromiseResolver<T>;
	private readonly promiseRejector: PromiseRejector;
	private resolved = false;
	private rejected = false;

	public constructor() {
		let resolver: PromiseResolver<T> | undefined;
		let rejector: PromiseRejector | undefined;

		this.promiseInstance = new Promise<T>((resolve, reject) => {
			resolver = resolve;
			rejector = reject;
		});

		this.promiseResolver = (value: T) => {
			if (this.isSettled()) {
				return;
			}
			this.resolved = true;
			resolver!(value);
		};

		this.promiseRejector = (reason?: any) => {
			if (this.isSettled()) {
				return;
			}
			this.rejected = true;
			rejector!(reason);
		};
	}

	public promise(): Promise<T> {
		return this.promiseInstance;
	}

	public resolve(value: T): void {
		this.promiseResolver(value);
	}

	public reject(reason?: any): void {
		this.promiseRejector(reason);
	}

	public isResolved() {
		return this.resolved;
	}

	public isRejected() {
		return this.rejected;
	}

	private isSettled(): boolean {
		return this.resolved || this.rejected;
	}
}
