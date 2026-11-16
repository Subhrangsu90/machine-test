import { DOCUMENT, Service, computed, effect, inject, signal } from '@angular/core';
import { saveToStorage } from '../utils/storage';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mt.theme';

// A type guard instead of a Zod schema on purpose: this store is in the initial bundle,
// and importing Zod here would add ~400 kB to first load. Feature stores (lazy) use Zod.
const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/** Light/dark theme. Defaults to the OS preference; an explicit choice is persisted. */
@Service()
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly theme = signal<Theme>(this.storedTheme() ?? this.systemTheme());

  readonly current = this.theme.asReadonly();
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.theme();
    });
  }

  toggle(): void {
    const next: Theme = this.isDark() ? 'light' : 'dark';
    this.theme.set(next);
    saveToStorage(STORAGE_KEY, next);
  }

  private storedTheme(): Theme | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      return isTheme(value) ? value : null;
    } catch {
      return null;
    }
  }

  private systemTheme(): Theme {
    const prefersDark = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    return prefersDark?.matches ? 'dark' : 'light';
  }
}
