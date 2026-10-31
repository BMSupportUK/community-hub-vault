import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Amazon skips developer activation when already enabled but still needs installation permission", () => {
  const dir = mkdtempSync(join(tmpdir(), "direct-developer-"));
  try {
    const source = readFileSync("tv-direct-install/app/src/main/java/uk/bmsupport/directinstall/DeveloperSetup.java", "utf8");
    writeFileSync(join(dir, "DeveloperSetup.java"), source);
    writeFileSync(join(dir, "DeveloperSetupCheck.java"), `package uk.bmsupport.directinstall;
      class DeveloperSetupCheck {
        public static void main(String[] args) {
          if (DeveloperSetup.needsActivation(true, false)) throw new AssertionError("Already a developer must skip activation");
          if (DeveloperSetup.needsActivation(true, true)) throw new AssertionError("Fully configured must skip activation");
          if (DeveloperSetup.needsActivation(false, true)) throw new AssertionError("Install allowed needs no developer activation");
          if (!DeveloperSetup.needsActivation(false, false)) throw new AssertionError("Unconfigured TV retains activation fallback");
        }
      }`);
    const compile = Bun.spawnSync(["javac", "-d", dir, join(dir, "DeveloperSetup.java"), join(dir, "DeveloperSetupCheck.java")]);
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync(["java", "-cp", dir, "uk.bmsupport.directinstall.DeveloperSetupCheck"]);
    expect(run.exitCode).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});