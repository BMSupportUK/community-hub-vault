import { createFileRoute } from "@tanstack/react-router";
import { StreamingDevicesPage } from "@/components/app/StreamingDevicesPage";

export const Route = createFileRoute("/_authenticated/_approved/streaming-devices")({
  component: StreamingDevicesPage,
});