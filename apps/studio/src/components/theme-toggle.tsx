import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { type LucideIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useId } from "react";

import { type Theme, themes, useTheme } from "@/lib/theme";

const choices = {
  system: { icon: MonitorIcon, title: "System", hint: "Match your device" },
  light: { icon: SunIcon, title: "Light", hint: "Always light" },
  dark: { icon: MoonIcon, title: "Dark", hint: "Always dark" },
} as const satisfies Record<Theme, { icon: LucideIcon; title: string; hint: string }>;

/** Chooses whether Studio follows the device's color scheme or stays light or dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const label = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={label} className="text-sm text-muted-foreground">
        Theme
      </span>
      <ToggleGroup
        aria-labelledby={label}
        variant="outline"
        size="sm"
        spacing={0}
        value={[theme]}
        onValueChange={([chosen]) => {
          const next = themes.find((option) => option === chosen);
          if (next !== undefined) setTheme(next);
        }}
      >
        {themes.map((option) => {
          const { icon: Icon, title, hint } = choices[option];
          return (
            <Tooltip key={option}>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    value={option}
                    aria-label={title}
                    className="aria-pressed:bg-accent aria-pressed:text-link"
                  />
                }
              >
                <Icon />
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
