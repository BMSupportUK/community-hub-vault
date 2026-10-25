export type RemoteDevice = "amazon" | "android";

type AppIdentity = { appName?: string | null; fileName?: string | null };

export function remoteAppKind(build: AppIdentity): "enabler" | "helper" | null {
  const name = `${build.appName ?? ""} ${build.fileName ?? ""}`;
  if (/tv[\s_-]*enabler/i.test(name)) return "enabler";
  if (/remote[\s_-]*(helper|support)|bm[\s_-]*support[\s_-]*remote/i.test(name)) return "helper";
  return null;
}

export function matchesRemoteDevice(build: AppIdentity, device: RemoteDevice): boolean {
  const kind = remoteAppKind(build);
  return kind === "helper" || (kind === "enabler" && device === "amazon");
}