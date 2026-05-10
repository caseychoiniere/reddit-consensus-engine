import { Moon, Sun } from "lucide-react";
import { useAppContext } from "../../../../../Downloads/reddit-consensus-engine (4)/src/context/AppContext.tsx";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useAppContext();

  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 group"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 text-slate-600 group-hover:text-orange-600" />
      ) : (
        <Sun className="w-5 h-5 text-orange-400 group-hover:text-orange-300" />
      )}
    </button>
  );
}
