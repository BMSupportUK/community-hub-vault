import { ChannelColumn } from "@/components/app/ChannelColumn";

export function Coming({ title, Icon, desc }: { title: string; Icon: React.ComponentType<{ className?: string }>; desc: string }) {
  return (
    <>
      <ChannelColumn title={title} groups={[{ label: title, items: [{ to: "#", label: title.toLowerCase() }] }]} />
      <main className="flex-1 grid place-items-center">
        <div className="text-center max-w-md">
          <div className="size-14 rounded-2xl bg-surface-2 grid place-items-center mx-auto mb-4"><Icon className="size-6 text-primary" /></div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
        </div>
      </main>
    </>
  );
}
