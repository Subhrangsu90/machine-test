import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/ui/page-placeholder';

@Component({
  imports: [PagePlaceholder],
  selector: 'app-users-table',
  styleUrl: './users-table.scss',
  templateUrl: './users-table.html',
})
export class UsersTable {}
