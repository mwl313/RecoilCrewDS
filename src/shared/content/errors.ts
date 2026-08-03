/** Structured content validation failure with file/JSON-path context. */
export class ContentValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
    readonly file?: string,
    readonly jsonPath?: string,
  ) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

/** Format zod issues as `file: json.path — message` lines. */
export function formatZodIssues(file: string, error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${file}: ${path} — ${issue.message}`;
  });
}
