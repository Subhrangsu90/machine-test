import { z } from 'zod';

/**
 * Loads data from localStorage, validates it against a Zod schema, and returns the parsed data or a fallback value.
 * @param key - The key in localStorage to retrieve the data from.
 * @param schema - A Zod schema used for validation and parsing.
 * @param fallback - A fallback value to return if the data is not found or fails validation.
 * @returns The parsed data if valid, otherwise the fallback value.
 */

export function loadFromStorage<T extends z.ZodType>(
  key: string,
  schema: T,
  fallback: z.infer<T>,
): z.infer<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : fallback; // corrupted or old data -> fallback
  } catch {
    return fallback;
  }
}

/**
 * Saves data to localStorage after serializing it to a JSON string.
 * @param key - The key in localStorage to save the data under.
 * @param value - The value to be saved, which will be serialized to JSON.
 */

export function saveToStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Removes data from localStorage for the specified key.
 * @param key - The key in localStorage to remove the data from.
 */

export function removeFromStorage(key: string): void {
  localStorage.removeItem(key);
}
