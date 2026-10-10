export async function register() {
  // The branch is compiled out of the edge bundle; the scheduler needs Node (SQLite).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./scheduler");
  }
}
