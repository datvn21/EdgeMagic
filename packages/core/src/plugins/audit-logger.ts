import type { PluginAuditLogEntry, PluginAuditLogger } from "@edgemagic/module-api";

export class RuntimePluginAuditLogger implements PluginAuditLogger {
  private readonly entries: PluginAuditLogEntry[] = [];
  private sequence = 0;
  record(entry: Omit<PluginAuditLogEntry, "id" | "createdAt">): void {
    this.entries.push({ ...entry, id: `audit-${++this.sequence}`, createdAt: Date.now() });
  }
  list(pluginId?: string): PluginAuditLogEntry[] {
    return this.entries.filter((entry) => !pluginId || entry.pluginId === pluginId);
  }
}
