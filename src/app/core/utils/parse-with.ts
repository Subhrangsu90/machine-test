import { OperatorFunction, map } from 'rxjs';
import { z } from 'zod';

/**
 * A utility function that takes a Zod schema and returns an RxJS operator function.
 * Validates any HTTP response data against the provided schema. If the backend changes shape,you get one clear error insted of `undefined` errors in UI.
 * @param schema - A Zod schema used for validation and parsing.
 * @returns An RxJS operator function that validates and parses data.
 */

export function parseWith<T extends z.ZodType>(schema: T): OperatorFunction<unknown, z.infer<T>> {
  return map((data) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error('API contract mismatch:', result.error.issues);
      throw new Error('Unexpected response from server.');
    }
    return result.data;
  });
}
