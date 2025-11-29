// Global test setup for Jest

// Silence console during tests unless explicitly inspected
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  (console.log as jest.Mock).mockRestore?.();
  (console.warn as jest.Mock).mockRestore?.();
  (console.error as jest.Mock).mockRestore?.();
});

// Provide a default global fetch mock; tests may override behaviour
const g: any = global;
if (!g.fetch) {
  g.fetch = jest.fn();
}
