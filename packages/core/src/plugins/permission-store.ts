import type { PluginPermission, PluginPermissionStore } from "@edgemagic/module-api";

export class RuntimePluginPermissionStore implements PluginPermissionStore {
  private readonly grants = new Map<string, Set<PluginPermission>>();
  constructor(initialGrants: Record<string, PluginPermission[]> = {}) {
    for (const [pluginId, permissions] of Object.entries(initialGrants)) this.grants.set(pluginId, new Set(permissions));
  }
  grant(pluginId: string, permission: PluginPermission): void { this.ensure(pluginId).add(permission); }
  revoke(pluginId: string, permission: PluginPermission): void { this.ensure(pluginId).delete(permission); }
  has(pluginId: string, permission: PluginPermission): boolean { return this.grants.get(pluginId)?.has(permission) ?? false; }
  list(pluginId: string): PluginPermission[] { return [...(this.grants.get(pluginId) ?? [])]; }
  private ensure(pluginId: string): Set<PluginPermission> {
    const existing = this.grants.get(pluginId);
    if (existing) return existing;
    const next = new Set<PluginPermission>();
    this.grants.set(pluginId, next);
    return next;
  }
}
