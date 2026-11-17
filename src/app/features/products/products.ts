import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/ui/page-placeholder';
import { List } from './list/list';

@Component({
  imports: [List],
  selector: 'app-products',
  styleUrl: './products.scss',
  templateUrl: './products.html',
})
export class Products {}
