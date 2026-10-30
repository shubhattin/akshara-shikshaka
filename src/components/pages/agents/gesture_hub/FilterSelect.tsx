import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { cn } from '~/lib/utils';

export type FilterOption = { value: string; label: string; count?: number };

/** A compact labelled select for filter bars; options may carry a count. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select
      items={options.map((option) => ({ label: option.label, value: option.value }))}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} size="sm" className={cn('min-w-36', className)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex w-full items-center justify-between gap-3">
              {option.label}
              {option.count === undefined ? null : (
                <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
