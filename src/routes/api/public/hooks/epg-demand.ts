import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/public/hooks/epg-demand')({
  server: { handlers: { POST: () => new Response('Country EPG retired', { status: 410 }) } },
});