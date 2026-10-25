// Vitest runs outside React's server environment, where the real
// "server-only" package throws by design. Server code is still server-only
// in the app; tests import it directly.
export {};
