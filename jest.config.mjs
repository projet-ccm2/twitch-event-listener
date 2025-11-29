/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/tests/**",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.spec.{ts,tsx}",
    "!src/index.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html", "json"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: [
    "**/test/**/*.test.{ts,tsx}",
    "**/test/**/*.spec.{ts,tsx}",
    "**/src/**/*.test.{ts,tsx}",
    "**/src/**/*.spec.{ts,tsx}",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["<rootDir>/src/tests/setup.ts"],
};
