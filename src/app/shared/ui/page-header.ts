import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { formatTask, readPageMeta } from '../page-meta';

/** Page header rendered by the shell, driven by the active route's `title` and `data.meta`. */
@Component({
  selector: 'app-page-header',
  template: `
    @if (page(); as p) {
      <header class="page-header">
        <p class="eyebrow">Task {{ p.task }}</p>
        <h1>{{ p.heading }}</h1>
        <p class="lede">{{ p.summary }}</p>
      </header>
    }
  `,
})
export class PageHeader {
  private readonly router = inject(Router);

  private readonly leaf = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.deepestChild()),
    ),
    { initialValue: this.deepestChild() },
  );

  protected readonly page = computed(() => {
    const snapshot = this.leaf();
    const meta = readPageMeta(snapshot);
    if (!meta) return null;
    return {
      task: formatTask(meta.task),
      heading: snapshot.title ?? '',
      summary: meta.summary,
    };
  });

  private deepestChild(): ActivatedRouteSnapshot {
    let snapshot = this.router.routerState.snapshot.root;
    while (snapshot.firstChild) snapshot = snapshot.firstChild;
    return snapshot;
  }
}
