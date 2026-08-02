import { Link } from '@tanstack/react-router';
import { FaBookOpen, FaHome } from 'react-icons/fa';
import { cn } from '~/lib/utils';
import { buttonVariants } from '~/components/ui/button';

const floatingChars = [
  { char: 'अ', className: 'top-16 left-6 md:left-12' },
  { char: 'క', className: 'top-24 right-8 md:right-16' },
  { char: 'ಅ', className: 'bottom-28 left-10 md:left-20' },
  { char: 'അ', className: 'right-10 bottom-20 md:right-24' },
  { char: 'அ', className: 'top-1/3 right-1/4 hidden lg:block' },
  { char: 'অ', className: 'bottom-1/3 left-1/4 hidden lg:block' }
] as const;

export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-16">
      <title>Page Not Found | Akshara Shikshaka</title>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-amber-50/80 via-transparent to-orange-50/60 dark:from-amber-950/30 dark:via-transparent dark:to-orange-950/20"
      />

      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
        {floatingChars.map(({ char, className }) => (
          <div
            key={char + className}
            className={cn(
              'absolute text-5xl text-amber-700/15 md:text-6xl dark:text-amber-300/15',
              className
            )}
          >
            {char}
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <p
          className="mb-4 bg-linear-to-r from-amber-600 via-orange-500 to-rose-500 bg-clip-text text-7xl font-bold tracking-tight text-transparent md:text-8xl"
          aria-hidden
        >
          ४०४
        </p>

        <p className="mb-2 text-sm font-semibold tracking-widest text-amber-600 uppercase dark:text-amber-400">
          Not Found
        </p>

        <h1 className="mb-4 text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
          This akshara wandered off the page
        </h1>

        <p className="mx-auto mb-10 max-w-lg text-base text-slate-600 md:text-lg dark:text-slate-300">
          The path you followed isn&apos;t in our script. Head home, or continue learning Sanskrit
          across Devanagari, Telugu, Kannada, Malayalam, and more.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'h-11 gap-2 bg-linear-to-r from-amber-500 to-orange-500 px-5 text-base font-semibold text-white shadow-lg hover:from-amber-600 hover:to-orange-600'
            )}
          >
            <FaHome />
            Go Home
          </Link>
          <Link
            to="/learn"
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'h-11 gap-2 border-2 border-amber-500/40 bg-white/70 px-5 text-base font-semibold text-amber-700 shadow-sm backdrop-blur-sm hover:border-amber-500 hover:bg-amber-50 dark:border-amber-400/30 dark:bg-slate-900/50 dark:text-amber-300 dark:hover:bg-amber-950/40'
            )}
          >
            <FaBookOpen />
            Start Learning
          </Link>
        </div>
      </div>
    </div>
  );
}
