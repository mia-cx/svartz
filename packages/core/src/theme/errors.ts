class ThemeValidationError extends Error {
  readonly _tag = "ThemeValidationError" as const;
  readonly themeId: string;

  constructor(opts: { themeId: string; message: string }) {
    super(opts.message);
    this.name = "ThemeValidationError";
    this.themeId = opts.themeId;
  }
}

type ThemeError = ThemeValidationError;

export { ThemeValidationError, type ThemeError };
