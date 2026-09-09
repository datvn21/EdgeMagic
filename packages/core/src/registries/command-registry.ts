import type { CommandInput, CommandRegistry, CommandResult, EdgeCommand, Unregister } from "@edgemagic/module-api";

export class RuntimeCommandRegistry implements CommandRegistry {
  private readonly commands = new Map<string, EdgeCommand>();
  register(command: EdgeCommand): Unregister {
    if (this.commands.has(command.id)) throw new Error(`Command already registered: ${command.id}`);
    this.commands.set(command.id, command);
    return () => { this.commands.delete(command.id); };
  }
  async execute(id: string, input?: CommandInput): Promise<CommandResult> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Command not registered: ${id}`);
    return command.run(input);
  }
  search(query: string): EdgeCommand[] {
    const normalized = query.trim().toLowerCase();
    const commands = [...this.commands.values()];
    return normalized ? commands.filter((command) => command.id.toLowerCase().includes(normalized) || command.titleKey.toLowerCase().includes(normalized) || command.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))) : commands;
  }
}
