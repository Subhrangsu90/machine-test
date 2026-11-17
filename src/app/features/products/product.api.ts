import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { parseWith } from '../../core/utils/parse-with';
import { CategoryListSchema, ProductsResponseSchema } from './products.model';

@Injectable({
  providedIn: 'root',
})
export class ProductApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://dummyjson.com/products';

  search(q: string) {
    return this.http
      .get(`${this.baseUrl}/search`, { params: { q, limit: 100 } })
      .pipe(parseWith(ProductsResponseSchema));
  }

  categories() {
    return this.http.get(`${this.baseUrl}/category-list`).pipe(parseWith(CategoryListSchema));
  }
}
