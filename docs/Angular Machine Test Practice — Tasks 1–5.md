# Angular Machine Test Practice — Tasks 1–5

Nov 16, 2026 · @Subhrangsu

## 0. Project setup (do this once, \~15 min)

Build all five tasks in one standalone, zoneless Angular app. Zod validates every API response and every localStorage read, so bad data fails at the boundary, not deep inside a template. Each feature gets its own **signal store**: one service holding private state, public read-only `computed` selectors, and methods that change state.

### Create the app

```bash
ng new machine-test --style=scss --ssr=false --routing
cd machine-test
npm i zod
ng serve
```

### Folder structure

```text
src/app/
  core/
    auth/            auth.store.ts, auth.interceptor.ts, auth.guards.ts   (Task 5)
    utils/           parse-with.ts, storage.ts, zod-validator.ts
  shared/
    models/          load-status.ts
  features/
    products/        product.model.ts, product.api.ts, product.store.ts, product-list.component.ts   (Task 1)
    employees/       employee.model.ts, employee.store.ts, employee-*.component.ts             (Task 2)
    register/        register.schema.ts, register.component.ts                                 (Task 3)
    users-table/     user.model.ts, users-table.store.ts, users-table.component.ts             (Task 4)
    auth/            login.component.ts, admin.component.ts                                    (Task 5)
  app.config.ts
  app.routes.ts
```

### Rule of thumb for Zod

Write the **Zod schema first**, then derive the TypeScript type from it with `z.infer`. That gives you one source of truth for both compile-time types and runtime checks. Never write a separate `interface` for the same shape.

```ts
import { z } from 'zod';

export const UserSchema = z.object({ id: z.number(), name: z.string() });
export type User = z.infer<typeof UserSchema>; // { id: number; name: string }
```

### Shared utility 1: `parseWith` RxJS operator

Validates any HTTP response against a schema. If the backend changes shape, you get one clear error instead of `undefined` in the UI.

```ts
// core/utils/parse-with.ts
import { OperatorFunction, map } from 'rxjs';
import { z } from 'zod';

export function parseWith<T extends z.ZodType>(schema: T): OperatorFunction<unknown, z.infer<T>> {
  return map((data) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error('API contract mismatch', result.error.issues);
      throw new Error('Unexpected response from server');
    }
    return result.data;
  });
}
```

### Shared utility 2: typed localStorage

```ts
// core/utils/storage.ts
import { z } from 'zod';

export function loadFromStorage<T extends z.ZodType>(key: string, schema: T, fallback: z.infer<T>): z.infer<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : fallback; // corrupted or old data -> fallback
  } catch {
    return fallback;
  }
}

export function saveToStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeFromStorage(key: string): void {
  localStorage.removeItem(key);
}
```

### Shared model: load status

```ts
// shared/models/load-status.ts
export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
```

### The signal store pattern (used in every task)

```ts
interface CounterState { count: number; status: LoadStatus }

@Injectable({ providedIn: 'root' })
export class CounterStore {
  // 1. private writable state, one object
  private readonly state = signal<CounterState>({ count: 0, status: 'idle' });

  // 2. public read-only selectors
  readonly count = computed(() => this.state().count);
  readonly isEven = computed(() => this.count() % 2 === 0);

  // 3. methods are the only way to change state
  increment() { this.patch({ count: this.count() + 1 }); }

  private patch(partial: Partial<CounterState>) {
    this.state.update((s) => ({ ...s, ...partial }));
  }
}
```

If an interviewer asks why you didn't use NgRx, explain the trade-off. This pattern gives the same one-way data flow without extra libraries. `@ngrx/signals` (`signalStore`, `withState`, `withMethods`) is the drop-in upgrade for bigger apps.

### `app.config.ts`

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor'; // added in Task 5

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
  ],
};
```

### `app.routes.ts`

```ts
import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  { path: 'products', loadComponent: () => import('./features/products/product-list.component').then((m) => m.ProductListComponent) },
  { path: 'employees', loadComponent: () => import('./features/employees/employee-page.component').then((m) => m.EmployeePageComponent) },
  { path: 'register', loadComponent: () => import('./features/register/register.component').then((m) => m.RegisterComponent) },
  { path: 'users', loadComponent: () => import('./features/users-table/users-table.component').then((m) => m.UsersTableComponent) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  { path: 'admin', canActivate: [authGuard, roleGuard('admin')], loadComponent: () => import('./features/auth/admin.component').then((m) => m.AdminComponent) },
  { path: '**', redirectTo: 'products' },
];
```

Until you reach Task 5, comment out the interceptor and the guard imports so the app compiles.

## Task 1. Product list with search and filter (target: 60 min)

The search box is debounced, so typing calls the API at most once per pause, and stale responses are cancelled with `switchMap`. The category filter runs client-side through a `computed`. Loading, error, empty and success states each render something.

### Requirements (as an interviewer would give them)

1. Fetch products from `https://dummyjson.com/products/search?q=`.
2. Search box with 400 ms debounce; don't call the API for the same term twice.
3. Category dropdown from `https://dummyjson.com/products/category-list`.
4. Show a loading state, an error state with Retry, and an empty state.
5. Product cards show thumbnail, title, price, rating, and "Out of stock" when stock is 0.

### How to approach it

1. Write the Zod schemas from one sample response (open the URL in the browser and copy its shape).
2. Write the API service: only HTTP + `parseWith`, no state.
3. Write the store: state, selectors, and the debounced search pipeline.
4. Write a dumb card component (input in, nothing out) and the page component that reads the store.

### Step 1: Model

```ts
// features/products/product.model.ts
import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.number().nonnegative(),
  rating: z.number().min(0).max(5),
  stock: z.number().int(),
  brand: z.string().optional(), // some products have no brand
  thumbnail: z.url(),
});

export const ProductsResponseSchema = z.object({
  products: z.array(ProductSchema),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
});

export const CategoryListSchema = z.array(z.string());

export type Product = z.infer<typeof ProductSchema>;
export type ProductsResponse = z.infer<typeof ProductsResponseSchema>;
```

### Step 2: API service

```ts
// features/products/product.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseWith } from '../../core/utils/parse-with';
import { CategoryListSchema, ProductsResponseSchema } from './product.model';

@Injectable({ providedIn: 'root' })
export class ProductApi {
  private readonly http = inject(HttpClient);
  private readonly base = 'https://dummyjson.com/products';

  search(q: string) {
    return this.http
      .get(`${this.base}/search`, { params: { q, limit: 100 } })
      .pipe(parseWith(ProductsResponseSchema));
  }

  categories() {
    return this.http.get(`${this.base}/category-list`).pipe(parseWith(CategoryListSchema));
  }
}
```

Add one helper for readable errors, reused by every task:

```ts
// core/utils/error-message.ts
import { HttpErrorResponse } from '@angular/common/http';

export function toErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Network error. Check your connection.';
    return err.error?.message ?? `Server error (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
```

### Step 3: Store

```ts
// features/products/product.store.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, debounceTime, distinctUntilChanged, map, of, startWith, switchMap, tap } from 'rxjs';
import { LoadStatus } from '../../shared/models/load-status';
import { toErrorMessage } from '../../core/utils/error-message';
import { Product } from './product.model';
import { ProductApi } from './product.api';

interface ProductState {
  query: string;
  category: string | null;
  products: Product[];
  categories: string[];
  status: LoadStatus;
  error: string | null;
}

const initialState: ProductState = {
  query: '', category: null, products: [], categories: [], status: 'idle', error: null,
};

@Injectable() // provided in the component, so state resets when you leave the page
export class ProductStore {
  private readonly api = inject(ProductApi);
  private readonly state = signal(initialState);
  private readonly refresh$ = new Subject<void>();

  // selectors
  readonly query = computed(() => this.state().query);
  readonly category = computed(() => this.state().category);
  readonly categories = computed(() => this.state().categories);
  readonly status = computed(() => this.state().status);
  readonly error = computed(() => this.state().error);
  readonly filtered = computed(() => {
    const cat = this.category();
    const list = this.state().products;
    return cat ? list.filter((p) => p.category === cat) : list;
  });
  readonly isEmpty = computed(() => this.status() === 'success' && this.filtered().length === 0);

  constructor() {
    const term$ = toObservable(this.query).pipe(
      debounceTime(400),
      map((q) => q.trim()),
      distinctUntilChanged(),
    );

    combineLatest([term$, this.refresh$.pipe(startWith(undefined))])
      .pipe(
        tap(() => this.patch({ status: 'loading', error: null })),
        switchMap(([q]) =>
          this.api.search(q).pipe(
            map((res) => ({ ok: true as const, products: res.products })),
            catchError((err) => of({ ok: false as const, message: toErrorMessage(err) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((r) =>
        r.ok
          ? this.patch({ products: r.products, status: 'success' })
          : this.patch({ products: [], status: 'error', error: r.message }),
      );

    this.api.categories().pipe(takeUntilDestroyed()).subscribe({
      next: (categories) => this.patch({ categories }),
      error: () => this.patch({ categories: [] }), // filter just stays empty
    });
  }

  // methods
  setQuery(query: string) { this.patch({ query }); }
  setCategory(category: string | null) { this.patch({ category }); }
  retry() { this.refresh$.next(); }

  private patch(p: Partial<ProductState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

Why `catchError` sits **inside** `switchMap`: if it sat outside, one failed request would complete the whole stream and search would stop working forever.

### Step 4: Components

```ts
// features/products/product-card.component.ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Product } from './product.model';

@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <article class="card">
      <img [src]="product().thumbnail" [alt]="product().title" loading="lazy" width="200" height="200" />
      <h3>{{ product().title }}</h3>
      <p class="price">{{ product().price | currency }}</p>
      <p>★ {{ product().rating | number: '1.1-1' }}</p>
      @if (product().stock === 0) {
        <span class="badge">Out of stock</span>
      }
    </article>
  `,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
}
```

```ts
// features/products/product-list.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { ProductStore } from './product.store';
import { ProductCardComponent } from './product-card.component';

@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductStore],
  imports: [ProductCardComponent, TitleCasePipe],
  template: `
    <section class="toolbar">
      <input #q type="search" placeholder="Search products" aria-label="Search products"
             [value]="store.query()" (input)="store.setQuery(q.value)" />

      <select #cat aria-label="Category" (change)="store.setCategory(cat.value || null)">
        <option value="">All categories</option>
        @for (c of store.categories(); track c) {
          <option [value]="c" [selected]="c === store.category()">{{ c | titlecase }}</option>
        }
      </select>
    </section>

    @switch (store.status()) {
      @case ('loading') {
        <div class="grid">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="card skeleton"></div> }
        </div>
      }
      @case ('error') {
        <div class="error" role="alert">
          <p>{{ store.error() }}</p>
          <button type="button" (click)="store.retry()">Retry</button>
        </div>
      }
      @case ('success') {
        @if (store.isEmpty()) {
          <p class="empty">No products match your search.</p>
        } @else {
          <div class="grid">
            @for (p of store.filtered(); track p.id) {
              <app-product-card [product]="p" />
            }
          </div>
        }
      }
    }
  `,
  styles: `
    .toolbar { display: flex; gap: 1rem; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .skeleton { height: 280px; background: #eee; border-radius: 8px; animation: pulse 1.2s infinite; }
    @keyframes pulse { 50% { opacity: 0.5; } }
  `,
})
export class ProductListComponent {
  protected readonly store = inject(ProductStore);
}
```

### What the interviewer checks

- Debounce + `distinctUntilChanged` + `switchMap`. Expect the question: "what happens if response 1 arrives after response 2?" (`switchMap` cancels request 1).
- `track p.id`, not `track $index`.
- The component holds no logic, only reads the store.
- Zod catches a renamed API field at the boundary.

### Likely follow-up twists

- "Add sort by price" → add `sort: 'asc' | 'desc' | null` to state and sort a copy inside `filtered`.
- "Keep the search in the URL" → see Task 4's URL-sync pattern.
- "Cache results" → keep a `Map<string, Product[]>` in the store and return `of(cached)` before calling the API.

## Task 2. Employee CRUD manager with localStorage (target: 75 min)

The store is the only place data changes. An `effect` saves to localStorage on every change. Zod checks data in both directions: on load (corrupted storage falls back to an empty list) and on every add or update.

### Requirements

1. Add, edit, delete employees: name, email, department, salary, active.
2. Toggle active/inactive from the list.
3. Search by name or email; filter All / Active / Inactive; show counts.
4. Data survives a page refresh.
5. Duplicate emails are rejected with a message.

### How to approach it

1. Schema first: the full `Employee` and an `EmployeeInput` (what the form sends, without `id` and `createdAt`).
2. Store: load from storage in the initial state, persist with `effect`.
3. Split the UI into a smart page (talks to the store) and two dumb components (form and list) that only use `input()` and `output()`.

### Step 1: Model

```ts
// features/employees/employee.model.ts
import { z } from 'zod';

export const DEPARTMENTS = ['Engineering', 'Design', 'HR', 'Sales'] as const;

export const EmployeeSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.email('Invalid email').toLowerCase(),
  department: z.enum(DEPARTMENTS),
  salary: z.number().positive('Salary must be greater than 0'),
  active: z.boolean(),
  createdAt: z.string(),
});

export const EmployeeListSchema = z.array(EmployeeSchema);
export const EmployeeInputSchema = EmployeeSchema.omit({ id: true, createdAt: true });

export type Employee = z.infer<typeof EmployeeSchema>;
export type EmployeeInput = z.infer<typeof EmployeeInputSchema>;
export type Department = (typeof DEPARTMENTS)[number];
export type StatusFilter = 'all' | 'active' | 'inactive';
```

### Step 2: Store

```ts
// features/employees/employee.store.ts
import { Injectable, computed, effect, signal } from '@angular/core';
import { loadFromStorage, saveToStorage } from '../../core/utils/storage';
import { Employee, EmployeeInput, EmployeeInputSchema, EmployeeListSchema, StatusFilter } from './employee.model';

const STORAGE_KEY = 'mt.employees';

interface EmployeeState {
  employees: Employee[];
  editingId: string | null;
  search: string;
  filter: StatusFilter;
  formError: string | null;
}

@Injectable({ providedIn: 'root' })
export class EmployeeStore {
  private readonly state = signal<EmployeeState>({
    employees: loadFromStorage(STORAGE_KEY, EmployeeListSchema, []),
    editingId: null,
    search: '',
    filter: 'all',
    formError: null,
  });

  // selectors
  readonly employees = computed(() => this.state().employees);
  readonly search = computed(() => this.state().search);
  readonly filter = computed(() => this.state().filter);
  readonly formError = computed(() => this.state().formError);
  readonly editing = computed(() => this.employees().find((e) => e.id === this.state().editingId) ?? null);

  readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const filter = this.filter();
    return this.employees().filter((e) => {
      const matchesFilter = filter === 'all' || (filter === 'active' ? e.active : !e.active);
      const matchesSearch = !term || e.name.toLowerCase().includes(term) || e.email.includes(term);
      return matchesFilter && matchesSearch;
    });
  });

  readonly counts = computed(() => {
    const list = this.employees();
    const active = list.filter((e) => e.active).length;
    return { all: list.length, active, inactive: list.length - active };
  });

  constructor() {
    // persist on every change to the list
    effect(() => saveToStorage(STORAGE_KEY, this.employees()));
  }

  // methods
  save(input: EmployeeInput): boolean {
    const parsed = EmployeeInputSchema.safeParse(input);
    if (!parsed.success) {
      this.patch({ formError: parsed.error.issues[0].message });
      return false;
    }
    const data = parsed.data;
    const editingId = this.state().editingId;

    const duplicate = this.employees().some((e) => e.email === data.email && e.id !== editingId);
    if (duplicate) {
      this.patch({ formError: 'An employee with this email already exists' });
      return false;
    }

    const employees = editingId
      ? this.employees().map((e) => (e.id === editingId ? { ...e, ...data } : e))
      : [...this.employees(), { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];

    this.patch({ employees, editingId: null, formError: null });
    return true;
  }

  remove(id: string) {
    this.patch({
      employees: this.employees().filter((e) => e.id !== id),
      editingId: this.state().editingId === id ? null : this.state().editingId,
    });
  }

  toggleActive(id: string) {
    this.patch({ employees: this.employees().map((e) => (e.id === id ? { ...e, active: !e.active } : e)) });
  }

  startEdit(id: string) { this.patch({ editingId: id, formError: null }); }
  cancelEdit() { this.patch({ editingId: null, formError: null }); }
  setSearch(search: string) { this.patch({ search }); }
  setFilter(filter: StatusFilter) { this.patch({ filter }); }

  private patch(p: Partial<EmployeeState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

The store **never mutates** arrays. It always creates new ones with `map`, `filter` or spread. Signals compare by reference, so `push` would not trigger an update. Interviewers ask this often.

### Step 3: Form component (dumb)

```ts
// features/employees/employee-form.component.ts
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DEPARTMENTS, Department, Employee, EmployeeInput } from './employee.model';

@Component({
  selector: 'app-employee-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h2>{{ employee() ? 'Edit employee' : 'Add employee' }}</h2>

      <label>Name <input formControlName="name" /></label>
      @if (form.controls.name.touched && form.controls.name.invalid) {
        <small class="err">Name is required (min 2 characters)</small>
      }

      <label>Email <input type="email" formControlName="email" /></label>
      @if (form.controls.email.touched && form.controls.email.invalid) {
        <small class="err">Enter a valid email</small>
      }

      <label>Department
        <select formControlName="department">
          @for (d of departments; track d) { <option [value]="d">{{ d }}</option> }
        </select>
      </label>

      <label>Salary <input type="number" formControlName="salary" min="1" /></label>
      @if (form.controls.salary.touched && form.controls.salary.invalid) {
        <small class="err">Salary must be greater than 0</small>
      }

      <label><input type="checkbox" formControlName="active" /> Active</label>

      @if (serverError()) { <p class="err" role="alert">{{ serverError() }}</p> }

      <button type="submit">{{ employee() ? 'Update' : 'Add' }}</button>
      @if (employee()) { <button type="button" (click)="cancel.emit()">Cancel</button> }
    </form>
  `,
})
export class EmployeeFormComponent {
  readonly employee = input<Employee | null>(null);
  readonly serverError = input<string | null>(null);
  readonly save = output<EmployeeInput>();
  readonly cancel = output<void>();

  protected readonly departments = DEPARTMENTS;
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    department: this.fb.control<Department>('Engineering'),
    salary: [0, [Validators.required, Validators.min(1)]],
    active: [true],
  });

  constructor() {
    // fill the form when an employee is selected, clear it when not
    effect(() => {
      const e = this.employee();
      if (e) {
        this.form.setValue({ name: e.name, email: e.email, department: e.department, salary: e.salary, active: e.active });
      } else {
        this.form.reset();
      }
    });
  }

  protected submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.save.emit(this.form.getRawValue());
  }

  /** called by the parent after a successful add */
  clear() { this.form.reset(); }
}
```

### Step 4: List component (dumb)

```ts
// features/employees/employee-list.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Employee } from './employee.model';

@Component({
  selector: 'app-employee-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe],
  template: `
    <table>
      <thead>
        <tr><th>Name</th><th>Email</th><th>Department</th><th>Salary</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        @for (e of employees(); track e.id) {
          <tr [class.inactive]="!e.active">
            <td>{{ e.name }}</td>
            <td>{{ e.email }}</td>
            <td>{{ e.department }}</td>
            <td>{{ e.salary | currency: 'INR' }}</td>
            <td><button type="button" (click)="toggle.emit(e.id)">{{ e.active ? 'Active' : 'Inactive' }}</button></td>
            <td>
              <button type="button" (click)="edit.emit(e.id)">Edit</button>
              <button type="button" (click)="remove.emit(e)">Delete</button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="6">No employees found.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class EmployeeListComponent {
  readonly employees = input.required<Employee[]>();
  readonly edit = output<string>();
  readonly remove = output<Employee>();
  readonly toggle = output<string>();
}
```

### Step 5: Page component (smart)

```ts
// features/employees/employee-page.component.ts
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { EmployeeStore } from './employee.store';
import { Employee, EmployeeInput, StatusFilter } from './employee.model';
import { EmployeeFormComponent } from './employee-form.component';
import { EmployeeListComponent } from './employee-list.component';

@Component({
  selector: 'app-employee-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmployeeFormComponent, EmployeeListComponent],
  template: `
    <app-employee-form
      [employee]="store.editing()"
      [serverError]="store.formError()"
      (save)="onSave($event)"
      (cancel)="store.cancelEdit()" />

    <div class="toolbar">
      <input #s type="search" placeholder="Search name or email" (input)="store.setSearch(s.value)" />
      @for (f of filters; track f) {
        <button type="button" [class.active]="store.filter() === f" (click)="store.setFilter(f)">
          {{ f }} ({{ store.counts()[f] }})
        </button>
      }
    </div>

    <app-employee-list
      [employees]="store.visible()"
      (edit)="store.startEdit($event)"
      (toggle)="store.toggleActive($event)"
      (remove)="onRemove($event)" />
  `,
})
export class EmployeePageComponent {
  protected readonly store = inject(EmployeeStore);
  protected readonly filters: StatusFilter[] = ['all', 'active', 'inactive'];
  private readonly form = viewChild.required(EmployeeFormComponent);

  protected onSave(input: EmployeeInput) {
    const wasAdding = !this.store.editing();
    if (this.store.save(input) && wasAdding) this.form().clear();
  }

  protected onRemove(e: Employee) {
    if (confirm(`Delete ${e.name}?`)) this.store.remove(e.id);
  }
}
```

### What the interviewer checks

- Smart vs dumb components: only the page injects the store.
- Immutable updates, `track e.id`, `@empty` block.
- Storage is validated on load. Try it: put `[{"bad":1}]` in localStorage and refresh. The app should start empty, not crash.
- The edit form fills correctly, and Cancel clears it.

### Likely follow-up twists

- "Sync between two browser tabs" → listen to `window`'s `storage` event and reload state from storage.
- "Undo delete" → keep `lastDeleted` in state and show a 5-second toast with Undo.
- "Replace localStorage with an API" → only the store changes; components stay the same. Say this out loud, because it shows you understand why the store exists.

## Task 3. Registration form with validation (target: 75 min)

One Zod schema holds every rule, including the cross-field "passwords match" check and the skills array. A small `zodValidator` bridge applies the schema to an Angular reactive form and puts each error on the matching control. The only rule outside Zod is the async "email already registered" check.

### Requirements

1. Fields: full name, email, mobile, password, confirm password, skills (dynamic list of name + years), accept terms.
2. Password: min 8 characters, with one uppercase letter, one number and one special character.
3. Confirm password must match.
4. Add/remove skill rows; at least one skill is required.
5. Async check: email must not already exist (`https://dummyjson.com/users/filter?key=email&value=...`).
6. Errors show after a field is touched, or for every field after Submit is clicked.
7. On success, show the submitted data.

### How to approach it

1. Write the Zod schema with all rules and messages.
2. Write the `zodValidator` bridge once (reusable in any form).
3. Build the typed form with `NonNullableFormBuilder` and a `FormArray` for skills.
4. Add the async validator on the email control only.

### Step 1: Schema

```ts
// features/register/register.schema.ts
import { z } from 'zod';

export const SkillSchema = z.object({
  name: z.string().trim().min(1, 'Skill name is required'),
  years: z.number().min(0, 'Cannot be negative').max(50, 'Max 50 years'),
});

export const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Name must be at least 3 characters'),
    email: z.email('Enter a valid email'),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Needs one uppercase letter')
      .regex(/\d/, 'Needs one number')
      .regex(/[^A-Za-z0-9]/, 'Needs one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    skills: z.array(SkillSchema).min(1, 'Add at least one skill'),
    acceptTerms: z.literal(true, { message: 'You must accept the terms' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'], // error lands on the confirm field
  });

export type RegisterInput = z.infer<typeof RegisterSchema>;
```

### Step 2: The Zod → Angular bridge

This is the most impressive part of the task. On every change it runs the schema against the whole form value, clears old Zod errors, then puts each issue on the control at `issue.path`. For example, `['skills', 0, 'name']` lands on the first skill's name input.

```ts
// core/utils/zod-validator.ts
import { AbstractControl, FormArray, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { z } from 'zod';

export function zodValidator(schema: z.ZodType): ValidatorFn {
  return (root: AbstractControl): ValidationErrors | null => {
    clearZodErrors(root);
    const result = schema.safeParse(root.value);
    if (result.success) return null;

    for (const issue of result.error.issues) {
      const path = issue.path.map((p) => (typeof p === 'number' ? p : String(p)));
      const target = path.length ? root.get(path) : null;
      if (target && !target.errors?.['zod']) {
        // keep the first message per control; keep other errors such as emailTaken
        target.setErrors({ ...target.errors, zod: issue.message });
      }
    }
    return { zod: true }; // the form itself is invalid
  };
}

function clearZodErrors(control: AbstractControl): void {
  if (control instanceof FormGroup || control instanceof FormArray) {
    Object.values(control.controls).forEach(clearZodErrors);
  }
  if (control.errors?.['zod']) {
    const { zod: _, ...rest } = control.errors;
    control.setErrors(Object.keys(rest).length ? rest : null);
  }
}
```

### Step 3: Async email validator

```ts
// features/register/user.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { z } from 'zod';
import { parseWith } from '../../core/utils/parse-with';

const FilterResponseSchema = z.object({ users: z.array(z.object({ id: z.number() })), total: z.number() });

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);

  isEmailTaken(email: string) {
    return this.http
      .get('https://dummyjson.com/users/filter', { params: { key: 'email', value: email } })
      .pipe(parseWith(FilterResponseSchema), map((r) => r.total > 0));
  }
}
```

```ts
// features/register/email-available.validator.ts
import { AsyncValidatorFn } from '@angular/forms';
import { catchError, map, of, switchMap, timer } from 'rxjs';
import { z } from 'zod';
import { UserApi } from './user.api';

export function emailAvailableValidator(api: UserApi): AsyncValidatorFn {
  return (control) => {
    const email = String(control.value ?? '').trim();
    if (!z.email().safeParse(email).success) return of(null); // the format error comes from the schema

    // timer = debounce: Angular cancels this observable when the value changes again
    return timer(500).pipe(
      switchMap(() => api.isEmailTaken(email)),
      map((taken) => (taken ? { emailTaken: true } : null)),
      catchError(() => of(null)), // don't block registration if the check fails
    );
  };
}
```

To test it, `emily.johnson@x.dummyjson.com` exists in DummyJSON, so it should show "already registered".

### Step 4: Component

```ts
// features/register/register.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { zodValidator } from '../../core/utils/zod-validator';
import { RegisterInput, RegisterSchema } from './register.schema';
import { emailAvailableValidator } from './email-available.validator';
import { UserApi } from './user.api';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, JsonPipe],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label>Full name <input formControlName="fullName" autocomplete="name" /></label>
      @if (err('fullName'); as e) { <small class="err">{{ e }}</small> }

      <label>Email <input type="email" formControlName="email" autocomplete="email" /></label>
      @if (form.controls.email.pending) { <small>Checking…</small> }
      @if (err('email'); as e) { <small class="err">{{ e }}</small> }

      <label>Mobile <input type="tel" formControlName="phone" maxlength="10" /></label>
      @if (err('phone'); as e) { <small class="err">{{ e }}</small> }

      <label>Password <input type="password" formControlName="password" autocomplete="new-password" /></label>
      @if (err('password'); as e) { <small class="err">{{ e }}</small> }

      <label>Confirm password <input type="password" formControlName="confirmPassword" /></label>
      @if (err('confirmPassword'); as e) { <small class="err">{{ e }}</small> }

      <fieldset formArrayName="skills">
        <legend>Skills</legend>
        @for (skill of skills.controls; track skill; let i = $index) {
          <div class="skill-row" [formGroupName]="i">
            <input formControlName="name" placeholder="Skill (e.g. Angular)" [attr.aria-label]="'Skill ' + (i + 1)" />
            <input type="number" formControlName="years" min="0" aria-label="Years" />
            <button type="button" (click)="removeSkill(i)" [disabled]="skills.length === 1">Remove</button>
            @if (err('skills.' + i + '.name'); as e) { <small class="err">{{ e }}</small> }
            @if (err('skills.' + i + '.years'); as e) { <small class="err">{{ e }}</small> }
          </div>
        }
        @if (err('skills'); as e) { <small class="err">{{ e }}</small> }
        <button type="button" (click)="addSkill()">+ Add skill</button>
      </fieldset>

      <label><input type="checkbox" formControlName="acceptTerms" /> I accept the terms</label>
      @if (err('acceptTerms'); as e) { <small class="err">{{ e }}</small> }

      <button type="submit" [disabled]="form.pending">Register</button>
    </form>

    @if (result(); as r) {
      <h3>Registered successfully</h3>
      <pre>{{ r | json }}</pre>
    }
  `,
})
export class RegisterComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly userApi = inject(UserApi);

  protected readonly submitted = signal(false);
  protected readonly result = signal<RegisterInput | null>(null);

  protected readonly form = this.fb.group(
    {
      fullName: '',
      email: this.fb.control('', { asyncValidators: [emailAvailableValidator(this.userApi)] }),
      phone: '',
      password: '',
      confirmPassword: '',
      skills: this.fb.array([this.newSkill()]),
      acceptTerms: false,
    },
    { validators: zodValidator(RegisterSchema) },
  );

  protected get skills() {
    return this.form.controls.skills;
  }

  protected addSkill() { this.skills.push(this.newSkill()); }
  protected removeSkill(i: number) { this.skills.removeAt(i); }

  /** returns the message to show for a control path, or null */
  protected err(path: string): string | null {
    const c = this.form.get(path);
    if (!c || !(c.touched || this.submitted())) return null;
    if (c.hasError('emailTaken')) return 'This email is already registered';
    return c.getError('zod') ?? null;
  }

  protected submit() {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.form.pending) return;

    // parse gives a fully typed RegisterInput (acceptTerms is the literal true)
    const data = RegisterSchema.parse(this.form.getRawValue());
    this.result.set(data);
  }

  private newSkill() {
    return this.fb.group({ name: '', years: 0 });
  }
}
```

### What the interviewer checks

- Cross-field validation, where the error shows on the confirm field and not the whole form.
- `FormArray` add and remove, using `[formGroupName]="i"` inside `formArrayName`.
- The async validator is debounced, shows a "Checking…" state, and the submit button is disabled while pending.
- Typed forms: `form.controls.skills` is typed, so there's no `as FormArray` cast.
- One schema could be shared with a Node backend (your freelance projects use Node), so client and server validate the same way. Mention this.

### Likely follow-up twists

- "Password strength meter" → add a `computed` over `toSignal(form.controls.password.valueChanges)` that counts how many regex rules pass.
- "Warn before leaving with unsaved changes" → add a `canDeactivate` guard that checks `form.dirty`.
- "Multi-step wizard" → split into nested groups and validate with `RegisterSchema.pick({...})` per step.

## Task 4. Server-side pagination and sorting table (target: 75 min)

**The URL is the single source of truth.** A click only changes the query params. The store reads the params, Zod cleans them (bad or missing values fall back to defaults), and one stream fetches the page. Refresh, Back/Forward and shared links all work for free.

The flow runs one way: click → `router.navigate` → `queryParamMap` → Zod parse → `switchMap` fetch → state → template.

### Requirements

1. Table of users from `https://dummyjson.com/users` with `limit`, `skip`, `sortBy`, `order`.
2. Sortable columns: ID, Name, Email, Age. Click toggles asc/desc and shows an arrow.
3. Pagination: Prev / Next, up to 5 page numbers, page size 5 / 10 / 20, and "Showing 11–20 of 208".
4. State in the URL, e.g. `/users?page=3&size=10&sortBy=age&order=desc`.
5. Invalid URLs such as `?page=abc&size=999` must not break the page.

### How to approach it

1. Schema for the API response **and** a schema for the URL query (with `.catch()` defaults).
2. The store reads the route, exposes `query`, fetches on every change, and offers navigation methods.
3. The component is just a table and a pager calling store methods.

### Step 1: Models

```ts
// features/users-table/user.model.ts
import { z } from 'zod';

export const UserRowSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  age: z.number(),
  role: z.enum(['admin', 'moderator', 'user']),
});

export const UsersPageSchema = z.object({
  users: z.array(UserRowSchema),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
});

export const SORT_KEYS = ['id', 'firstName', 'email', 'age'] as const;
export const PAGE_SIZES = [5, 10, 20] as const;

// URL query params are always strings (or null), so coerce and fall back with .catch()
export const TableQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().pipe(z.union([z.literal(5), z.literal(10), z.literal(20)])).catch(10),
  sortBy: z.enum(SORT_KEYS).catch('id'),
  order: z.enum(['asc', 'desc']).catch('asc'),
});

export type UserRow = z.infer<typeof UserRowSchema>;
export type TableQuery = z.infer<typeof TableQuerySchema>;
export type SortKey = (typeof SORT_KEYS)[number];
```

Try `TableQuerySchema.parse({ page: 'abc', size: '999', sortBy: 'hack', order: null })`. It returns `{ page: 1, size: 10, sortBy: 'id', order: 'asc' }`. This is exactly requirement 5.

### Step 2: API

```ts
// features/users-table/users-table.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseWith } from '../../core/utils/parse-with';
import { TableQuery, UsersPageSchema } from './user.model';

@Injectable({ providedIn: 'root' })
export class UsersTableApi {
  private readonly http = inject(HttpClient);

  list(q: TableQuery) {
    return this.http
      .get('https://dummyjson.com/users', {
        params: {
          limit: q.size,
          skip: (q.page - 1) * q.size,
          sortBy: q.sortBy,
          order: q.order,
          select: 'firstName,lastName,email,age,role',
        },
      })
      .pipe(parseWith(UsersPageSchema));
  }
}
```

### Step 3: Store

```ts
// features/users-table/users-table.store.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { LoadStatus } from '../../shared/models/load-status';
import { toErrorMessage } from '../../core/utils/error-message';
import { SortKey, TableQuery, TableQuerySchema, UserRow } from './user.model';
import { UsersTableApi } from './users-table.api';

interface TableState {
  users: UserRow[];
  total: number;
  status: LoadStatus;
  error: string | null;
}

@Injectable() // provided in the component: it needs that component's ActivatedRoute
export class UsersTableStore {
  private readonly api = inject(UsersTableApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly state = signal<TableState>({ users: [], total: 0, status: 'idle', error: null });

  /** the URL, parsed and cleaned by Zod */
  readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((p) =>
        TableQuerySchema.parse({
          page: p.get('page'),
          size: p.get('size'),
          sortBy: p.get('sortBy'),
          order: p.get('order'),
        }),
      ),
    ),
    { requireSync: true },
  );

  // selectors
  readonly users = computed(() => this.state().users);
  readonly total = computed(() => this.state().total);
  readonly status = computed(() => this.state().status);
  readonly error = computed(() => this.state().error);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.query().size)));
  readonly from = computed(() => (this.total() === 0 ? 0 : (this.query().page - 1) * this.query().size + 1));
  readonly to = computed(() => Math.min(this.query().page * this.query().size, this.total()));
  readonly pageWindow = computed(() => {
    const total = this.totalPages();
    const current = this.query().page;
    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    start = Math.max(1, end - 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  constructor() {
    toObservable(this.query)
      .pipe(
        tap(() => this.patch({ status: 'loading', error: null })),
        switchMap((q) =>
          this.api.list(q).pipe(
            map((res) => ({ ok: true as const, q, res })),
            catchError((err) => of({ ok: false as const, message: toErrorMessage(err) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        if (!r.ok) {
          this.patch({ status: 'error', error: r.message });
          return;
        }
        this.patch({ users: r.res.users, total: r.res.total, status: 'success' });

        // ?page=999 -> jump to the real last page
        const last = Math.max(1, Math.ceil(r.res.total / r.q.size));
        if (r.q.page > last) this.goToPage(last);
      });
  }

  // methods only change the URL
  goToPage(page: number) {
    this.navigate({ page });
  }

  setSize(size: number) {
    this.navigate({ size, page: 1 });
  }

  sort(key: SortKey) {
    const { sortBy, order } = this.query();
    const nextOrder = sortBy === key && order === 'asc' ? 'desc' : 'asc';
    this.navigate({ sortBy: key, order: nextOrder, page: 1 });
  }

  retry() {
    // re-trigger the current query
    this.patch({ status: 'loading' });
    this.api.list(this.query()).subscribe({
      next: (res) => this.patch({ users: res.users, total: res.total, status: 'success', error: null }),
      error: (err) => this.patch({ status: 'error', error: toErrorMessage(err) }),
    });
  }

  private navigate(params: Partial<TableQuery>) {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  private patch(p: Partial<TableState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

### Step 4: Component

```ts
// features/users-table/users-table.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { UsersTableStore } from './users-table.store';
import { PAGE_SIZES, SortKey } from './user.model';

@Component({
  selector: 'app-users-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [UsersTableStore],
  imports: [TitleCasePipe],
  template: `
    @if (store.status() === 'error') {
      <div role="alert">{{ store.error() }} <button type="button" (click)="store.retry()">Retry</button></div>
    }

    <table [class.loading]="store.status() === 'loading'">
      <thead>
        <tr>
          @for (col of columns; track col.key) {
            <th [attr.aria-sort]="ariaSort(col.key)">
              <button type="button" (click)="store.sort(col.key)">
                {{ col.label }} {{ arrow(col.key) }}
              </button>
            </th>
          }
          <th>Role</th>
        </tr>
      </thead>
      <tbody>
        @for (u of store.users(); track u.id) {
          <tr>
            <td>{{ u.id }}</td>
            <td>{{ u.firstName }} {{ u.lastName }}</td>
            <td>{{ u.email }}</td>
            <td>{{ u.age }}</td>
            <td>{{ u.role | titlecase }}</td>
          </tr>
        } @empty {
          @if (store.status() === 'success') { <tr><td colspan="5">No users.</td></tr> }
        }
      </tbody>
    </table>

    <nav class="pager" aria-label="Pagination">
      <span>Showing {{ store.from() }}–{{ store.to() }} of {{ store.total() }}</span>

      <button type="button" [disabled]="store.query().page === 1" (click)="store.goToPage(store.query().page - 1)">Prev</button>
      @for (p of store.pageWindow(); track p) {
        <button type="button" [class.active]="p === store.query().page"
                [attr.aria-current]="p === store.query().page ? 'page' : null"
                (click)="store.goToPage(p)">{{ p }}</button>
      }
      <button type="button" [disabled]="store.query().page >= store.totalPages()" (click)="store.goToPage(store.query().page + 1)">Next</button>

      <select #size aria-label="Rows per page" (change)="store.setSize(+size.value)">
        @for (s of pageSizes; track s) {
          <option [value]="s" [selected]="s === store.query().size">{{ s }} / page</option>
        }
      </select>
    </nav>
  `,
  styles: `
    table.loading { opacity: 0.5; pointer-events: none; }
    .pager { display: flex; gap: 0.5rem; align-items: center; margin-top: 1rem; }
    .pager .active { font-weight: 700; text-decoration: underline; }
  `,
})
export class UsersTableComponent {
  protected readonly store = inject(UsersTableStore);
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly columns: { key: SortKey; label: string }[] = [
    { key: 'id', label: 'ID' },
    { key: 'firstName', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'age', label: 'Age' },
  ];

  protected arrow(key: SortKey) {
    const q = this.store.query();
    return q.sortBy !== key ? '' : q.order === 'asc' ? '▲' : '▼';
  }

  protected ariaSort(key: SortKey) {
    const q = this.store.query();
    return q.sortBy !== key ? 'none' : q.order === 'asc' ? 'ascending' : 'descending';
  }
}
```

While a new page loads, the old rows stay visible but dimmed. This avoids the table jumping, and it's a UX point worth mentioning.

### What the interviewer checks

- Refresh on page 3, sorted by age desc: does it stay there? Does Back return to page 2?
- Bad URLs are handled (Zod `.catch()`).
- Changing sort or page size resets to page 1.
- `aria-sort` and `aria-current` for accessibility.
- `skip = (page - 1) * size`. Interviewers like to ask this off-by-one.

### Likely follow-up twists

- "Add a search box" → add `q: z.string().catch('')` to the query schema. Debounce input in the component, then `navigate({ q, page: 1 })` with `replaceUrl: true` so every keystroke doesn't add history.
- "Client-side instead of server-side" → fetch all once, then do sorting and slicing in `computed`.
- "Make it a reusable table component" → make it generic over `T`, with `columns` as an input and an `ng-template` per cell.

## Task 5. Login with guards and interceptor (target: 90 min)

An `AuthStore` owns the session (token + user) and persists it, validated by Zod. A functional interceptor attaches the token to protected API calls and logs the user out on 401. Three functional guards protect routes: `authGuard` (logged in), `guestGuard` (logged out, for `/login`) and `roleGuard('admin')`.

### Requirements

1. Login with username and password using DummyJSON (`POST https://dummyjson.com/auth/login`). Test user: `emilys` / `emilyspass`, who has the admin role.
2. After login, fetch the profile (`GET /auth/me`) to get the role, then go to the page the user originally asked for.
3. Keep the session after refresh; Logout clears it.
4. Interceptor adds `Authorization: Bearer <token>` to protected requests.
5. On any 401: log out and redirect to `/login?returnUrl=...`.
6. `/admin` is only for logged-in admins; others get a "Forbidden" page.

To find a non-admin user for testing, open `https://dummyjson.com/users?select=username,password,role` and pick one with role `user`.

### How to approach it

1. Schemas: login request, login response, user profile, and the stored session.
2. `AuthApi` (HTTP only) and `AuthStore` (state + login/logout + persistence).
3. Interceptor, then guards, then the login and admin pages.

### Step 1: Models

```ts
// core/auth/auth.model.ts
import { z } from 'zod';

export const ROLES = ['admin', 'moderator', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const LoginResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const AuthUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  image: z.url(),
  role: z.enum(ROLES),
});

export const SessionSchema = z.object({
  token: z.string().min(1),
  user: AuthUserSchema,
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type Session = z.infer<typeof SessionSchema>;
```

### Step 2: API

```ts
// core/auth/auth.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseWith } from '../utils/parse-with';
import { AuthUserSchema, LoginRequest, LoginResponseSchema } from './auth.model';

export const AUTH_BASE = 'https://dummyjson.com/auth';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(body: LoginRequest) {
    return this.http
      .post(`${AUTH_BASE}/login`, { ...body, expiresInMins: 30 })
      .pipe(parseWith(LoginResponseSchema));
  }

  /** pass a token right after login, before it is in the store; otherwise the interceptor adds it */
  me(token?: string) {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return this.http.get(`${AUTH_BASE}/me`, { headers }).pipe(parseWith(AuthUserSchema));
  }
}
```

### Step 3: Store

```ts
// core/auth/auth.store.ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { LoadStatus } from '../../shared/models/load-status';
import { loadFromStorage, removeFromStorage, saveToStorage } from '../utils/storage';
import { toErrorMessage } from '../utils/error-message';
import { LoginRequest, Session, SessionSchema } from './auth.model';
import { AuthApi } from './auth.api';

const SESSION_KEY = 'mt.session';

interface AuthState {
  session: Session | null;
  status: LoadStatus;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  private readonly state = signal<AuthState>({
    session: loadFromStorage(SESSION_KEY, SessionSchema.nullable(), null),
    status: 'idle',
    error: null,
  });

  // selectors
  readonly user = computed(() => this.state().session?.user ?? null);
  readonly token = computed(() => this.state().session?.token ?? null);
  readonly role = computed(() => this.user()?.role ?? null);
  readonly isLoggedIn = computed(() => this.token() !== null);
  readonly loading = computed(() => this.state().status === 'loading');
  readonly error = computed(() => this.state().error);

  constructor() {
    effect(() => {
      const session = this.state().session;
      if (session) saveToStorage(SESSION_KEY, session);
      else removeFromStorage(SESSION_KEY);
    });
  }

  login(credentials: LoginRequest, returnUrl = '/admin') {
    this.patch({ status: 'loading', error: null });

    this.api
      .login(credentials)
      .pipe(
        switchMap((res) =>
          this.api.me(res.accessToken).pipe(map((user): Session => ({ token: res.accessToken, user }))),
        ),
      )
      .subscribe({
        next: (session) => {
          this.patch({ session, status: 'success' });
          this.router.navigateByUrl(returnUrl);
        },
        error: (err) => this.patch({ status: 'error', error: toErrorMessage(err) }),
      });
  }

  logout(expired = false) {
    const returnUrl = this.router.url;
    this.patch({ session: null, status: 'idle', error: expired ? 'Session expired. Please log in again.' : null });
    this.router.navigate(['/login'], { queryParams: expired ? { returnUrl } : {} });
  }

  /** demo only: break the token to show 401 handling */
  breakTokenForDemo() {
    const s = this.state().session;
    if (s) this.patch({ session: { ...s, token: 'expired-token' } });
  }

  private patch(p: Partial<AuthState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

### Step 4: Interceptor

```ts
// core/auth/auth.interceptor.ts
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { AUTH_BASE } from './auth.api';

// only send the token to our own protected API, never to third-party URLs
const PROTECTED_PREFIXES = [AUTH_BASE];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const token = auth.token();
  const isProtected = PROTECTED_PREFIXES.some((p) => req.url.startsWith(p));
  const isLoginCall = req.url.endsWith('/auth/login');

  const authReq =
    token && isProtected && !isLoginCall && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isLoginCall && auth.isLoggedIn()) {
        auth.logout(true);
      }
      return throwError(() => err); // always re-throw so the caller can show its own error
    }),
  );
};
```

Why the prefix check matters: attaching the token to every URL would leak it to any third-party API you call. Interviewers love this point.

### Step 5: Guards

```ts
// core/auth/auth.guards.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { Role } from './auth.model';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree(['/admin']) : true;
};

export function roleGuard(...allowed: Role[]): CanActivateFn {
  return () => {
    const role = inject(AuthStore).role();
    const router = inject(Router);
    return role && allowed.includes(role) ? true : router.createUrlTree(['/forbidden']);
  };
}
```

Add the Forbidden route to `app.routes.ts` (above the `**` route):

```ts
{ path: 'forbidden', loadComponent: () => import('./features/auth/forbidden.component').then((m) => m.ForbiddenComponent) },
```

```ts
// features/auth/forbidden.component.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  template: `<h2>403 — You don't have access to this page</h2><a routerLink="/products">Go home</a>`,
})
export class ForbiddenComponent {}
```

Why return a `UrlTree` instead of calling `router.navigate()` inside the guard: the router cancels the current navigation cleanly and redirects in one step, with no race conditions.

### Step 6: Login page

```ts
// features/auth/login.component.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { zodValidator } from '../../core/utils/zod-validator';
import { AuthStore } from '../../core/auth/auth.store';
import { LoginRequestSchema } from '../../core/auth/auth.model';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h2>Log in</h2>

      <label>Username <input formControlName="username" autocomplete="username" /></label>
      @if (err('username'); as e) { <small class="err">{{ e }}</small> }

      <label>Password
        <input [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
      </label>
      <button type="button" (click)="showPassword.set(!showPassword())">{{ showPassword() ? 'Hide' : 'Show' }}</button>
      @if (err('password'); as e) { <small class="err">{{ e }}</small> }

      @if (auth.error()) { <p class="err" role="alert">{{ auth.error() }}</p> }

      <button type="submit" [disabled]="auth.loading()">{{ auth.loading() ? 'Logging in…' : 'Log in' }}</button>
    </form>
  `,
})
export class LoginComponent {
  protected readonly auth = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);

  /** bound from ?returnUrl=... by withComponentInputBinding() */
  readonly returnUrl = input<string>();

  /** prevent open redirects: only allow internal paths */
  private readonly safeReturnUrl = computed(() => {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/admin';
  });

  protected readonly submitted = signal(false);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.group(
    { username: '', password: '' },
    { validators: zodValidator(LoginRequestSchema) }, // reused from Task 3
  );

  protected err(path: 'username' | 'password') {
    const c = this.form.controls[path];
    return c.touched || this.submitted() ? (c.getError('zod') ?? null) : null;
  }

  protected submit() {
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.auth.login(LoginRequestSchema.parse(this.form.getRawValue()), this.safeReturnUrl());
  }
}
```

### Step 7: Admin page (proves the interceptor works)

```ts
// features/auth/admin.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { AuthStore } from '../../core/auth/auth.store';
import { AuthApi } from '../../core/auth/auth.api';
import { AuthUser } from '../../core/auth/auth.model';

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  template: `
    @if (auth.user(); as u) {
      <header>
        <img [src]="u.image" [alt]="u.firstName" width="48" height="48" />
        <h2>Welcome, {{ u.firstName }} ({{ u.role }})</h2>
      </header>
    }

    <button type="button" (click)="callProtected()">Call protected API (/auth/me)</button>
    <button type="button" (click)="auth.breakTokenForDemo(); callProtected()">Simulate expired token</button>
    <button type="button" (click)="auth.logout()">Log out</button>

    @if (profile(); as p) { <pre>{{ p | json }}</pre> }
  `,
})
export class AdminComponent {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(AuthApi);
  protected readonly profile = signal<AuthUser | null>(null);

  protected callProtected() {
    // no header passed here: the interceptor adds it
    this.api.me().subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.profile.set(null), // a 401 is already handled by the interceptor
    });
  }
}
```

### Step 8: App shell with a nav

```ts
// app.ts
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav>
      <a routerLink="/products" routerLinkActive="active">Products</a>
      <a routerLink="/employees" routerLinkActive="active">Employees</a>
      <a routerLink="/register" routerLinkActive="active">Register</a>
      <a routerLink="/users" routerLinkActive="active">Users</a>
      <a routerLink="/admin" routerLinkActive="active">Admin</a>
      @if (auth.isLoggedIn()) {
        <button type="button" (click)="auth.logout()">Logout ({{ auth.user()?.username }})</button>
      } @else {
        <a routerLink="/login">Login</a>
      }
    </nav>
    <main><router-outlet /></main>
  `,
})
export class App {
  protected readonly auth = inject(AuthStore);
}
```

### Test script (run it before you submit)

1. Open `/admin` while logged out → redirected to `/login?returnUrl=%2Fadmin`.
2. Log in as `emilys` → you land back on `/admin`.
3. Refresh → still logged in.
4. Open `/login` while logged in → sent to `/admin`.
5. Click "Simulate expired token" → a 401 logs you out and shows "Session expired".
6. Log in as a `user`-role account and open `/admin` → `/forbidden`.
7. Change localStorage `mt.session` to garbage and refresh → treated as logged out, no crash.

### What the interviewer checks

- Functional interceptor and guards (not class-based).
- Guards return a `UrlTree`, and `returnUrl` is checked against open redirects.
- The token goes only to your own API, and the 401 handler doesn't loop on the login call.
- The session in storage is validated by Zod, so a tampered value can't fake a role shape.
- If asked about security, mention trade-offs: localStorage is readable by XSS. In production, prefer an httpOnly cookie set by the server.

### Likely follow-up twists

- "Refresh the token instead of logging out on 401" → in the interceptor, call `POST /auth/refresh` once, share it with `shareReplay(1)` so parallel requests wait for one refresh, then retry the original request with the new token.
- "Don't even download the admin code for non-admins" → use `canMatch` instead of `canActivate`.
- "Show/hide buttons by role" → write a structural directive `*appHasRole="'admin'"` that reads `AuthStore.role()`.

## Final checklist before you submit any machine test

Run through this list in the last 10 minutes. These are the points interviewers actually score on.

- [ ] `ng build` passes with zero errors and no `any`
- [ ] Every API response goes through a Zod schema; types come from `z.infer`
- [ ] Loading, error (with Retry), empty and success states all render
- [ ] `OnPush` on every component; `track` uses an id
- [ ] No open subscriptions: `takeUntilDestroyed()` or `toSignal`
- [ ] Components only read the store and call its methods; no HTTP in components
- [ ] State updates are immutable (no `push`, no direct property changes)
- [ ] Forms show errors after touch or submit, and the submit button handles pending
- [ ] Buttons have `type="button"`, inputs have labels, and tables use `aria-sort`
- [ ] A 5-line README: how to run, structure, decisions, what you'd do with more time

### Practice plan

Build each task **twice**. The first time, follow this doc. Two days later, rebuild it from a blank project without looking, against the target time. If you can't finish the rebuild in time, you'll know exactly which part to practise again.

| Day | Task | First build | Timed rebuild |
| --- | --- | --- | --- |
| 1 | Setup + Task 1 | 2 hrs | Day 3, 60 min |
| 2 | Task 2 | 2 hrs | Day 4, 75 min |
| 3 | Task 3 | 2.5 hrs | Day 5, 75 min |
| 4 | Task 4 | 2.5 hrs | Day 6, 75 min |
| 5 | Task 5 | 3 hrs | Day 7, 90 min |

### How to explain your code in the interview

Use the same 3-sentence pattern for any task:

1. **Data flow:** "State lives in a signal store; components read selectors and call methods."
2. **Safety:** "Zod validates everything entering the app (API, URL, storage), so types are true at runtime too."
3. **Trade-off:** name one thing you'd change for production, such as httpOnly cookies, NgRx SignalStore, or caching.
