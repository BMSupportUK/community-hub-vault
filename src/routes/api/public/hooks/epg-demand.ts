import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
const Wake = z.object({ feed: z.string().regex(/^[A-Z0-9_]{2,20}$/), wake: z.string().regex(/^[0-9a-f-]{72}$/) });
export const Route = createFileRoute('/api/public/hooks/epg-demand')({
  server: { handlers: { POST: async ({ request }) => {
    const parsed = Wake.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response('Invalid request', { status: 400 });
    // One-use random capability, hashed in the queue. Claim verifies it atomically before reading/importing anything.
    const { importFeed } = await import('@/lib/real-epg.server');
    const result = await importFeed(parsed.data.feed, undefined, Date.now(), parsed.data.wake);
    if ('skipped' in result) return new Response('Unauthorized or already claimed', { status: 403 });
    return Response.json(result, { status: 'error' in result ? 503 : 200 });
  } } },
});