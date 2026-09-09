import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("sync provider boundaries", () => {
  it("keeps Google Drive provider imports out of modules", () => {
    const moduleFiles = listSourceFiles(join(process.cwd(), "modules"));
    const offenders = moduleFiles.filter((file) =>
      readFileSync(file, "utf8").includes("@edgemagic/sync-google-drive")
    );

    expect(offenders).toEqual([]);
  });
});

function listSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}
