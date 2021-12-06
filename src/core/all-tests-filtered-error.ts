export class AllTestsFilteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = AllTestsFilteredError.name;
  }
}
