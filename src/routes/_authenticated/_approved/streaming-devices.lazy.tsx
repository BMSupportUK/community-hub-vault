import { createLazyFileRoute } from "@tanstack/react-router";
import { StreamingDevicesPage } from "@/components/app/StreamingDevicesPage";

export const Route = createLazyFileRoute("/_authenticated/_approved/streaming-devices")({
  component: StreamingDevicesPage,
});