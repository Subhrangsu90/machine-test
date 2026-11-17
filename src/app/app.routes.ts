import { Routes } from '@angular/router';
import { pageMeta } from './shared/page-meta';
// Task 5: uncomment once core/auth/auth.guards.ts exists.
// import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },

  // Part 1 — Tasks 1–5
  {
    path: 'products',
    title: 'Products',
    data: pageMeta({ task: 1, summary: 'Product list with search and filter.', target: '60 min' }),
    loadComponent: () => import('./features/products/products').then((m) => m.Products),
  },
  {
    path: 'employees',
    title: 'Employees',
    data: pageMeta({ task: 2, summary: 'Employee CRUD manager with localStorage.', target: '75 min' }),
    loadComponent: () => import('./features/employees/employee-page').then((m) => m.EmployeePage),
  },
  {
    path: 'register',
    title: 'Register',
    data: pageMeta({ task: 3, summary: 'Registration form with validation.', target: '75 min' }),
    loadComponent: () => import('./features/register/register').then((m) => m.Register),
  },
  {
    path: 'users',
    title: 'Users',
    data: pageMeta({ task: 4, summary: 'Server-side pagination and sorting table.', target: '75 min' }),
    loadComponent: () => import('./features/users-table/users-table').then((m) => m.UsersTable),
  },
  {
    path: 'login',
    title: 'Login',
    data: pageMeta({ task: 5, summary: 'Login with guards and interceptor.', target: '90 min' }),
    // canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    title: 'Admin',
    data: pageMeta({ task: 5, summary: 'Admin page that proves the interceptor works.', target: '90 min' }),
    // canActivate: [authGuard, roleGuard('admin')],
    loadComponent: () => import('./features/auth/admin').then((m) => m.Admin),
  },

  // Part 2 — Tasks 6–10
  {
    path: 'dynamic-form',
    title: 'Dynamic form',
    data: pageMeta({ task: 6, summary: 'Dynamic form from a JSON schema.', target: '90 min' }),
    loadComponent: () =>
      import('./features/dynamic-form/dynamic-form-page').then((m) => m.DynamicFormPage),
  },
  {
    path: 'shop',
    title: 'Shop',
    data: pageMeta({ task: 7, summary: 'Shopping cart.', target: '90 min' }),
    loadComponent: () => import('./features/shop/shop-page').then((m) => m.ShopPage),
  },
  {
    path: 'virtual-list',
    title: 'Virtual list',
    data: pageMeta({ task: 8, summary: 'Rendering 10,000 items, part A: virtual scroll.', target: '75 min' }),
    loadComponent: () => import('./features/big-list/virtual-list').then((m) => m.VirtualList),
  },
  {
    path: 'infinite-list',
    title: 'Infinite list',
    data: pageMeta({ task: 8, summary: 'Rendering 10,000 items, part B: infinite scroll.', target: '75 min' }),
    loadComponent: () => import('./features/big-list/infinite-list').then((m) => m.InfiniteList),
  },
  {
    path: 'ui',
    title: 'UI components',
    data: pageMeta({ task: 9, summary: 'Reusable components: star rating, autocomplete and modal.', target: '2 hrs' }),
    loadComponent: () => import('./features/ui/ui-demo').then((m) => m.UiDemo),
  },
  {
    path: 'dashboard',
    title: 'Dashboard',
    data: pageMeta({ task: 10, summary: 'Real-time dashboard.', target: '2 hrs' }),
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },

  { path: '**', redirectTo: 'products' },
];
