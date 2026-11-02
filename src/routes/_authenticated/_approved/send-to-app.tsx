import { createFileRoute } from "@tanstack/react-router";
import { PlayerDeviceLinkSection } from "@/components/app/PlayerDeviceLinkSection";

export const Route = createFileRoute("/_authenticated/_approved/send-to-app")({
  component: SendToAppPage,
  head: () => ({ meta: [
    { title: "Send login to BM Player | BM Support" },
    { name: "description", content: "Enter the code on your TV or PC to send your username and password to the BM Player app." },
    { property: "og:title", content: "Send login to BM Player | BM Support" },
    { property: "og:description", content: "Enter the code on your TV or PC to send your login to the BM Player app." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function SendToAppPage() {
  return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8"><PlayerDeviceLinkSection /></main>;
}
