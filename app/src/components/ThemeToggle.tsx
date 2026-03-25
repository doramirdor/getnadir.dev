import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <button
      onClick={toggle}
      className={cn(
        "w-full flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        collapsed && "justify-center"
      )}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className={cn("w-[18px] h-[18px] flex-shrink-0", !collapsed && "mr-3")} strokeWidth={1.5} />
      ) : (
        <Moon className={cn("w-[18px] h-[18px] flex-shrink-0", !collapsed && "mr-3")} strokeWidth={1.5} />
      )}
      {!collapsed && (
        <span className="text-[13px]">
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </span>
      )}
    </button>
  );
}
