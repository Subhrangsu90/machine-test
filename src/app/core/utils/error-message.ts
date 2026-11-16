import { HttpErrorResponse } from '@angular/common/http';

/**
 * Turns any thrown value (HTTP error, Error, or unknown) into a message that is safe to show users.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Network error. Check your connection.';
    return err.error?.message ?? `Server error (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
