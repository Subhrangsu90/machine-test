import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { readPageMeta } from '../page-meta';

/** Temporary page body shown until a task is built. Delete its usage when you start the task. */
@Component({
  selector: 'app-page-placeholder',
  template: `
    <section class="empty card" aria-labelledby="placeholder-title">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2ZM9 13h6M9 17h4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <h2 id="placeholder-title">Not built yet</h2>
      <p class="muted">
        Follow the steps in <code>docs/Angular Machine Test Practice — {{ docPart }}.md</code>,
        then replace this placeholder.
      </p>
      <span class="badge">Target: {{ target }}</span>
    </section>
  `,
  styles: `
    .empty {
      display: grid;
      justify-items: center;
      gap: 0.75rem;
      padding: 3.5rem 1.5rem;
      border-style: dashed;
      box-shadow: none;
      text-align: center;
    }

    .empty p {
      max-width: 46ch;
    }

    .empty-icon {
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      margin-bottom: 0.25rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
      color: var(--text-muted);
    }
  `,
})
export class PagePlaceholder {
  private readonly meta = readPageMeta(inject(ActivatedRoute).snapshot);

  protected readonly target = this.meta?.target ?? '—';
  protected readonly docPart = (this.meta?.task ?? 1) <= 5 ? 'Tasks 1–5' : 'Tasks 6–10';
}
