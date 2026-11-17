import { Component, inject } from '@angular/core';
import { Card } from '../card/card';
import { ProductStore } from '../product.store';
import { TitleCasePipe } from '@angular/common';

@Component({
  selector: 'app-list',
  providers: [ProductStore],
  imports: [Card, TitleCasePipe],
  styleUrl: './list.scss',
  templateUrl: './list.html',
})
export class List {
  protected readonly store = inject(ProductStore);
}
