/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
  testPathIgnorePatterns: ["/dist/"],
  setupFilesAfterEnv: ["<rootDir>/src/tests/setup.ts"],
};
