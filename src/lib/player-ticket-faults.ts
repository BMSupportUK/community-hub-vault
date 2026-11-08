/** Ticket faults are persistent and independent of temporary playback health. */
export const faultChannelKey = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export type ChannelFaultTicket = { player_channel_name: string | null; player_channel_key: string | null; status: string };
export function activeFaultChannels(tickets: ChannelFaultTicket[]): string[] {
  const channels = new Map<string, string>();
  for (const ticket of tickets) {
    if (!ticket.player_channel_name || ["resolved", "closed"].includes(ticket.status)) continue;
    channels.set(faultChannelKey(ticket.player_channel_name), ticket.player_channel_name);
  }
  return [...channels.values()].sort();
}
export function eventTicketFaults(event: { channels: string[] }, channels: string[]): string[] {
  const faults = new Set(channels.map(faultChannelKey));
  return event.channels.filter(channel => faults.has(faultChannelKey(channel)));
}