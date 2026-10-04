import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { unlock } from "@/lib/checkout.server";

const accessInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(64) });
const guideInput = accessInput.extend({ blogId: z.string().uuid(), stepIndex: z.number().int().min(0).optional() });
const SIGNED_URL_SECONDS = 600;
const VIDEO_BUCKET = "guide-videos";

async function paidOrderAccess(token: string, password: string) {
  const unlocked = await unlock(token, password);
  if (!unlocked) return null;
  const { data: order } = await unlocked.supabaseAdmin.from("orders").select("order_ref,paid_at,status").eq("id", unlocked.link.order_id).maybeSingle();
  if (!order?.paid_at || order.status === "cancelled") return null;
  return { ...unlocked, order };
}

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  return match ? { bucket: match[1], path: decodeURIComponent(match[2]) } : null;
}

export const getCheckoutInstallGuides = createServerFn({ method: "POST" })
  .inputValidator((input) => accessInput.parse(input))
  .handler(async ({ data }) => {
    const access = await paidOrderAccess(data.token, data.password);
    if (!access) return { ok: false as const };
    const [{ data: categories }, { data: guides }] = await Promise.all([
      access.supabaseAdmin.from("install_categories").select("id,name,sort_order").order("sort_order"),
      access.supabaseAdmin.from("install_blogs").select("id,category_id,title,excerpt,body,image_url,pdf_url,video_url,video_steps,file_path,file_name,file_mime,sort_order").eq("published", true).order("sort_order").order("created_at", { ascending: false }),
    ]);
    return { ok: true as const, orderRef: String(access.order.order_ref ?? access.link.order_id).slice(0, 64), categories: categories ?? [], guides: guides ?? [] };
  });

export const openCheckoutInstallGuide = createServerFn({ method: "POST" })
  .inputValidator((input) => guideInput.parse(input))
  .handler(async ({ data }) => {
    const access = await paidOrderAccess(data.token, data.password);
    if (!access) return { ok: false as const };
    const { data: guide } = await access.supabaseAdmin.from("install_blogs").select("id,title,body,pdf_url,file_path,file_name,file_mime").eq("id", data.blogId).eq("published", true).maybeSingle();
    if (!guide) return { ok: false as const };
    let url = guide.pdf_url as string | null;
    if (guide.file_path) {
      const { data: signed, error } = await access.supabaseAdmin.storage.from("guide-files").createSignedUrl(guide.file_path, SIGNED_URL_SECONDS);
      if (error) throw new Error(error.message);
      url = signed?.signedUrl ?? null;
    }
    return { ok: true as const, title: String(guide.title), body: (guide.body as string | null) ?? null, url };
  });

export const openCheckoutGuideVideo = createServerFn({ method: "POST" })
  .inputValidator((input) => guideInput.parse(input))
  .handler(async ({ data }) => {
    const access = await paidOrderAccess(data.token, data.password);
    if (!access) return { ok: false as const };
    const { data: guide } = await access.supabaseAdmin.from("install_blogs").select("video_url,video_steps").eq("id", data.blogId).eq("published", true).maybeSingle();
    const steps = Array.isArray(guide?.video_steps) ? guide.video_steps : [];
    const requestedStep = data.stepIndex === undefined ? null : steps[data.stepIndex];
    const stepRef = requestedStep && typeof requestedStep === "object" && "video_url" in requestedStep
      ? String(requestedStep.video_url ?? "")
      : "";
    const ref = (data.stepIndex === undefined ? String(guide?.video_url ?? "") : stepRef).trim();
    if (!ref) return { ok: false as const };
    const sign = async (path: string) => {
      const { data: signed, error } = await access.supabaseAdmin.storage.from(VIDEO_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error) throw new Error(error.message);
      return signed?.signedUrl ?? null;
    };
    if (ref.startsWith(`${VIDEO_BUCKET}:`)) return { ok: true as const, url: await sign(ref.slice(VIDEO_BUCKET.length + 1)) };
    const parsed = parseStorageUrl(ref);
    if (parsed?.bucket === VIDEO_BUCKET) return { ok: true as const, url: await sign(parsed.path) };
    if (parsed) return { ok: false as const };
    return { ok: true as const, url: ref };
  });