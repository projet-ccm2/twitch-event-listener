import fs from "fs";
import os from "os";
import path from "path";

describe("loadEnv utility", () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.chdir(originalCwd);
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete (process.env as any)[key];
      }
    });
    Object.entries(originalEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  test("loads variables from .env without overwriting existing values", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "envtest-"));
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      'FOO=bar\nEXISTING=old\nQUOTED="quoted"\n#comment\n',
    );
    process.chdir(tmpDir);
    process.env.EXISTING = "keep";

    jest.isolateModules(() => {
      require("../utils/loadEnv");
    });

    expect(process.env.FOO).toBe("bar");
    expect(process.env.QUOTED).toBe("quoted");
    expect(process.env.EXISTING).toBe("keep");
  });
});
