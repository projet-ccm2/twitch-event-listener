import fs from "node:fs";
import path from "node:path";

(() => {
  try {
    const envFile = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envFile)) {
      return;
    }
    const contents = fs.readFileSync(envFile, "utf-8");
    contents.split(/\r?\n/).forEach((line) => {
      if (!line) return;
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return;
      const match = /^([A-Za-z_]\w*)=(.*)$/.exec(trimmed);
      if (!match) return;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    });
  } catch {
    return;
  }
})();
