import type { LucideIcon } from "lucide-react";
import { Compass, LayoutGrid, Settings, Clapperboard } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Главная", icon: Clapperboard },
  { href: "/tier-list", label: "Тир-лист", icon: LayoutGrid },
  { href: "/discover", label: "Поиск", icon: Compass },
  { href: "/settings", label: "Настройки", icon: Settings },
];
