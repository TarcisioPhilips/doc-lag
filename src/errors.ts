export class ScanError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "ScanError";
    this.exitCode = exitCode;
  }
}
