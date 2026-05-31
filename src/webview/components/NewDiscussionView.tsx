import { useEffect, useMemo, useState } from 'react';
import type { Category } from '@shared/types';
import { Composer } from './Composer';
import { IconButton, Spinner } from './primitives';
import { useStrings } from '../lib/strings';
import { rpc } from '../lib/vscode';
import { cn } from '../lib/cn';

interface NewDiscussionViewProps {
  /** Called with the new discussion's number after a successful create. */
  onCreated: (number: number) => void;
  onCancel: () => void;
}

interface CategoriesState {
  loading: boolean;
  error: string | null;
  categories: Category[];
}

export function NewDiscussionView({ onCreated, onCancel }: NewDiscussionViewProps): JSX.Element {
  const strings = useStrings();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoriesState>({
    loading: true,
    error: null,
    categories: [],
  });

  // Load categories from a fresh listDiscussions call (cheapest reuse).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await rpc({ kind: 'listDiscussions', categoryId: null, cursor: null });
        if (cancelled) return;
        setCategories({ loading: false, error: null, categories: page.categories });
        if (!categoryId && page.categories.length > 0) {
          setCategoryId(page.categories[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        setCategories({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          categories: [],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titleOK = title.trim().length > 0;
  const categoryOK = categoryId !== null;
  const canSubmit = titleOK && categoryOK && !categories.loading;

  const selected = useMemo(
    () => categories.categories.find((c) => c.id === categoryId),
    [categoryId, categories.categories],
  );

  return (
    <div className="ag-fade-in flex flex-col h-full">
      <header className="sticky top-0 z-10 backdrop-blur-sm bg-[color-mix(in_srgb,var(--vscode-sideBar-background)_92%,transparent)] border-b border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
        <div className="max-w-[var(--ag-content-max)] mx-auto px-6 py-3 flex items-center gap-2">
          <IconButton icon="arrow-left" label={strings.cancel} onClick={onCancel} />
          <div className="flex-1 min-w-0 text-md font-semibold text-fg truncate">
            {strings.newDiscussion}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[var(--ag-content-max)] mx-auto px-6 py-6 space-y-5">
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
              {strings.composerCategoryLabel}
            </span>
            {categories.loading ? (
              <Spinner />
            ) : categories.error ? (
              <div className="text-sm text-error">{categories.error}</div>
            ) : (
              <CategoryPicker
                categories={categories.categories}
                selectedId={categoryId}
                onSelect={setCategoryId}
              />
            )}
            {selected?.description && (
              <span className="block mt-1 text-xs text-muted">{selected.description}</span>
            )}
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
              {strings.composerTitleLabel}
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={strings.composerTitlePlaceholder}
              className={cn(
                'block w-full px-3 h-[34px] rounded-md text-sm font-sans',
                'bg-input-bg text-input-fg placeholder:text-muted',
                'border border-[var(--vscode-input-border,var(--vscode-widget-border,transparent))]',
                'outline-none focus:border-[var(--vscode-focusBorder)]',
              )}
            />
          </label>

          <div>
            <span className="block text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
              {strings.composerBodyLabel}
            </span>
            <Composer
              draftKey="new-discussion:body"
              placeholder={strings.composerPlaceholder}
              submitLabel={strings.newDiscussion}
              clearOnSubmit={false}
              busy={!canSubmit}
              onSubmit={async (body) => {
                if (!categoryId) return;
                const result = await rpc({
                  kind: 'addDiscussion',
                  categoryId,
                  title: title.trim(),
                  body,
                });
                // Clear title + body draft after success.
                setTitle('');
                try {
                  localStorage.removeItem('agora.composer.draft.new-discussion:body');
                } catch {
                  /* ignore */
                }
                onCreated(result.number);
              }}
              onCancel={onCancel}
              cancellable
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryPicker({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((c) => {
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 h-[28px] rounded-md text-sm transition-colors duration-100 border',
              selected
                ? 'bg-[color-mix(in_srgb,var(--vscode-textLink-foreground)_15%,transparent)] border-accent/50 text-fg'
                : 'border-[var(--vscode-widget-border,var(--vscode-panel-border))] text-fg/80 hover:bg-hover',
            )}
          >
            <span aria-hidden="true">{c.emoji || '•'}</span>
            <span>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
