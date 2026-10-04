// Everything is fetched client-side behind the SSE stream, so there is nothing
// useful to server-render — a plain SPA also keeps browser-only code simple.
export const ssr = false;
