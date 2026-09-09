import { Bell, CheckSquare, Clipboard, FileText, Library, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ModuleId = "clipboard" | "notes" | "todo" | "reminder" | "library" | "saved" | "bookmarks" | "settings";

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  supportsPeek: boolean;
}

export const widgetRegistry: readonly ModuleDefinition[] = [
  { id: "clipboard", label: "Clipboard", icon: Clipboard, supportsPeek: true },
  { id: "notes", label: "Notes", icon: FileText, supportsPeek: true },
  { id: "todo", label: "Todo", icon: CheckSquare, supportsPeek: true },
  { id: "reminder", label: "Reminder", icon: Bell, supportsPeek: true },
  { id: "library", label: "Library", icon: Library, supportsPeek: true },
  { id: "settings", label: "Settings", icon: Settings, supportsPeek: false }
];
