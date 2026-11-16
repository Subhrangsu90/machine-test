import { Routes } from '@angular/router';
// Task 5: uncomment once core/auth/auth.guards.ts exists.
// import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },

  // Part 1 — Tasks 1–5
  {
    path: 'products',
    title: 'Products',
    loadComponent: () => import('./features/products/products').then((m) => m.Products),
  },
  {
    path: 'employees',
    title: 'Employees',
    loadComponent: () => import('./features/employees/employee-page').then((m) => m.EmployeePage),
  },
  {
    path: 'register',
    title: 'Register',
    loadComponent: () => import('./features/register/register').then((m) => m.Register),
  },
  {
    path: 'users',
    title: 'Users',
    loadComponent: () => import('./features/users-table/users-table').then((m) => m.UsersTable),
  },
  {
    path: 'login',
    title: 'Login',
    // canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    title: 'Admin',
    // canActivate: [authGuard, roleGuard('admin')],
    loadComponent: () => import('./features/auth/admin').then((m) => m.Admin),
  },

  // Part 2 — Tasks 6–10
  {
    path: 'dynamic-form',
    title: 'Dynamic form',
    loadComponent: () =>
      import('./features/dynamic-form/dynamic-form-page').then((m) => m.DynamicFormPage),
  },
  {
    path: 'shop',
    title: 'Shop',
    loadComponent: () => import('./features/shop/shop-page').then((m) => m.ShopPage),
  },
  {
    path: 'virtual-list',
    title: 'Virtual list',
    loadComponent: () => import('./features/big-list/virtual-list').then((m) => m.VirtualList),
  },
  {
    path: 'infinite-list',
    title: 'Infinite list',
    loadComponent: () => import('./features/big-list/infinite-list').then((m) => m.InfiniteList),
  },
  {
    path: 'ui',
    title: 'UI components',
    loadComponent: () => import('./features/ui/ui-demo').then((m) => m.UiDemo),
  },
  {
    path: 'dashboard',
    title: 'Dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },

  { path: '**', redirectTo: 'products' },
];
