/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
  testPathIgnorePatterns: ["/dist/"],
  coverageProvider: "v8",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/tests/**/*",
    "!src/**/index.ts",
    "!src/swagger/**/*",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["lcov", "text", "text-summary"],
  setupFilesAfterEnv: ["<rootDir>/src/tests/setup.ts"],
};
