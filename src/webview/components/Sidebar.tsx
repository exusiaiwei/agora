import type { Category } from '@shared/types';
import { cn } from '../lib/cn';
import { useStrings } from '../lib/strings';

interface SidebarProps {
  categories: Category[];
  selectedCategoryId: string | null;
  totalCount: number;
  countsByCategory: Map<string, number>;
  onSelectCategory: (id: string | null) => void;
}

export function Sidebar({
  categories,
  selectedCategoryId,
  totalCount,
  countsByCategory,
  onSelectCategory,
}: SidebarProps): JSX.Element {
  const strings = useStrings();
  return (
    <aside className="w-[220px] shrink-0 border-r border-[var(--vscode-widget-border,var(--vscode-panel-border))] py-3 px-1 overflow-y-auto">
      <div className="px-2 pb-2 text-xs uppercase tracking-wider text-muted font-medium">
        {strings.categories}
      </div>
      <CategoryRow
        active={selectedCategoryId === null}
        emoji="📋"
        name={strings.all}
        count={totalCount}
        onClick={() => onSelectCategory(null)}
      />
      <div className="h-2" />
      {categories.map((c) => (
        <CategoryRow
          key={c.id}
          active={selectedCategoryId === c.id}
          emoji={c.emoji}
          name={c.name}
          count={countsByCategory.get(c.id)}
          onClick={() => onSelectCategory(c.id)}
        />
      ))}
    </aside>
  );
}

function CategoryRow({
  active,
  emoji,
  name,
  count,
  onClick,
}: {
  active: boolean;
  emoji: string;
  name: string;
  count?: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 w-full px-2 h-[26px] rounded text-left text-sm transition-colors duration-100',
        active
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'hover:bg-hover text-fg/90',
      )}
    >
      <span className="text-base leading-none w-4 text-center" aria-hidden="true">
        {emoji || '•'}
      </span>
      <span className="flex-1 truncate">{name}</span>
      {count !== undefined && (
        <span
          className={cn(
            'text-xs tabular-nums',
            active ? 'text-current opacity-80' : 'text-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
