import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/ui/page-placeholder';

@Component({
  imports: [PagePlaceholder],
  selector: 'app-infinite-list',
  styleUrl: './infinite-list.scss',
  templateUrl: './infinite-list.html',
})
export class InfiniteList {}
