/** Public site origin + minimal public routes, so the agent can give shareable links. */

function readBaseUrl(): string {
  const raw = (process.env.VITE_BASE_URL ?? '').trim().split(/\s/)[0] ?? '';
  const cleaned = raw.replace(/\/+$/, '');
  // Defense-in-depth: env is operator-controlled, but keep the <site> tag shape intact.
  if (!/^https?:\/\/[^<>\s]+$/.test(cleaned)) return '';
  return cleaned;
}

/** `<site>` section content, rebuilt on every agent creation (so new and old chats get it). */
export function buildSiteContext(): string {
  const origin = readBaseUrl();
  if (!origin) {
    return `Public site origin (VITE_BASE_URL): (not set — use relative paths only)
Public routes (minimal, enough to link answers):
- / — home page (public landing)
- /learn — learn / practice experience
Link rules:
- When the admin asks for a reference or link to share, link the relevant public route with a relative path.
- Only link routes that exist above; never invent deeper paths.`;
  }
  return `Public site origin (VITE_BASE_URL): ${origin}
Public routes (minimal, enough to link answers):
- / — home page (public landing)
- /learn — learn / practice experience
Link rules:
- When the admin asks for a reference or link to share, link the relevant public route.
- Prefer absolute URLs (<origin><path>, e.g. ${origin}/learn) for shareable references; relative paths are fine otherwise.
- Only link routes that exist above; never invent deeper paths.`;
}
