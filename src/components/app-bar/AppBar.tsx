import { Link } from '@tanstack/react-router';
import { MenuButton } from '~/components/app-bar/AppBarMenu';
import { robotoSans } from '../fonts';
import SupportOptions from '~/components/app-bar/SupportOptions';

export default function AppBar({ title }: { title: string }) {
  return (
    <header className="w-full border-b border-slate-200/60 bg-linear-to-r from-white via-slate-50 to-blue-50 shadow-lg backdrop-blur-sm dark:border-slate-700/60 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 lg:px-6">
        {/* Logo/Title Section */}
        <Link
          to="/"
          className="group -ml-1 rounded-lg px-1 py-0.5 transition-transform duration-150 outline-none hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 active:scale-[0.98] dark:focus-visible:ring-blue-500/50 dark:focus-visible:ring-offset-slate-900"
        >
          <div className="flex items-center space-x-3">
            <div
              className="flex h-12 w-12 items-center justify-center shadow-lg transition duration-150 group-hover:shadow-xl group-hover:brightness-110 group-active:brightness-95"
              style={{
                backgroundImage: "url('/img/icon_128_no_pad.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            ></div>
            <div className="select-none">
              <h1
                className={`bg-linear-to-r from-slate-800 to-slate-600 bg-clip-text text-xl font-bold text-transparent transition-colors duration-150 group-hover:from-blue-700 group-hover:to-blue-500 dark:from-slate-100 dark:to-slate-300 dark:group-hover:from-blue-300 dark:group-hover:to-blue-200 ${robotoSans.className}`}
              >
                {title}
              </h1>
              <p className="text-xs font-medium text-slate-500 transition-colors duration-150 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200">
                Literacy in Indic Scripts
              </p>
            </div>
          </div>
        </Link>

        {/* Actions Section */}
        <div className="flex items-center gap-2">
          <SupportOptions />
          <MenuButton />
        </div>
      </div>
    </header>
  );
}
