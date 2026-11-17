import { ActivatedRouteSnapshot } from '@angular/router';

/** Per-page metadata stored in each route's `data`. The page heading comes from the route `title`. */
export interface PageMeta {
  task: number;
  summary: string;
  target: string;
}

export const pageMeta = (meta: PageMeta): { meta: PageMeta } => ({ meta });

export const readPageMeta = (snapshot: ActivatedRouteSnapshot): PageMeta | undefined =>
  snapshot.data['meta'] as PageMeta | undefined;

export const formatTask = (task: number): string => String(task).padStart(2, '0');
