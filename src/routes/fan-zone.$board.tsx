import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/fan-zone/$board")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.board.replace(/-/g, " ")} — Boro Fan Zone` },
      { name: "description", content: `Topics in the ${params.board} board of the Boro Fan Zone.` },
    ],
  }),
  component: () => <Outlet />,
});