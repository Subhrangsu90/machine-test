import { Component, input } from '@angular/core';
import { Product } from '../products.model';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

@Component({
  imports: [CurrencyPipe, DecimalPipe],
  selector: 'app-card',
  styleUrl: './card.scss',
  templateUrl: './card.html',
})
export class Card {
  readonly product = input.required<Product>();
}
