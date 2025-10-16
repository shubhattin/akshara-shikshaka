'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

/**
 * Render a styled wrapper around the cmdk `Command` primitive.
 *
 * This component applies a set of default layout and theme styles and composes any passed
 * `className` with those defaults before forwarding all other props to the underlying primitive.
 *
 * @returns A `CommandPrimitive` element with default styling and any provided props applied.
 */
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  );
}

/**
 * Render a dialog-backed command palette with a header, content area, and embedded Command.
 *
 * Renders a Dialog containing an accessible, sr-only header (title and description) and a DialogContent
 * that hosts the Command wrapper with styling for its internal slots. Accepts all Dialog props and
 * forwards them to the underlying Dialog.
 *
 * @param title - The visible title used for the dialog header (defaults to "Command Palette")
 * @param description - The visible description used for the dialog header (defaults to "Search for a command to run...")
 * @param className - Additional class names applied to the DialogContent wrapper (merged with default styles)
 * @param showCloseButton - If true, the underlying DialogContent will render a close button (defaults to true)
 * @returns A Dialog element containing the composed Command palette
 */
function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn('overflow-hidden p-0', className)}
        // @ts-ignore
        showCloseButton={showCloseButton}
      >
        <Command className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders the command palette text input with a leading search icon and composed styling.
 *
 * Additional props are forwarded to the underlying Cmdk `CommandPrimitive.Input`.
 *
 * @returns The command palette input element with a leading search icon.
 */
function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex h-9 items-center gap-2 border-b px-3">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  );
}

/**
 * Render the list container for command items in the command palette.
 *
 * @returns A `CommandPrimitive.List` element with default max-height, vertical scrolling, and merged `className` applied.
 */
function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', className)}
      {...props}
    />
  );
}

/**
 * Render the placeholder displayed when no commands match the current query.
 *
 * @param props - Props forwarded to the underlying `CommandPrimitive.Empty` element
 * @returns The rendered empty-state element for the command list
 */
function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

/**
 * Render a styled command group for grouping command items.
 *
 * Provides a cmdk Group primitive with a default data-slot ("command-group") and baseline styling for group layout and headings; accepts all Group props to override behavior or add classes.
 *
 * @returns The rendered command group element.
 */
function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

/**
 * Render a horizontal separator used between sections in the command palette.
 *
 * @param className - Additional CSS classes to merge with the component's default separator styles
 * @returns A `CommandPrimitive.Separator` element styled as a horizontal divider for the command palette
 */
function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}

/**
 * Render a styled command palette item suitable for use inside the Command list.
 *
 * Accepts all props of `CommandPrimitive.Item`; any `className` provided is merged with the component's default styles.
 *
 * @returns The rendered `CommandPrimitive.Item` element configured for command list appearance and interactions.
 */
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/**
 * Render a right-aligned shortcut badge for a command item.
 *
 * Applies the `data-slot="command-shortcut"` attribute and default typography/layout styles,
 * merges any provided `className`, and forwards remaining `span` props.
 *
 * @returns A `span` element used to display the command item's shortcut text
 */
function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator
};