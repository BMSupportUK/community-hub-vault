import { apkPackage } from "./apk-package";

/** Used only after upload authorization, or for approved public installation builds. */
export async function storedApkPackage(filePath: string, fileName: string): Promise<string | null> {
  if (!fileName.toLowerCase().endsWith(".apk")) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from("app-builds").download(filePath);
  if (error || !data) throw new Error("Couldn't read the uploaded APK. Please try again.");
  return apkPackage(new Uint8Array(await data.arrayBuffer()));
}