
type PromiseResolver<T> = (value: T) => void;
type PromiseRejector = (reason?: any) => void;
type PromiseExecutor<T> = (resolve: PromiseResolver<T>, reject: PromiseRejector) => void;

export class DelayedPromise<T = void> {  // FIXME: Not currently used
    private readonly resolver: PromiseResolver<T>;
    private readonly rejector: PromiseRejector;
    private readonly promiseInstance: Promise<T>;

    public constructor(private readonly executor: PromiseExecutor<T>) {
        let resolver: PromiseResolver<T> | undefined;
        let rejector: PromiseRejector | undefined;

        this.promiseInstance = new Promise<T>((resolve, reject) => {
            resolver = resolve;
            rejector = reject;
        });

        this.resolver = resolver!;
        this.rejector = rejector!;
    }

    public promise(): Promise<T> {
        return this.promiseInstance;
    }

    public execute(): void {
        this.executor(this.resolver, this.rejector);
    }
}