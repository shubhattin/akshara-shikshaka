// Shared Tailwind class strings for UI that used to rely on a removed shadcn `blue` button variant.
// Works with Base UI Button the same way: pass via `className` with `cn(...)`.

export const custom_classes = {
  button: {
    blue: 'bg-blue-500 text-white shadow-xs hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-600'
  }
} as const;
