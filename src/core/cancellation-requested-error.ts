export class CancellationRequestedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = CancellationRequestedError.name;
  }
}
