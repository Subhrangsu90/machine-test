# Angular Machine Test Practice — Tasks 6–10

Nov 16, 2026 · @Subhrangsu

## 0. Before you start (5 min)

Build these in the same project as Part 1 (Tasks 1–5). Everything here reuses its shared pieces: `parseWith`, `loadFromStorage` / `saveToStorage`, `zodValidator`, `toErrorMessage` and `LoadStatus`. If you start a fresh project, copy Part 1's "Project setup" section first.

### Extra package

```bash
npm i @angular/cdk   # virtual scroll (Task 8) and overlay/a11y helpers
```

### New folders

```text
src/app/features/
  dynamic-form/   form-schema.model.ts, schema-to-zod.ts, dynamic-field.component.ts, dynamic-form.component.ts, dynamic-form-page.component.ts
  shop/           cart.model.ts, coupon.ts, cart.store.ts, shop-page.component.ts, cart-panel.component.ts, cart-badge.component.ts
  big-list/       big-list.model.ts, virtual-list.component.ts, infinite-list.component.ts, in-view.directive.ts
  ui/             star-rating.component.ts, autocomplete.component.ts, modal.component.ts, ui-demo.component.ts
  dashboard/      dashboard.model.ts, dashboard.api.ts, dashboard.store.ts, page-visibility.ts, bar-chart.component.ts, dashboard.component.ts
```

### Add these routes to `app.routes.ts`

```ts
{ path: 'dynamic-form', loadComponent: () => import('./features/dynamic-form/dynamic-form-page.component').then((m) => m.DynamicFormPageComponent) },
{ path: 'shop', loadComponent: () => import('./features/shop/shop-page.component').then((m) => m.ShopPageComponent) },
{ path: 'virtual-list', loadComponent: () => import('./features/big-list/virtual-list.component').then((m) => m.VirtualListComponent) },
{ path: 'infinite-list', loadComponent: () => import('./features/big-list/infinite-list.component').then((m) => m.InfiniteListComponent) },
{ path: 'ui', loadComponent: () => import('./features/ui/ui-demo.component').then((m) => m.UiDemoComponent) },
{ path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
```

These tasks are harder than Part 1. Each one has a single "core idea" that the interviewer is really testing, called out at the top of each section.

## Task 6. Dynamic form from a JSON schema (target: 90 min)

**Core idea:** the form's *configuration* is data, so validate it like data. A Zod discriminated union checks the JSON config. The config is then turned into two things: a `FormGroup` for the UI and a Zod schema for the submitted values. Conditional fields (`showIf`) are left out of the value schema while hidden, so they never block submit.

### Requirements

1. Render a form from a JSON config with field types: text, email, number, select, checkbox.
2. Support `required`, `minLength`, `maxLength`, `pattern`, `min`, `max`.
3. Support conditional fields: `showIf: { field, equals }`.
4. Reject a broken config (duplicate keys, `showIf` pointing at a missing field) with readable errors.
5. On submit, output only the visible fields' values.
6. Bonus that impresses: a JSON editor so the interviewer can change the config live.

### How to approach it

1. Zod schema for the config (one schema per field type, combined with `z.discriminatedUnion`).
2. Pure functions: `fieldToZod`, `buildValueSchema`, `buildFormGroup`. These are easy to unit test.
3. A dumb `DynamicFieldComponent` renders one field; `DynamicFormComponent` loops over fields.
4. The page holds the JSON editor and shows the output.

### Step 1: Config model

```ts
// features/dynamic-form/form-schema.model.ts
import { z } from 'zod';

const Primitive = z.union([z.string(), z.number(), z.boolean()]);

const BaseField = z.object({
  key: z.string().regex(/^[a-zA-Z]\w*$/, 'key must be a valid identifier'),
  label: z.string().min(1),
  required: z.boolean().default(false),
  showIf: z.object({ field: z.string(), equals: Primitive }).optional(),
});

const TextField = BaseField.extend({
  type: z.literal('text'),
  placeholder: z.string().optional(),
  minLength: z.number().int().positive().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().optional(),
});
const EmailField = BaseField.extend({ type: z.literal('email') });
const NumberField = BaseField.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
});
const SelectField = BaseField.extend({
  type: z.literal('select'),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
});
const CheckboxField = BaseField.extend({ type: z.literal('checkbox') });

export const FieldConfigSchema = z.discriminatedUnion('type', [
  TextField, EmailField, NumberField, SelectField, CheckboxField,
]);

export const FormConfigSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    submitLabel: z.string().default('Submit'),
    fields: z.array(FieldConfigSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    cfg.fields.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: `Duplicate key "${f.key}"` });
      }
      if (f.showIf && !seen.has(f.showIf.field)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'showIf'], message: `showIf must reference an earlier field, got "${f.showIf.field}"` });
      }
      if (f.type === 'text' && f.pattern) {
        try { new RegExp(f.pattern); } catch {
          ctx.addIssue({ code: 'custom', path: ['fields', i, 'pattern'], message: 'Invalid regex' });
        }
      }
      seen.add(f.key);
    });
  });

export type FormConfig = z.infer<typeof FormConfigSchema>;
export type FieldConfig = z.infer<typeof FieldConfigSchema>;
export type FormValues = Record<string, unknown>;
```

### Step 2: Config → value schema and FormGroup (pure functions)

```ts
// features/dynamic-form/schema-to-zod.ts
import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';
import { z } from 'zod';
import { zodValidator } from '../../core/utils/zod-validator';
import { FieldConfig, FormValues } from './form-schema.model';

/** optional fields: treat '' as "not filled" so minLength/pattern only apply when typed */
function emptyAsUndefined(schema: z.ZodType) {
  return z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());
}

export function fieldToZod(f: FieldConfig): z.ZodType {
  const requiredMsg = `${f.label} is required`;

  switch (f.type) {
    case 'text': {
      let s = z.string().trim();
      if (f.minLength) s = s.min(f.minLength, `${f.label} needs at least ${f.minLength} characters`);
      if (f.maxLength) s = s.max(f.maxLength, `${f.label} allows at most ${f.maxLength} characters`);
      if (f.pattern) s = s.regex(new RegExp(f.pattern), `${f.label} format is invalid`);
      return f.required ? z.string().trim().min(1, requiredMsg).pipe(s) : emptyAsUndefined(s);
    }
    case 'email': {
      const s = z.email(`Enter a valid ${f.label.toLowerCase()}`);
      return f.required ? z.string().trim().min(1, requiredMsg).pipe(s) : emptyAsUndefined(s);
    }
    case 'number': {
      let s = z.number({ message: requiredMsg });
      if (f.min !== undefined) s = s.min(f.min, `${f.label} must be at least ${f.min}`);
      if (f.max !== undefined) s = s.max(f.max, `${f.label} must be at most ${f.max}`);
      return f.required ? s : emptyAsUndefined(s);
    }
    case 'select': {
      const values = f.options.map((o) => o.value) as [string, ...string[]];
      const s = z.enum(values, { message: `Select ${f.label.toLowerCase()}` });
      return f.required ? s : emptyAsUndefined(s);
    }
    case 'checkbox':
      return f.required ? z.literal(true, { message: `${f.label} must be checked` }) : z.boolean();
  }
}

export function isVisible(f: FieldConfig, values: FormValues): boolean {
  return !f.showIf || values[f.showIf.field] === f.showIf.equals;
}

/** built from the CURRENT values, so hidden fields are simply not in the schema */
export function buildValueSchema(fields: FieldConfig[], values: FormValues) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    if (isVisible(f, values)) shape[f.key] = fieldToZod(f);
  }
  return z.object(shape); // z.object strips unknown (hidden) keys from the output
}

function defaultValue(f: FieldConfig): unknown {
  if (f.type === 'checkbox') return false;
  if (f.type === 'number') return null;
  return '';
}

function dynamicZodValidator(fields: FieldConfig[]): ValidatorFn {
  return (root) => zodValidator(buildValueSchema(fields, root.value))(root);
}

export function buildFormGroup(fields: FieldConfig[]): FormGroup<Record<string, FormControl<unknown>>> {
  const controls: Record<string, FormControl<unknown>> = {};
  for (const f of fields) controls[f.key] = new FormControl<unknown>(defaultValue(f));
  return new FormGroup(controls, { validators: dynamicZodValidator(fields) });
}
```

Be honest when the interviewer asks about types. Individual controls are `unknown` because the shape only exists at runtime. Type safety comes from two places: the config is validated by `FormConfigSchema`, and the output is parsed by `buildValueSchema` before anyone uses it.

### Step 3: Field component (dumb)

```ts
// features/dynamic-form/dynamic-field.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FieldConfig } from './form-schema.model';

@Component({
  selector: 'app-dynamic-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    @let f = field();
    <div class="field">
      @switch (f.type) {
        @case ('checkbox') {
          <label><input type="checkbox" [formControl]="control()" /> {{ f.label }}</label>
        }
        @case ('select') {
          <label [for]="f.key">{{ f.label }}@if (f.required) {<span aria-hidden="true"> *</span>}</label>
          <select [id]="f.key" [formControl]="control()">
            <option value="">-- Select --</option>
            @for (o of options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select>
        }
        @default {
          <label [for]="f.key">{{ f.label }}@if (f.required) {<span aria-hidden="true"> *</span>}</label>
          <input [id]="f.key" [type]="f.type" [formControl]="control()" [placeholder]="placeholder()" />
        }
      }
      @if (error(); as e) { <small class="err" role="alert">{{ e }}</small> }
    </div>
  `,
})
export class DynamicFieldComponent {
  readonly field = input.required<FieldConfig>();
  readonly control = input.required<FormControl<unknown>>();
  readonly showErrors = input(false);

  // narrow the union in TS, not in the template
  protected readonly options = computed(() => {
    const f = this.field();
    return f.type === 'select' ? f.options : [];
  });
  protected readonly placeholder = computed(() => {
    const f = this.field();
    return f.type === 'text' ? (f.placeholder ?? '') : '';
  });

  protected error(): string | null {
    const c = this.control();
    return c.touched || this.showErrors() ? (c.getError('zod') ?? null) : null;
  }
}
```

### Step 4: Form component (renders any config)

```ts
// features/dynamic-form/dynamic-form.component.ts
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FormConfig, FormValues } from './form-schema.model';
import { buildFormGroup, buildValueSchema, isVisible } from './schema-to-zod';
import { DynamicFieldComponent } from './dynamic-field.component';

@Component({
  selector: 'app-dynamic-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DynamicFieldComponent],
  template: `
    <form [formGroup]="form()" (ngSubmit)="submit()" novalidate>
      <h2>{{ config().title }}</h2>
      @for (f of config().fields; track f.key) {
        @if (isVisible(f, form().value)) {
          <app-dynamic-field [field]="f" [control]="form().controls[f.key]" [showErrors]="submitted()" />
        }
      }
      <button type="submit">{{ config().submitLabel }}</button>
    </form>
  `,
})
export class DynamicFormComponent {
  readonly config = input.required<FormConfig>();
  readonly submitted$ = output<FormValues>({ alias: 'submitted' });

  /** a new config builds a new FormGroup */
  protected readonly form = computed(() => buildFormGroup(this.config().fields));
  protected readonly submitted = signal(false);
  protected readonly isVisible = isVisible;

  protected submit() {
    this.submitted.set(true);
    const form = this.form();
    form.markAllAsTouched();
    if (form.invalid) return;

    // parse = typed output with hidden fields stripped and strings trimmed
    const values = buildValueSchema(this.config().fields, form.value).parse(form.value);
    this.submitted$.emit(values);
  }
}
```

### Step 5: Page with sample config and live JSON editor

```ts
// features/dynamic-form/dynamic-form-page.component.ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { FormConfig, FormConfigSchema, FormValues } from './form-schema.model';
import { DynamicFormComponent } from './dynamic-form.component';

// in a real app this JSON comes from the backend
const HOTEL_BOOKING = {
  id: 'hotel-booking',
  title: 'Hotel booking',
  submitLabel: 'Book now',
  fields: [
    { key: 'guestName', type: 'text', label: 'Guest name', required: true, minLength: 3 },
    { key: 'email', type: 'email', label: 'Email', required: true },
    { key: 'roomType', type: 'select', label: 'Room type', required: true,
      options: [{ label: 'Standard', value: 'standard' }, { label: 'Deluxe', value: 'deluxe' }, { label: 'Suite', value: 'suite' }] },
    { key: 'guests', type: 'number', label: 'Guests', required: true, min: 1, max: 6 },
    { key: 'isCorporate', type: 'checkbox', label: 'Corporate booking' },
    { key: 'companyName', type: 'text', label: 'Company name', required: true, showIf: { field: 'isCorporate', equals: true } },
    { key: 'gstNumber', type: 'text', label: 'GST number', pattern: '^[0-9A-Z]{15}$', showIf: { field: 'isCorporate', equals: true } },
    { key: 'agree', type: 'checkbox', label: 'I agree to the cancellation policy', required: true },
  ],
};

type ParseResult = { ok: true; config: FormConfig } | { ok: false; errors: string[] };

function parseConfig(text: string): ParseResult {
  try {
    const r = FormConfigSchema.safeParse(JSON.parse(text));
    return r.success
      ? { ok: true, config: r.data }
      : { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`) };
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }
}

@Component({
  selector: 'app-dynamic-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, JsonPipe],
  template: `
    <div class="layout">
      <section>
        <h3>Config (JSON)</h3>
        <textarea #editor rows="24" [value]="draft()" (input)="draft.set(editor.value)"></textarea>
        <button type="button" (click)="apply()">Apply config</button>
        @if (errors().length) {
          <ul class="err" role="alert">@for (e of errors(); track e) { <li>{{ e }}</li> }</ul>
        }
      </section>

      <section>
        <app-dynamic-form [config]="config()" (submitted)="result.set($event)" />
        @if (result(); as r) { <h3>Submitted</h3><pre>{{ r | json }}</pre> }
      </section>
    </div>
  `,
  styles: `.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; } textarea { width: 100%; font-family: monospace; }`,
})
export class DynamicFormPageComponent {
  protected readonly draft = signal(JSON.stringify(HOTEL_BOOKING, null, 2));
  private readonly applied = signal<FormConfig>(FormConfigSchema.parse(HOTEL_BOOKING));
  protected readonly errors = signal<string[]>([]);
  protected readonly result = signal<FormValues | null>(null);
  protected readonly config = computed(() => this.applied());

  protected apply() {
    const r = parseConfig(this.draft());
    if (r.ok) {
      this.applied.set(r.config);
      this.errors.set([]);
      this.result.set(null);
    } else {
      this.errors.set(r.errors);
    }
  }
}
```

Demo moment: change `"showIf": { "field": "isCorporate" ...}` to `"field": "nope"` and click Apply. The page shows `fields.5.showIf: showIf must reference an earlier field` instead of crashing.

### What the interviewer checks

- The config is validated, not trusted (discriminated union + `superRefine`).
- Hidden required fields don't block submit, and their values don't leak into the output.
- Logic lives in pure functions that are testable without TestBed.
- `track f.key` on fields; a new config rebuilds the form via `computed`.

### Likely follow-up twists

- "Add a new field type (date, textarea, radio)" → one more schema in the union, one `case` in `fieldToZod`, one `@case` in the template. Point out that TypeScript flags every switch you forgot.
- "Fields from the API" → `httpClient.get(url).pipe(parseWith(FormConfigSchema))`.
- "Multi-step form" → add `step: z.number()` to `BaseField` and filter visible fields by the current step.

## Task 7. Shopping cart (target: 90 min)

**Core idea:** store only the minimum (cart lines + coupon code) and **derive** everything else with `computed`: count, subtotal, discount, shipping, tax, total. Money is calculated in whole cents (integers), never in floating-point dollars. One root-level store is shared by the product grid, the cart panel and the header badge.

### Requirements

1. Product grid (`https://dummyjson.com/products?limit=12`) with Add to cart.
2. Cart panel: increase/decrease quantity, remove, clear. Quantity is capped at `min(10, stock)`.
3. Header badge shows the total item count on every page.
4. Coupons: `SAVE10` (10% off, max $50), `FLAT20` ($20 off orders above $100), `FREESHIP` (free shipping).
5. Summary: subtotal, discount, shipping ($4.99, free above $50), GST 18%, total.
6. The cart survives a refresh.

### How to approach it

1. Schemas: cart line, persisted cart, coupon code format, coupon definitions.
2. Store: two pieces of real state, and a chain of `computed` values for the money.
3. Components: shop page (grid), cart panel, header badge. All three inject the same store.

### Step 1: Models

```ts
// features/shop/cart.model.ts
import { z } from 'zod';

export const CartItemSchema = z.object({
  productId: z.number(),
  title: z.string(),
  thumbnail: z.url(),
  unitPrice: z.number().nonnegative(), // price snapshot when added
  quantity: z.number().int().min(1),
  maxQuantity: z.number().int().min(1),
});

export const PersistedCartSchema = z.object({
  items: z.array(CartItemSchema),
  couponCode: z.string().nullable(),
});

export const CouponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,12}$/, 'Coupon codes are 4–12 letters or numbers');

export type CartItem = z.infer<typeof CartItemSchema>;
export type PersistedCart = z.infer<typeof PersistedCartSchema>;
```

```ts
// features/shop/coupon.ts
import { z } from 'zod';

export const CouponSchema = z.discriminatedUnion('kind', [
  z.object({ code: z.string(), kind: z.literal('percent'), percent: z.number().min(1).max(100), maxOffCents: z.number().int().optional(), minSubtotalCents: z.number().int().default(0) }),
  z.object({ code: z.string(), kind: z.literal('flat'), offCents: z.number().int().positive(), minSubtotalCents: z.number().int().default(0) }),
  z.object({ code: z.string(), kind: z.literal('freeShipping'), minSubtotalCents: z.number().int().default(0) }),
]);

export type Coupon = z.infer<typeof CouponSchema>;

// in a real app: GET /coupons/:code from the backend, parsed with CouponSchema
export const COUPONS: Coupon[] = CouponSchema.array().parse([
  { code: 'SAVE10', kind: 'percent', percent: 10, maxOffCents: 5000 },
  { code: 'FLAT20', kind: 'flat', offCents: 2000, minSubtotalCents: 10000 },
  { code: 'FREESHIP', kind: 'freeShipping' },
]);
```

Add a `list` method to Part 1's `ProductApi`:

```ts
// features/products/product.api.ts (add)
list(limit = 12) {
  return this.http.get(this.base, { params: { limit } }).pipe(parseWith(ProductsResponseSchema));
}
```

### Step 2: Store

```ts
// features/shop/cart.store.ts
import { Injectable, computed, effect, signal } from '@angular/core';
import { loadFromStorage, saveToStorage } from '../../core/utils/storage';
import { Product } from '../products/product.model';
import { CartItem, CouponCodeSchema, PersistedCartSchema } from './cart.model';
import { COUPONS } from './coupon';

const STORAGE_KEY = 'mt.cart';
const SHIPPING_CENTS = 499;
const FREE_SHIPPING_ABOVE_CENTS = 5000;
const GST_RATE = 0.18;
const MAX_PER_ITEM = 10;

const toCents = (dollars: number) => Math.round(dollars * 100);

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  couponInputError: string | null;
}

@Injectable({ providedIn: 'root' }) // root: the header badge and the shop share it
export class CartStore {
  private readonly state = signal<CartState>({
    ...loadFromStorage(STORAGE_KEY, PersistedCartSchema, { items: [], couponCode: null }),
    couponInputError: null,
  });

  // --- real state
  readonly items = computed(() => this.state().items);
  readonly couponInputError = computed(() => this.state().couponInputError);

  // --- derived state
  readonly itemCount = computed(() => this.items().reduce((n, i) => n + i.quantity, 0));
  readonly isEmpty = computed(() => this.items().length === 0);
  readonly quantities = computed(() => new Map(this.items().map((i) => [i.productId, i.quantity])));

  readonly subtotalCents = computed(() =>
    this.items().reduce((sum, i) => sum + toCents(i.unitPrice) * i.quantity, 0),
  );

  readonly coupon = computed(() => COUPONS.find((c) => c.code === this.state().couponCode) ?? null);

  /** applied, but not eligible yet (e.g. below the minimum) */
  readonly couponWarning = computed(() => {
    const c = this.coupon();
    const missing = c ? c.minSubtotalCents - this.subtotalCents() : 0;
    return c && missing > 0 ? `Add $${(missing / 100).toFixed(2)} more to use ${c.code}` : null;
  });

  readonly discountCents = computed(() => {
    const c = this.coupon();
    const subtotal = this.subtotalCents();
    if (!c || this.couponWarning()) return 0;
    switch (c.kind) {
      case 'percent': {
        const off = Math.round((subtotal * c.percent) / 100);
        return c.maxOffCents ? Math.min(off, c.maxOffCents) : off;
      }
      case 'flat':
        return Math.min(c.offCents, subtotal);
      case 'freeShipping':
        return 0;
    }
  });

  readonly shippingCents = computed(() => {
    const afterDiscount = this.subtotalCents() - this.discountCents();
    const freeByCoupon = this.coupon()?.kind === 'freeShipping' && !this.couponWarning();
    if (this.isEmpty() || freeByCoupon || afterDiscount >= FREE_SHIPPING_ABOVE_CENTS) return 0;
    return SHIPPING_CENTS;
  });

  readonly taxCents = computed(() => Math.round((this.subtotalCents() - this.discountCents()) * GST_RATE));

  readonly totalCents = computed(
    () => this.subtotalCents() - this.discountCents() + this.shippingCents() + this.taxCents(),
  );

  constructor() {
    effect(() => {
      const { items, couponCode } = this.state();
      saveToStorage(STORAGE_KEY, { items, couponCode });
    });
  }

  // --- methods
  add(p: Product) {
    const existing = this.items().find((i) => i.productId === p.id);
    if (existing) return this.setQuantity(p.id, existing.quantity + 1);
    if (p.stock < 1) return;
    const item: CartItem = {
      productId: p.id, title: p.title, thumbnail: p.thumbnail, unitPrice: p.price,
      quantity: 1, maxQuantity: Math.min(MAX_PER_ITEM, p.stock),
    };
    this.patch({ items: [...this.items(), item] });
  }

  setQuantity(productId: number, quantity: number) {
    if (quantity < 1) return this.remove(productId);
    this.patch({
      items: this.items().map((i) =>
        i.productId === productId ? { ...i, quantity: Math.min(quantity, i.maxQuantity) } : i,
      ),
    });
  }

  increment(id: number) { this.setQuantity(id, (this.quantities().get(id) ?? 0) + 1); }
  decrement(id: number) { this.setQuantity(id, (this.quantities().get(id) ?? 0) - 1); }
  remove(id: number) { this.patch({ items: this.items().filter((i) => i.productId !== id) }); }
  clear() { this.patch({ items: [], couponCode: null, couponInputError: null }); }

  applyCoupon(raw: string) {
    const parsed = CouponCodeSchema.safeParse(raw);
    if (!parsed.success) return this.patch({ couponInputError: parsed.error.issues[0].message });
    if (!COUPONS.some((c) => c.code === parsed.data)) return this.patch({ couponInputError: 'This coupon does not exist' });
    this.patch({ couponCode: parsed.data, couponInputError: null });
  }

  removeCoupon() { this.patch({ couponCode: null, couponInputError: null }); }

  private patch(p: Partial<CartState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

Why cents: in JavaScript, `0.1 + 0.2 === 0.30000000000000004`. Summing prices like $9.99 × 3 drifts. Convert once with `Math.round(x * 100)`, do all maths in integers, and divide by 100 only for display.

### Step 3: Header badge

```ts
// features/shop/cart-badge.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a routerLink="/shop" [attr.aria-label]="'Cart, ' + cart.itemCount() + ' items'">
      🛒 @if (cart.itemCount() > 0) { <span class="badge">{{ cart.itemCount() }}</span> }
    </a>
  `,
  styles: `.badge { background: crimson; color: #fff; border-radius: 999px; padding: 0 6px; font-size: 12px; }`,
})
export class CartBadgeComponent {
  protected readonly cart = inject(CartStore);
}
```

Add `<app-cart-badge />` to the `<nav>` in `app.ts` and import `CartBadgeComponent` there.

### Step 4: Cart panel

```ts
// features/shop/cart-panel.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe],
  template: `
    <aside aria-labelledby="cart-title">
      <h2 id="cart-title">Cart ({{ cart.itemCount() }})</h2>

      @for (i of cart.items(); track i.productId) {
        <div class="line">
          <img [src]="i.thumbnail" alt="" width="48" height="48" />
          <span class="title">{{ i.title }}</span>
          <button type="button" (click)="cart.decrement(i.productId)" [attr.aria-label]="'Decrease ' + i.title">−</button>
          <span aria-live="polite">{{ i.quantity }}</span>
          <button type="button" (click)="cart.increment(i.productId)" [disabled]="i.quantity >= i.maxQuantity"
                  [attr.aria-label]="'Increase ' + i.title">+</button>
          <span>{{ i.unitPrice * i.quantity | currency }}</span>
          <button type="button" (click)="cart.remove(i.productId)">Remove</button>
        </div>
      } @empty {
        <p>Your cart is empty.</p>
      }

      @if (!cart.isEmpty()) {
        <div class="coupon">
          @if (cart.coupon(); as c) {
            <p>Coupon <strong>{{ c.code }}</strong> applied <button type="button" (click)="cart.removeCoupon()">Remove</button></p>
            @if (cart.couponWarning(); as w) { <small class="warn">{{ w }}</small> }
          } @else {
            <input #code placeholder="Coupon code" aria-label="Coupon code" (keyup.enter)="cart.applyCoupon(code.value)" />
            <button type="button" (click)="cart.applyCoupon(code.value)">Apply</button>
            @if (cart.couponInputError(); as e) { <small class="err">{{ e }}</small> }
          }
        </div>

        <dl class="summary">
          <dt>Subtotal</dt><dd>{{ cart.subtotalCents() / 100 | currency }}</dd>
          @if (cart.discountCents() > 0) { <dt>Discount</dt><dd>−{{ cart.discountCents() / 100 | currency }}</dd> }
          <dt>Shipping</dt><dd>{{ cart.shippingCents() === 0 ? 'Free' : (cart.shippingCents() / 100 | currency) }}</dd>
          <dt>GST (18%)</dt><dd>{{ cart.taxCents() / 100 | currency }}</dd>
          <dt><strong>Total</strong></dt><dd><strong>{{ cart.totalCents() / 100 | currency }}</strong></dd>
        </dl>

        <button type="button" (click)="cart.clear()">Clear cart</button>
      }
    </aside>
  `,
  styles: `
    .line { display: grid; grid-template-columns: 48px 1fr auto auto auto auto auto; gap: 0.5rem; align-items: center; }
    .summary { display: grid; grid-template-columns: 1fr auto; }
  `,
})
export class CartPanelComponent {
  protected readonly cart = inject(CartStore);
}
```

### Step 5: Shop page

```ts
// features/shop/shop-page.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ProductApi } from '../products/product.api';
import { CartStore } from './cart.store';
import { CartPanelComponent } from './cart-panel.component';

@Component({
  selector: 'app-shop-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, CartPanelComponent],
  template: `
    <div class="layout">
      <div class="grid">
        @for (p of products(); track p.id) {
          @let qty = cart.quantities().get(p.id) ?? 0;
          <article class="card">
            <img [src]="p.thumbnail" [alt]="p.title" loading="lazy" width="160" height="160" />
            <h3>{{ p.title }}</h3>
            <p>{{ p.price | currency }}</p>
            <button type="button" (click)="cart.add(p)" [disabled]="p.stock === 0">
              {{ p.stock === 0 ? 'Out of stock' : qty ? 'Add another (' + qty + ' in cart)' : 'Add to cart' }}
            </button>
          </article>
        } @empty {
          <p>Loading products…</p>
        }
      </div>
      <app-cart-panel />
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 1fr 380px; gap: 2rem; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    app-cart-panel { position: sticky; top: 1rem; }
  `,
})
export class ShopPageComponent {
  protected readonly cart = inject(CartStore);
  protected readonly products = toSignal(
    inject(ProductApi).list(12).pipe(map((r) => r.products), catchError(() => of([]))),
    { initialValue: [] },
  );
}
```

### Test cases to try

1. Add the same product 11 times → quantity stops at 10 (or at its stock).
2. Apply `FLAT20` with a $30 cart → "Add $70.00 more to use FLAT20"; the discount is $0 until the subtotal reaches $100.
3. Apply `SAVE10` on a $900 cart → the discount is capped at $50.
4. Type `ab` → format error; type `NOPE1234` → "does not exist".
5. Refresh → the cart and coupon are still there; the badge shows the same count.

### What the interviewer checks

- Only `items` and `couponCode` are stored; every number is a `computed`, so totals can never go out of sync.
- Integer cents for money.
- One store shared across unrelated components (badge vs page).
- The price snapshot (`unitPrice`) is taken at add time. Be ready to discuss what happens if the price changes later (the backend re-prices at checkout).

### Likely follow-up twists

- "Sync the cart to the server for logged-in users" → an `effect` with debounce that PUTs `{ items, couponCode }`, and on login merges the server cart with the local one.
- "Wishlist" → a second store with the same pattern; a "Move to cart" method calls `CartStore.add`.
- "Unit test the totals" → the store has no DOM, so `TestBed.inject(CartStore)`, call `add`, then assert `totalCents()`.

## Task 8. Rendering 10,000 items (target: 75 min)

**Core idea:** never put 10,000 rows in the DOM; render only what is on screen. Use **virtual scroll** (CDK) when all the data is already in memory. Use **infinite scroll** (IntersectionObserver) when the data comes from a paginated API. Interviewers often ask you to build both and explain when to use which.

| Situation | Use | DOM rows | Memory |
| --- | --- | --- | --- |
| 10k rows already loaded (export, local list) | CDK virtual scroll | \~20–30, recycled | all rows in JS |
| Feed or catalogue from a paginated API | Infinite scroll | grows as you scroll | only loaded pages |
| Huge feed that also grows | Both: virtual scroll + load more near the end | \~20–30 | loaded pages |

### Requirements

1. **Part A:** list of 10,000 guests with search and a status filter. Scrolling stays smooth. Add a "Jump to #5000" button.
2. **Part B:** product feed from `https://dummyjson.com/products?limit=20&skip=N` that loads the next page automatically near the bottom. Show loading, error with Retry, and "end of list".
3. Both use `OnPush` and `track` by id.

### Part A, step 1: Model and data

```ts
// features/big-list/big-list.model.ts
import { z } from 'zod';

export const GuestRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.email(),
  status: z.enum(['active', 'pending', 'blocked']),
  amount: z.number(),
});
export type GuestRow = z.infer<typeof GuestRowSchema>;
export type GuestStatus = GuestRow['status'];

export const FeedItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  price: z.number(),
  category: z.string(),
  thumbnail: z.url(),
});
export const FeedPageSchema = z.object({
  products: z.array(FeedItemSchema),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

/** deterministic fake data, so every refresh looks the same */
export function generateGuests(count: number): GuestRow[] {
  const statuses: GuestStatus[] = ['active', 'pending', 'blocked'];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Guest ${i + 1}`,
    email: `guest${i + 1}@hotel.test`,
    status: statuses[i % 3],
    amount: ((i * 7919) % 100000) / 100,
  }));
}
```

If these 10k rows came from an API, you'd parse them with `z.array(GuestRowSchema)`. That takes a few milliseconds, which is fine. For 100k+ rows, move the parsing to a Web Worker.

### Part A, step 2: Virtual scroll component

```ts
// features/big-list/virtual-list.component.ts
import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { GuestRow, GuestStatus, generateGuests } from './big-list.model';

@Component({
  selector: 'app-virtual-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScrollingModule, CurrencyPipe],
  template: `
    <div class="toolbar">
      <input #q type="search" placeholder="Search name or email" (input)="search.set(q.value)" />
      <select #st (change)="status.set($any(st.value))">
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="blocked">Blocked</option>
      </select>
      <button type="button" (click)="jumpTo(4999)">Jump to #5000</button>
      <span>{{ filtered().length }} rows · first visible: {{ firstVisible() + 1 }}</span>
    </div>

    <cdk-virtual-scroll-viewport class="viewport" itemSize="56" minBufferPx="400" maxBufferPx="800"
                                 (scrolledIndexChange)="firstVisible.set($event)">
      <div *cdkVirtualFor="let r of filtered(); trackBy: trackById" class="row">
        <span class="id">#{{ r.id }}</span>
        <span>{{ r.name }}</span>
        <span class="muted">{{ r.email }}</span>
        <span class="pill" [class]="r.status">{{ r.status }}</span>
        <span>{{ r.amount | currency }}</span>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styles: `
    .viewport { height: 70vh; border: 1px solid #ddd; }
    .row { height: 56px; display: grid; grid-template-columns: 80px 1fr 1.5fr 100px 100px; align-items: center; padding: 0 1rem; border-bottom: 1px solid #f0f0f0; }
    .muted { color: #777; }
    .pill.active { color: green; } .pill.pending { color: orange; } .pill.blocked { color: crimson; }
  `,
})
export class VirtualListComponent {
  private readonly viewport = viewChild.required(CdkVirtualScrollViewport);
  private readonly all = signal(generateGuests(10_000));

  protected readonly search = signal('');
  protected readonly status = signal<GuestStatus | 'all'>('all');
  protected readonly firstVisible = signal(0);

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    return this.all().filter(
      (r) => (status === 'all' || r.status === status) && (!term || r.name.toLowerCase().includes(term) || r.email.includes(term)),
    );
  });

  protected trackById = (_: number, r: GuestRow) => r.id;

  protected jumpTo(index: number) {
    this.viewport().scrollToIndex(index, 'smooth');
  }
}
```

Prove it in the interview: open DevTools → Elements while scrolling. The number of `.row` elements stays around 20–30 even though `filtered().length` is 10,000.

Rules that break virtual scroll if you forget them:

- The viewport needs a **fixed height** (`70vh`), otherwise it renders everything.
- Every row needs the **same height** as `itemSize` (56px). For variable heights, CDK has experimental `autosize`. Say this rather than pretend it's free.
- `*cdkVirtualFor` is still a structural directive (there's no `@for` version), so use `trackBy`.

### Part B, step 1: In-view directive (IntersectionObserver)

```ts
// features/big-list/in-view.directive.ts
import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

@Directive({ selector: '[appInView]' })
export class InViewDirective {
  readonly rootMargin = input('300px'); // start loading 300px before the bottom
  readonly appInView = output<void>();

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) this.appInView.emit();
        },
        { rootMargin: this.rootMargin() },
      );
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
```

Why not a `scroll` event listener: scroll fires dozens of times per second and needs manual height maths. IntersectionObserver runs off the main thread and fires only when the element enters the viewport.

### Part B, step 2: Feed store

```ts
// features/big-list/feed.store.ts
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { parseWith } from '../../core/utils/parse-with';
import { toErrorMessage } from '../../core/utils/error-message';
import { LoadStatus } from '../../shared/models/load-status';
import { FeedItem, FeedPageSchema } from './big-list.model';

const PAGE_SIZE = 20;

interface FeedState {
  items: FeedItem[];
  total: number | null; // null = not loaded yet
  status: LoadStatus;
  error: string | null;
}

@Injectable()
export class FeedStore {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<FeedState>({ items: [], total: null, status: 'idle', error: null });

  readonly items = computed(() => this.state().items);
  readonly total = computed(() => this.state().total);
  readonly status = computed(() => this.state().status);
  readonly error = computed(() => this.state().error);
  readonly hasMore = computed(() => {
    const total = this.total();
    return total === null || this.items().length < total;
  });

  loadMore() {
    if (this.status() === 'loading' || !this.hasMore()) return; // guard against double triggers
    this.patch({ status: 'loading', error: null });

    this.http
      .get('https://dummyjson.com/products', {
        params: { limit: PAGE_SIZE, skip: this.items().length, select: 'title,price,category,thumbnail' },
      })
      .pipe(parseWith(FeedPageSchema), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.patch({ items: [...this.items(), ...page.products], total: page.total, status: 'success' }),
        error: (err) => this.patch({ status: 'error', error: toErrorMessage(err) }),
      });
  }

  private patch(p: Partial<FeedState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

### Part B, step 3: Infinite list component

```ts
// features/big-list/infinite-list.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FeedStore } from './feed.store';
import { InViewDirective } from './in-view.directive';

@Component({
  selector: 'app-infinite-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FeedStore],
  imports: [CurrencyPipe, InViewDirective],
  template: `
    <ul class="feed">
      @for (p of store.items(); track p.id) {
        <li>
          <img [src]="p.thumbnail" [alt]="p.title" width="64" height="64" loading="lazy" />
          <span>{{ p.title }}</span>
          <span>{{ p.price | currency }}</span>
        </li>
      }
    </ul>

    @switch (store.status()) {
      @case ('loading') { <p aria-live="polite">Loading more…</p> }
      @case ('error') {
        <p role="alert">{{ store.error() }} <button type="button" (click)="store.loadMore()">Retry</button></p>
      }
      @default {
        @if (store.hasMore()) {
          <!-- re-created after every load, so a still-visible sentinel fires again -->
          <div class="sentinel" appInView (appInView)="store.loadMore()"></div>
        } @else {
          <p>You've reached the end · {{ store.total() }} items</p>
        }
      }
    }
  `,
  styles: `
    .feed li { display: grid; grid-template-columns: 64px 1fr auto; gap: 1rem; align-items: center; padding: 0.5rem 0; }
    .sentinel { height: 1px; }
  `,
})
export class InfiniteListComponent {
  protected readonly store = inject(FeedStore);
}
```

The subtle bug most candidates miss: if the first page doesn't fill the screen, the sentinel never *leaves* the viewport, so the observer never fires again. Here the sentinel is inside `@default`. It is destroyed while loading and created again afterwards, and a new observer reports "intersecting" immediately. So the list keeps loading until the screen is full.

### What the interviewer checks

- You can say **why**: DOM size drives layout and memory cost, not array size.
- Fixed viewport height and `itemSize`; `trackBy` / `track` by id.
- The double-load guard (`status === 'loading'`), and the observer is disconnected on destroy.
- Error and end states, and an `aria-live` loading message.

### Likely follow-up twists

- "Keep the scroll position when I come back to the page" → keep the store at root level, and save `viewport.measureScrollOffset()` on destroy and restore it on init.
- "Combine both" → virtual scroll, and in `(scrolledIndexChange)` call `loadMore()` when `index > items.length - 30`.
- "Search 10k rows without lag" → debounce the search signal with `toObservable(...).pipe(debounceTime(200))`, or move filtering to a Web Worker.

## Task 9. Reusable components (target: 2 hrs for all three, or 45 min for one)

**Core idea:** a reusable component exposes a clean API and hides its internals. This task uses the three APIs interviewers test most:

- **ControlValueAccessor (CVA)**, so the star rating works with `formControl` and `ngModel`.
- **`model()`** two-way binding, for the autocomplete's selected value and the modal's `open` state.
- **Content projection** (`ng-content` slots), so the modal works with any content.

All three are keyboard-accessible, which separates good answers from average ones.

### Requirements

1. **Star rating:** works in reactive forms; hover preview; arrow keys change the value; supports disabled; click the same star again to clear.
2. **Autocomplete:** generic (works for any item type); debounced search; Up/Down/Enter/Escape; loading and "no matches" states; ARIA combobox.
3. **Modal:** title, body and actions slots; Esc and backdrop click close it; focus is trapped inside while open.
4. **Demo:** a "Write a review" modal using all three, validated with Zod on submit.

### Step 1: Models

```ts
// features/ui/review.model.ts
import { z } from 'zod';

export const UserOptionSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
});
export const UserSearchSchema = z.object({ users: z.array(UserOptionSchema) });

export const ReviewSchema = z.object({
  guest: z.object(UserOptionSchema.shape, { message: 'Pick a guest from the list' }),
  rating: z.number().int().min(1, 'Please give a rating').max(5),
  comment: z.string().trim().min(10, 'Write at least 10 characters').max(500, 'Max 500 characters'),
});

export type UserOption = z.infer<typeof UserOptionSchema>;
export type Review = z.infer<typeof ReviewSchema>;
```

### Step 2: Star rating (ControlValueAccessor)

```ts
// features/ui/star-rating.component.ts
import { ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, input, signal, viewChildren } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { z } from 'zod';

@Component({
  selector: 'app-star-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StarRatingComponent), multi: true }],
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="stars" (mouseleave)="hover.set(0)">
      @for (star of stars(); track star) {
        <button #starBtn type="button" role="radio"
                [attr.aria-checked]="star === value()"
                [attr.aria-label]="star + (star === 1 ? ' star' : ' stars')"
                [tabindex]="star === (value() || 1) ? 0 : -1"
                [disabled]="disabled()"
                [class.filled]="star <= (hover() || value())"
                (mouseenter)="hover.set(star)"
                (click)="toggle(star)"
                (keydown)="onKey($event)"
                (blur)="onTouched()">★</button>
      }
    </div>
  `,
  styles: `
    .stars button { background: none; border: 0; font-size: 1.75rem; color: #ccc; cursor: pointer; }
    .stars button.filled { color: #f5a623; }
    .stars button:focus-visible { outline: 2px solid #4a90e2; }
    .stars button:disabled { cursor: not-allowed; opacity: 0.6; }
  `,
})
export class StarRatingComponent implements ControlValueAccessor {
  readonly max = input(5);
  readonly label = input('Rating');

  protected readonly stars = computed(() => Array.from({ length: this.max() }, (_, i) => i + 1));
  protected readonly value = signal(0);
  protected readonly hover = signal(0);
  protected readonly disabled = signal(false);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('starBtn');

  private onChange: (v: number) => void = () => {};
  protected onTouched: () => void = () => {};

  // --- ControlValueAccessor: the form talks to us through these 4 methods
  writeValue(v: unknown): void {
    const parsed = z.number().int().min(0).max(this.max()).safeParse(v);
    this.value.set(parsed.success ? parsed.data : 0); // null/garbage from the form -> 0
  }
  registerOnChange(fn: (v: number) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  // --- internal
  protected toggle(star: number) {
    this.set(star === this.value() ? 0 : star);
  }

  protected onKey(e: KeyboardEvent) {
    const step = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    const next = Math.min(this.max(), Math.max(1, (this.value() || 0) + step));
    this.set(next);
    this.buttons()[next - 1]?.nativeElement.focus(); // roving tabindex
  }

  private set(v: number) {
    if (this.disabled()) return;
    this.value.set(v);
    this.onChange(v);
    this.onTouched();
  }
}
```

What each CVA method is for (interviewers ask this directly):

| Method | Called by | When |
| --- | --- | --- |
| `writeValue` | Angular | The form sets a value (`setValue`, `reset`, initial value) |
| `registerOnChange` | Angular | Once; you call the fn when the user changes the value |
| `registerOnTouched` | Angular | Once; you call the fn on blur so `touched` works |
| `setDisabledState` | Angular | `control.disable()` / `enable()` |

### Step 3: Autocomplete (generic, `model()`)

```ts
// features/ui/autocomplete.component.ts
import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, distinctUntilChanged, finalize, of, switchMap, tap } from 'rxjs';

let nextId = 0;

@Component({
  selector: 'app-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [for]="id">{{ label() }}</label>
    <div class="ac">
      <input #inp [id]="id" type="text" role="combobox" autocomplete="off"
             aria-autocomplete="list"
             [attr.aria-expanded]="open()"
             [attr.aria-controls]="id + '-list'"
             [attr.aria-activedescendant]="activeIndex() >= 0 ? id + '-opt-' + activeIndex() : null"
             [placeholder]="placeholder()"
             [value]="text()"
             (input)="onInput(inp.value)"
             (keydown)="onKey($event)"
             (blur)="open.set(false)" />
      @if (loading()) { <span class="hint" aria-hidden="true">…</span> }

      @if (open() && !loading() && query().trim().length >= minChars()) {
        <ul [id]="id + '-list'" role="listbox">
          @for (item of results(); track trackKey()(item); let i = $index) {
            <li [id]="id + '-opt-' + i" role="option"
                [attr.aria-selected]="i === activeIndex()" [class.active]="i === activeIndex()"
                (mousedown)="$event.preventDefault(); choose(item)">
              {{ displayWith()(item) }}
            </li>
          } @empty {
            <li class="muted" role="option" aria-disabled="true">No matches</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .ac { position: relative; }
    ul { position: absolute; z-index: 10; left: 0; right: 0; margin: 0; padding: 0; list-style: none; background: #fff; border: 1px solid #ccc; max-height: 240px; overflow: auto; }
    li { padding: 0.5rem; cursor: pointer; }
    li.active { background: #eef4ff; }
    .muted { color: #888; cursor: default; }
  `,
})
export class AutocompleteComponent<T> {
  readonly label = input.required<string>();
  readonly search = input.required<(q: string) => Observable<T[]>>();
  readonly displayWith = input.required<(item: T) => string>();
  readonly trackKey = input.required<(item: T) => string | number>();
  readonly placeholder = input('');
  readonly minChars = input(2);

  /** two-way: [(value)]="selected" */
  readonly value = model<T | null>(null);

  protected readonly id = `ac-${nextId++}`;
  protected readonly text = signal('');   // what the input shows
  protected readonly query = signal('');  // what we search for
  protected readonly results = signal<T[]>([]);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < this.minChars()) return of([] as T[]);
          this.loading.set(true);
          return this.search()(q.trim()).pipe(
            catchError(() => of([] as T[])),
            finalize(() => this.loading.set(false)),
          );
        }),
        tap((r) => this.activeIndex.set(r.length ? 0 : -1)),
        takeUntilDestroyed(),
      )
      .subscribe((r) => this.results.set(r));
  }

  protected onInput(text: string) {
    this.text.set(text);
    this.query.set(text);
    this.value.set(null); // typing invalidates the previous choice
    this.open.set(true);
  }

  protected onKey(e: KeyboardEvent) {
    const len = this.results().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.open.set(true);
        if (len) this.activeIndex.set((this.activeIndex() + 1) % len);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (len) this.activeIndex.set((this.activeIndex() - 1 + len) % len);
        break;
      case 'Enter': {
        const item = this.results()[this.activeIndex()];
        if (this.open() && item) { e.preventDefault(); this.choose(item); }
        break;
      }
      case 'Escape':
        this.open.set(false);
        break;
    }
  }

  protected choose(item: T) {
    this.value.set(item);
    this.text.set(this.displayWith()(item)); // update the box, but don't search again
    this.open.set(false);
  }
}
```

Two details worth saying out loud:

- `(mousedown)` + `preventDefault()` on options stops the input's blur from closing the list before the click registers. This is the classic autocomplete bug.
- `text` and `query` are separate signals, so choosing an item doesn't fire another search.

### Step 4: Modal (native `<dialog>` + content projection)

```ts
// features/ui/modal.component.ts
import { ChangeDetectionStrategy, Component, ElementRef, effect, input, model, viewChild } from '@angular/core';

let modalId = 0;

@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg [attr.aria-labelledby]="titleId" (close)="open.set(false)" (click)="onDialogClick($event)">
      <div class="panel">
        <header>
          <h2 [id]="titleId"><ng-content select="[modal-title]" /></h2>
          <button type="button" class="close" aria-label="Close" (click)="open.set(false)">✕</button>
        </header>
        <section><ng-content /></section>
        <footer><ng-content select="[modal-actions]" /></footer>
      </div>
    </dialog>
  `,
  styles: `
    dialog { padding: 0; border: 0; border-radius: 12px; width: min(560px, 92vw); }
    dialog::backdrop { background: rgb(0 0 0 / 0.45); }
    .panel { padding: 1.25rem; }
    header { display: flex; justify-content: space-between; align-items: center; }
    footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  `,
})
export class ModalComponent {
  /** two-way: [(open)]="isOpen" */
  readonly open = model(false);
  readonly closeOnBackdrop = input(true);

  protected readonly titleId = `modal-title-${modalId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dialog().nativeElement;
      if (this.open() && !d.open) d.showModal(); // showModal = focus trap + Esc + backdrop for free
      if (!this.open() && d.open) d.close();
    });
  }

  protected onDialogClick(e: MouseEvent) {
    // a click on the backdrop targets the <dialog> itself; clicks inside hit .panel
    if (this.closeOnBackdrop() && e.target === this.dialog().nativeElement) this.open.set(false);
  }
}
```

Why native `<dialog>`: `showModal()` gives you the focus trap, Esc to close, the `::backdrop`, inertness of the page behind it, and focus returning to the trigger. Writing that by hand takes 100+ lines and usually has bugs. Mention CDK `Dialog` as the alternative when you need a service-based API (`dialog.open(Component)`).

### Step 5: Demo page using all three

```ts
// features/ui/ui-demo.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { parseWith } from '../../core/utils/parse-with';
import { Review, ReviewSchema, UserOption, UserSearchSchema } from './review.model';
import { StarRatingComponent } from './star-rating.component';
import { AutocompleteComponent } from './autocomplete.component';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-ui-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, StarRatingComponent, AutocompleteComponent, ModalComponent],
  template: `
    <button type="button" (click)="isOpen.set(true)">Write a review</button>

    <app-modal [(open)]="isOpen">
      <span modal-title>Write a review</span>

      <app-autocomplete
        label="Guest"
        placeholder="Type at least 2 letters"
        [search]="searchUsers"
        [displayWith]="userName"
        [trackKey]="userId"
        [(value)]="guest" />
      @if (errors()['guest']; as e) { <small class="err">{{ e }}</small> }

      <p>Rating</p>
      <app-star-rating label="Stay rating" [formControl]="rating" />
      @if (errors()['rating']; as e) { <small class="err">{{ e }}</small> }

      <label>Comment <textarea rows="4" [formControl]="comment"></textarea></label>
      @if (errors()['comment']; as e) { <small class="err">{{ e }}</small> }

      <ng-container modal-actions>
        <button type="button" (click)="isOpen.set(false)">Cancel</button>
        <button type="button" (click)="submit()">Submit</button>
      </ng-container>
    </app-modal>

    <h3>Reviews</h3>
    @for (r of reviews(); track $index) {
      <article>
        <strong>{{ userName(r.guest) }}</strong>
        <span aria-label="{{ r.rating }} out of 5">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
        <p>{{ r.comment }}</p>
      </article>
    } @empty {
      <p>No reviews yet.</p>
    }
  `,
})
export class UiDemoComponent {
  private readonly http = inject(HttpClient);

  protected readonly isOpen = signal(false);
  protected readonly guest = signal<UserOption | null>(null);
  protected readonly rating = new FormControl(0, { nonNullable: true }); // proves the CVA works
  protected readonly comment = new FormControl('', { nonNullable: true });
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly reviews = signal<Review[]>([]);

  // arrow functions keep `this`, and are stable references for the inputs
  protected readonly searchUsers = (q: string) =>
    this.http
      .get('https://dummyjson.com/users/search', { params: { q, limit: 8, select: 'firstName,lastName,email' } })
      .pipe(parseWith(UserSearchSchema), map((r) => r.users));
  protected readonly userName = (u: UserOption) => `${u.firstName} ${u.lastName}`;
  protected readonly userId = (u: UserOption) => u.id;

  protected submit() {
    const result = ReviewSchema.safeParse({ guest: this.guest(), rating: this.rating.value, comment: this.comment.value });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) errs[String(issue.path[0])] ??= issue.message;
      this.errors.set(errs);
      return;
    }
    this.reviews.update((list) => [result.data, ...list]);
    this.errors.set({});
    this.guest.set(null);
    this.rating.reset();
    this.comment.reset();
    this.isOpen.set(false);
  }
}
```

The projected content stays in the DOM while the modal is closed, which is why the form keeps its values if you cancel. If you need fresh content on every open, wrap the body in `@if (isOpen())`.

### What the interviewer checks

- The CVA's four methods and `NG_VALUE_ACCESSOR` with `forwardRef`. Expect: "why `forwardRef`?" (the class isn't defined yet when the decorator runs).
- `input()` / `model()` / `output()` used correctly; inputs are never mutated.
- Keyboard support and ARIA (`radiogroup`, `combobox`/`listbox`, `aria-activedescendant`, dialog labelling).
- Generic `AutocompleteComponent<T>`, with the item type inferred in the template.

### Likely follow-up twists

- "Make the autocomplete work with `formControl` too" → implement CVA as in the star rating, mapping `writeValue(item)` to `text.set(displayWith(item))`.
- "Half stars" → change the schema to `z.number().multipleOf(0.5)`, and render two hit areas per star.
- "Open the modal from a service" → use CDK `Dialog`, or a `ModalService` holding a signal of the component to render in a root outlet.

## Task 10. Real-time dashboard (target: 2 hrs)

**Core idea:** polling is one RxJS pipeline whose *inputs* decide when it runs. Polling runs only when the tab is visible and the user hasn't paused it. It never overlaps requests (`exhaustMap`), retries with backoff, and keeps showing the last good data when a request fails. Every snapshot is checked by Zod before it reaches the screen.

### Requirements

1. Hotel KPI cards: occupancy %, revenue today, check-ins, ADR (average daily rate). Each card shows the change % vs yesterday.
2. Bar chart of bookings by channel; occupancy sparkline from the last 20 updates.
3. Auto-refresh every 5 s, with a selector for 5 / 10 / 30 s, plus Pause and Refresh now.
4. Pause automatically while the browser tab is hidden; resume immediately when it is visible again.
5. On failure: retry twice with backoff, keep the old data, show "Reconnecting…" and "Updated 25 s ago".
6. Everything is cleaned up when you leave the page.

There's no public live-metrics API, so the API service below **simulates** the server (random values, about 10% failures). Switching to a real endpoint is a one-line change, and the store and components don't change. Say this in the interview.

### Step 1: Model

```ts
// features/dashboard/dashboard.model.ts
import { z } from 'zod';

export const KpiSchema = z.object({
  key: z.enum(['occupancy', 'revenue', 'checkIns', 'adr']),
  label: z.string(),
  value: z.number(),
  unit: z.enum(['percent', 'currency', 'count']),
  changePct: z.number(),
});

export const SnapshotSchema = z.object({
  timestamp: z.iso.datetime(),
  kpis: z.array(KpiSchema).length(4),
  bookingsByChannel: z.array(z.object({ channel: z.string(), bookings: z.number().int().nonnegative() })).min(1),
});

export type Kpi = z.infer<typeof KpiSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
```

### Step 2: API (simulated server)

```ts
// features/dashboard/dashboard.api.ts
import { Injectable } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { parseWith } from '../../core/utils/parse-with';
import { Snapshot, SnapshotSchema } from './dashboard.model';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private tick = 0;

  snapshot(): Observable<Snapshot> {
    // REAL APP: return this.http.get('/api/dashboard').pipe(parseWith(SnapshotSchema));
    return defer(() => {
      this.tick++;
      if (Math.random() < 0.1) {
        return timer(300).pipe(switchMap(() => throwError(() => new Error('Server busy (simulated)'))));
      }
      const occupancy = 70 + 15 * Math.sin(this.tick / 4) + rand(-3, 3);
      const raw: unknown = {
        timestamp: new Date().toISOString(),
        kpis: [
          { key: 'occupancy', label: 'Occupancy', value: occupancy, unit: 'percent', changePct: rand(-5, 5) },
          { key: 'revenue', label: 'Revenue today', value: 250000 + this.tick * 4200 + rand(0, 9000), unit: 'currency', changePct: rand(-8, 12) },
          { key: 'checkIns', label: 'Check-ins', value: Math.round(40 + this.tick * 0.8 + rand(0, 4)), unit: 'count', changePct: rand(-10, 10) },
          { key: 'adr', label: 'ADR', value: 5200 + rand(-300, 300), unit: 'currency', changePct: rand(-3, 3) },
        ],
        bookingsByChannel: [
          { channel: 'Direct', bookings: Math.round(rand(20, 45)) },
          { channel: 'Booking.com', bookings: Math.round(rand(30, 60)) },
          { channel: 'Expedia', bookings: Math.round(rand(10, 30)) },
          { channel: 'Walk-in', bookings: Math.round(rand(2, 10)) },
          { channel: 'Corporate', bookings: Math.round(rand(5, 20)) },
        ],
      };
      return of(raw).pipe(delay(rand(200, 700))); // network latency
    }).pipe(parseWith(SnapshotSchema));
  }
}
```

`defer` matters here: without it, the random values and the failure roll would be decided once when `snapshot()` is called. With it, they're decided on every subscription, which includes retries.

### Step 3: Page visibility as an observable

```ts
// features/dashboard/page-visibility.ts
import { Observable, distinctUntilChanged, fromEvent, map, startWith } from 'rxjs';

export function pageVisible$(): Observable<boolean> {
  return fromEvent(document, 'visibilitychange').pipe(
    map(() => document.visibilityState === 'visible'),
    startWith(document.visibilityState === 'visible'),
    distinctUntilChanged(),
  );
}
```

### Step 4: Store

```ts
// features/dashboard/dashboard.store.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, combineLatest, exhaustMap, interval, map, merge, of, retry, switchMap, timer } from 'rxjs';
import { toErrorMessage } from '../../core/utils/error-message';
import { Snapshot } from './dashboard.model';
import { DashboardApi } from './dashboard.api';
import { pageVisible$ } from './page-visibility';

const HISTORY_SIZE = 20;
export const INTERVALS = [5000, 10000, 30000] as const;

interface DashboardState {
  snapshot: Snapshot | null;
  occupancyHistory: number[];
  loading: boolean;
  error: string | null;
  failures: number; // consecutive
  lastUpdated: number | null;
}

export type LiveMode = 'live' | 'paused' | 'hidden' | 'reconnecting';

@Injectable() // provided in the component: polling stops when you leave the page
export class DashboardStore {
  private readonly api = inject(DashboardApi);
  private readonly refresh$ = new Subject<void>();

  private readonly state = signal<DashboardState>({
    snapshot: null, occupancyHistory: [], loading: false, error: null, failures: 0, lastUpdated: null,
  });

  // controls
  readonly paused = signal(false);
  readonly intervalMs = signal<number>(INTERVALS[0]);
  readonly tabVisible = toSignal(pageVisible$(), { initialValue: true });

  // selectors
  readonly snapshot = computed(() => this.state().snapshot);
  readonly kpis = computed(() => this.snapshot()?.kpis ?? []);
  readonly channels = computed(() =>
    (this.snapshot()?.bookingsByChannel ?? []).map((c) => ({ label: c.channel, value: c.bookings })),
  );
  readonly occupancyHistory = computed(() => this.state().occupancyHistory);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly lastUpdated = computed(() => this.state().lastUpdated);

  readonly mode = computed<LiveMode>(() => {
    if (!this.tabVisible()) return 'hidden';
    if (this.paused()) return 'paused';
    if (this.state().failures > 0) return 'reconnecting';
    return 'live';
  });

  /** ticks every second so "Updated 12s ago" stays fresh */
  private readonly now = toSignal(interval(1000).pipe(map(() => Date.now())), { initialValue: Date.now() });
  readonly secondsAgo = computed(() => {
    const t = this.lastUpdated();
    return t === null ? null : Math.max(0, Math.round((this.now() - t) / 1000));
  });

  constructor() {
    const poll$ = combineLatest([pageVisible$(), toObservable(this.paused), toObservable(this.intervalMs)]).pipe(
      // switchMap: any change to the inputs restarts (or stops) the timer
      switchMap(([visible, paused, ms]) => (visible && !paused ? timer(0, ms) : EMPTY)),
    );

    merge(poll$, this.refresh$)
      .pipe(
        // exhaustMap: ignore ticks while a request is still running (no overlap, no pile-up)
        exhaustMap(() => {
          this.patch({ loading: true });
          return this.api.snapshot().pipe(
            retry({ count: 2, delay: (_err, attempt) => timer(500 * 2 ** (attempt - 1)) }), // 500ms, 1s
            map((snapshot) => ({ ok: true as const, snapshot })),
            catchError((err) => of({ ok: false as const, message: toErrorMessage(err) })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        if (!r.ok) {
          // keep the old snapshot on screen
          this.state.update((s) => ({ ...s, loading: false, error: r.message, failures: s.failures + 1 }));
          return;
        }
        const occ = r.snapshot.kpis.find((k) => k.key === 'occupancy')?.value;
        this.state.update((s) => ({
          ...s,
          snapshot: r.snapshot,
          occupancyHistory: occ === undefined ? s.occupancyHistory : [...s.occupancyHistory, occ].slice(-HISTORY_SIZE),
          loading: false,
          error: null,
          failures: 0,
          lastUpdated: Date.now(),
        }));
      });
  }

  togglePause() { this.paused.update((p) => !p); }
  setInterval(ms: number) { this.intervalMs.set(ms); }
  refreshNow() { this.refresh$.next(); }

  private patch(p: Partial<DashboardState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
```

Which flattening operator, and why (the interview question you'll definitely get):

| Operator | Behaviour | Used here for |
| --- | --- | --- |
| `switchMap` | Cancel the previous inner stream, start the new one | Restarting the timer when visibility, pause or interval changes |
| `exhaustMap` | Ignore new values while the inner stream is busy | Requests: a slow response never overlaps the next tick |
| `concatMap` | Queue values, run one by one | Not used: queued polls would show stale data in bursts |
| `mergeMap` | Run everything in parallel | Not used: responses could arrive out of order |

### Step 5: KPI value pipe, sparkline and bar chart

```ts
// features/dashboard/kpi-value.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';
import { Kpi } from './dashboard.model';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

@Pipe({ name: 'kpiValue' })
export class KpiValuePipe implements PipeTransform {
  transform(k: Kpi): string {
    switch (k.unit) {
      case 'percent': return `${k.value.toFixed(1)}%`;
      case 'currency': return inr.format(k.value);
      case 'count': return k.value.toLocaleString('en-IN');
    }
  }
}
```

```ts
// features/dashboard/sparkline.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 120 32" width="120" height="32" role="img" [attr.aria-label]="label()">
      <polyline [attr.points]="points()" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
  `,
})
export class SparklineComponent {
  readonly values = input.required<number[]>();
  readonly label = input('Trend');

  protected readonly points = computed(() => {
    const v = this.values();
    if (v.length < 2) return '';
    const min = Math.min(...v), max = Math.max(...v), range = max - min || 1;
    return v.map((n, i) => `${(i / (v.length - 1)) * 120},${30 - ((n - min) / range) * 28}`).join(' ');
  });
}
```

```ts
// features/dashboard/bar-chart.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarDatum { label: string; value: number }

@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 400 ' + height()" class="chart" role="img" [attr.aria-label]="summary()">
      @for (b of bars(); track b.label) {
        <g [attr.transform]="'translate(0,' + b.y + ')'">
          <text x="0" y="16" class="label">{{ b.label }}</text>
          <rect x="110" y="4" [attr.width]="b.width" height="16" rx="3" class="bar" />
          <text [attr.x]="116 + b.width" y="16" class="value">{{ b.value }}</text>
        </g>
      }
    </svg>
  `,
  styles: `
    .chart { width: 100%; }
    .bar { fill: #4a6cf7; transition: width 300ms ease; }
    .label, .value { font-size: 12px; fill: #444; }
  `,
})
export class BarChartComponent {
  readonly data = input.required<BarDatum[]>();
  readonly title = input('Chart');

  private readonly rowH = 28;
  protected readonly height = computed(() => this.data().length * this.rowH);
  protected readonly bars = computed(() => {
    const d = this.data();
    const max = Math.max(1, ...d.map((x) => x.value));
    return d.map((x, i) => ({ ...x, y: i * this.rowH, width: (x.value / max) * 240 }));
  });
  protected readonly summary = computed(
    () => `${this.title()}: ` + this.data().map((d) => `${d.label} ${d.value}`).join(', '),
  );
}
```

In a machine test, a hand-rolled SVG chart is fine and shows you understand scales. In production, mention a library such as ngx-echarts or Chart.js. Either way, the store doesn't change.

### Step 6: Dashboard page

```ts
// features/dashboard/dashboard.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DashboardStore, INTERVALS } from './dashboard.store';
import { KpiValuePipe } from './kpi-value.pipe';
import { SparklineComponent } from './sparkline.component';
import { BarChartComponent } from './bar-chart.component';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DashboardStore],
  imports: [DecimalPipe, KpiValuePipe, SparklineComponent, BarChartComponent],
  template: `
    <header class="bar">
      <h2>Today at the property</h2>
      <span class="status" [class]="store.mode()" aria-live="polite">
        @switch (store.mode()) {
          @case ('live') { ● Live }
          @case ('paused') { ❚❚ Paused }
          @case ('hidden') { ❚❚ Paused (tab hidden) }
          @case ('reconnecting') { ● Reconnecting… }
        }
      </span>
      @if (store.secondsAgo() !== null) { <small>Updated {{ store.secondsAgo() }}s ago</small> }

      <select #iv aria-label="Refresh interval" (change)="store.setInterval(+iv.value)">
        @for (ms of intervals; track ms) {
          <option [value]="ms" [selected]="ms === store.intervalMs()">Every {{ ms / 1000 }}s</option>
        }
      </select>
      <button type="button" (click)="store.togglePause()">{{ store.paused() ? 'Resume' : 'Pause' }}</button>
      <button type="button" (click)="store.refreshNow()" [disabled]="store.loading()">Refresh now</button>
    </header>

    @if (store.error(); as e) {
      <div class="banner" role="status">Couldn't refresh: {{ e }}. Showing the last good data.</div>
    }

    @if (store.snapshot()) {
      <section class="kpis">
        @for (k of store.kpis(); track k.key) {
          <article class="card">
            <h3>{{ k.label }}</h3>
            <p class="value">{{ k | kpiValue }}</p>
            <p [class.up]="k.changePct >= 0" [class.down]="k.changePct < 0">
              {{ k.changePct >= 0 ? '▲' : '▼' }} {{ k.changePct | number: '1.1-1' }}% vs yesterday
            </p>
            @if (k.key === 'occupancy') {
              <app-sparkline [values]="store.occupancyHistory()" label="Occupancy, last 20 updates" />
            }
          </article>
        }
      </section>

      <section class="card">
        <h3>Bookings by channel</h3>
        <app-bar-chart [data]="store.channels()" title="Bookings by channel" />
      </section>
    } @else {
      <section class="kpis">@for (i of [1, 2, 3, 4]; track i) { <div class="card skeleton"></div> }</section>
    }
  `,
  styles: `
    .bar { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .status.live { color: green; } .status.reconnecting { color: orange; } .status.paused, .status.hidden { color: #888; }
    .banner { background: #fff4e5; padding: 0.5rem 1rem; border-radius: 6px; margin: 1rem 0; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .card { border: 1px solid #eee; border-radius: 10px; padding: 1rem; }
    .value { font-size: 1.75rem; font-weight: 700; margin: 0.25rem 0; }
    .up { color: green; } .down { color: crimson; }
    .skeleton { height: 140px; background: #f2f2f2; }
  `,
})
export class DashboardComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly intervals = INTERVALS;
}
```

### Test script

1. Open DevTools → Console and add a `console.log` in `snapshot()`. Watch it fire every 5 s.
2. Switch to another browser tab for 20 s, then come back. The logs stop, then one fires immediately on return, and the status shows "Paused (tab hidden)" while you're away.
3. Change the interval to 30 s → the timer restarts immediately with the new period.
4. Wait for a simulated failure → the banner and "Reconnecting…" appear, the numbers stay, and the next success clears both.
5. Navigate away to `/products` → the logs stop completely (no leaked timer).

### What the interviewer checks

- The polling pipeline: `combineLatest` of the controls → `switchMap` timer → `exhaustMap` request → `catchError` inside.
- The store is component-scoped plus `takeUntilDestroyed`, so nothing leaks.
- Old data is kept on error; there's a stale indicator.
- Retry with exponential backoff.
- Zod validates the payload, so a malformed snapshot becomes a handled error, not a broken chart.

### Likely follow-up twists

- "Use WebSockets instead of polling" → `webSocket<unknown>(url)` from `rxjs/webSocket`, with `parseWith(SnapshotSchema)` on each message and `retry({ delay: ... })` for reconnects. The store subscribes to it instead of `poll$`, and the UI stays the same.
- "Server-Sent Events" → wrap `new EventSource(url)` in an `Observable`, closing it in the teardown.
- "Show a toast when occupancy crosses 90%" → an `effect` on the occupancy KPI that remembers the previous value and fires only on the crossing.

## Final checklist for tasks 6–10

These tasks are judged on whether you can **explain the core idea**, not just make it work. Before you submit, check that you can say each line below in one sentence.

| Task | Core idea to explain | Concept they'll probe |
| --- | --- | --- |
| 6 Dynamic form | Config is data, so Zod validates it, then it's turned into a FormGroup + value schema | Discriminated unions, hidden fields left out of validation |
| 7 Cart | Store minimal state, derive the rest with `computed`; money in integer cents | Derived state, floating-point errors |
| 8 10k items | DOM size is the cost: virtual scroll for in-memory data, infinite scroll for paged APIs | Fixed `itemSize`, IntersectionObserver, double-load guard |
| 9 Reusable UI | CVA for forms, `model()` for two-way binding, `ng-content` slots for layout | The 4 CVA methods, `forwardRef`, ARIA patterns |
| 10 Dashboard | Inputs decide when polling runs; `exhaustMap` prevents overlap; keep last good data | switchMap vs exhaustMap vs concatMap vs mergeMap |

- [ ] Every external input goes through Zod: API, JSON config, localStorage, form output
- [ ] No leaked timers or observers after leaving the page (check with a `console.log`)
- [ ] Keyboard-only run: Tab, arrows, Enter and Esc all work in Tasks 8–10
- [ ] Loading, error, empty and "end" states are visible
- [ ] `OnPush` everywhere; `track` / `trackBy` by id
- [ ] A README listing one trade-off per task (e.g. simulated API, hand-rolled chart, `unknown` controls in the dynamic form)

### Practice order

Do **7 → 9 → 6 → 8 → 10**. The cart reinforces the store pattern from Part 1. The reusable components teach CVA, which the dynamic form leans on. The dashboard is the hardest RxJS, so do it last. As in Part 1, build each one twice: once with this doc, once from scratch against the target time.
