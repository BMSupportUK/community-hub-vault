import { createFileRoute } from "@tanstack/react-router";
import { PlayerDeviceLinkSection } from "@/components/app/PlayerDeviceLinkSection";
import linkBg from "@/assets/link-device-bg.jpg";

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
  return <main className="relative min-h-0 flex-1 overflow-y-auto bg-background">
    <img src={linkBg} alt="" aria-hidden width={1920} height={1088} className="pointer-events-none fixed inset-0 -z-0 h-full w-full object-cover opacity-70" />
    <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background/85" />
    <div className="relative px-4 py-8 sm:px-8 lg:py-12"><PlayerDeviceLinkSection /></div>
  </main>;
}
