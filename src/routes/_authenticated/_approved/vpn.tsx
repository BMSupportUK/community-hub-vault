import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_approved/vpn")({
  beforeLoad: () => {
    throw redirect({ to: "/shop", search: { view: "store", tab: "vpn" } as never });
  },
  component: () => null,
});