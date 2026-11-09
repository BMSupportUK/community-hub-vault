import { createFileRoute } from "@tanstack/react-router";
import { PlayerDeviceLinkSection } from "@/components/app/PlayerDeviceLinkSection";

export const Route = createFileRoute("/_authenticated/_approved/send-to-app")({
  component: SendToAppPage,
  head: () => ({ meta: [
    { title: "Link Device | BM Support" },
    { name: "description", content: "Enter the code shown on your BM Player to link that device to your account." },
    { property: "og:title", content: "Link Device | BM Support" },
    { property: "og:description", content: "Enter the code shown on your BM Player to link that device to your account." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function SendToAppPage() {
  return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8"><PlayerDeviceLinkSection /></main>;
}
