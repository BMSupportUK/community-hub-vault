import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_approved/home/")({
  beforeLoad: () => {
    throw redirect({ to: "/home/$channel", params: { channel: "welcome" } });
  },
});