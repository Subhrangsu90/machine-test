import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeStore } from './core/theme/theme.store';
import { PageHeader } from './shared/ui/page-header';

interface NavLink {
  path: string;
  label: string;
  task: string;
}

interface NavGroup {
  id: string;
  label: string;
  links: readonly NavLink[];
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageHeader],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly theme = inject(ThemeStore);

  protected readonly groups: readonly NavGroup[] = [
    {
      id: 'nav-part-1',
      label: 'Part 1 · Fundamentals',
      links: [
        { path: '/products', label: 'Products', task: '01' },
        { path: '/employees', label: 'Employees', task: '02' },
        { path: '/register', label: 'Register', task: '03' },
        { path: '/users', label: 'Users', task: '04' },
        { path: '/login', label: 'Login', task: '05' },
        { path: '/admin', label: 'Admin', task: '05' },
      ],
    },
    {
      id: 'nav-part-2',
      label: 'Part 2 · Advanced',
      links: [
        { path: '/dynamic-form', label: 'Dynamic form', task: '06' },
        { path: '/shop', label: 'Shop', task: '07' },
        { path: '/virtual-list', label: 'Virtual list', task: '08' },
        { path: '/infinite-list', label: 'Infinite list', task: '08' },
        { path: '/ui', label: 'UI components', task: '09' },
        { path: '/dashboard', label: 'Dashboard', task: '10' },
      ],
    },
  ];
}
