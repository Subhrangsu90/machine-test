import { computed, inject, Injectable, signal } from '@angular/core';
import { Product } from './products.model';
import { LoadStatus } from '../../shared/models/load-status';
import {
  catchError,
  combineLatest,
  debounceTime,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ProductApi } from './product.api';
import { toErrorMessage } from '../../core/utils/error-message';

interface ProductState {
  query: string;
  category: string | null;
  products: Product[];
  categories: string[];
  status: LoadStatus;
  error: string | null;
}

const initialState: ProductState = {
  query: '',
  category: null,
  products: [],
  categories: [],
  status: 'idle',
  error: null,
};

@Injectable()
export class ProductStore {
  private readonly api = inject(ProductApi);
  private readonly state = signal<ProductState>(initialState);
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

    this.api
      .categories()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (categories) => this.patch({ categories }),
        error: () => this.patch({ categories: [] }), // filter just stays empty
      });
  }
  setQuery(query: string) {
    this.patch({ query });
  }
  setCategory(category: string | null) {
    this.patch({ category });
  }
  retry() {
    this.refresh$.next();
  }

  private patch(p: Partial<ProductState>) {
    this.state.update((s) => ({ ...s, ...p }));
  }
}
