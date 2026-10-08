import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANDROID_RELEASE } from "@/lib/android-release";

export const Route = createFileRoute("/get-android-app")({
  head: () => ({
    meta: [
      { title: "Download the BM Support Android app" },
      { name: "description", content: "Download the latest BM Support app for Android phones and TV boxes." },
      { property: "og:title", content: "Download the BM Support Android app" },
      { property: "og:description", content: "Get the latest BM Support Android app in one tap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GetAndroidApp,
});

function GetAndroidApp() {
  const [started, setStarted] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <Smartphone className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold text-foreground">BM Support for Android</h1>
        <p className="mt-1 text-sm text-muted-foreground">Version {ANDROID_RELEASE.versionName}</p>
        {started ? (
          <p className="mt-6 text-sm text-foreground">
            Your download has started. Open it from your notifications or Downloads folder once it finishes.
          </p>
        ) : (
          <Button asChild size="lg" className="mt-6 w-full">
            <a href={ANDROID_RELEASE.url} download onClick={() => setStarted(true)}>
              <Download className="mr-2 h-5 w-5" /> Download the app
            </a>
          </Button>
        )}
      </div>
    </main>
  );
}
