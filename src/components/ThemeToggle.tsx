import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

/**
 * Global light/dark toggle. Reads and writes the same store used everywhere
 * (`cn.theme` in localStorage + `.light`/`.dark` on <html>), so toggling
 * from any editor or the presentation shell updates the whole app.
 */
export function ThemeToggle({
  className,
  variant = "ghost",
  size = "sm",
}: {
  className?: string;
  variant?: "ghost" | "outline" | "secondary";
  size?: "sm" | "icon";
}) {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggle}
      className={className}
      title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      aria-label="Alternar tema"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
