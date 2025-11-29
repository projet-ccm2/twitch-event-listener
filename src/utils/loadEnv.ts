import fs from "fs";
import path from "path";

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
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch {
    // ignore
  }
})();
