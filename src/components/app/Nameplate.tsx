import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNameplate, nameplateBackgroundStyle } from "@/lib/nameplates";
import npSwampSage from "@/assets/np-swamp-sage.png.asset.json";
import npGreenCrew from "@/assets/np-green-crew.png.asset.json";
import npRollingDroid from "@/assets/np-rolling-droid.png.asset.json";
import npDarkHelm from "@/assets/np-dark-helm.png.asset.json";
import npRetroBroadcast from "@/assets/np-retro-broadcast.png.asset.json";
import npCosmicCub from "@/assets/np-cosmic-cub.png.asset.json";
import npSunlit from "@/assets/np-sunlit.png.asset.json";
import npWebRivals from "@/assets/np-web-rivals.png.asset.json";
import npIceRider from "@/assets/np-ice-rider.png.asset.json";
import npDesertPod from "@/assets/np-desert-pod.png.asset.json";
import npBerryKitty from "@/assets/np-berry-kitty.png.asset.json";
import npMidnightKitty from "@/assets/np-midnight-kitty.png.asset.json";

/** Nameplate pack v2: animation class -> mascot artwork (original designs). */
const MASCOTS: Record<string, { url: string; alt: string }> = {
  "nameplate-sunlit": { url: npSunlit.url, alt: "" },
  "nameplate-swampsage": { url: npSwampSage.url, alt: "" },
  "nameplate-greencrew": { url: npGreenCrew.url, alt: "" },
  "nameplate-droid": { url: npRollingDroid.url, alt: "" },
  "nameplate-rivals": { url: npWebRivals.url, alt: "" },
  "nameplate-icerider": { url: npIceRider.url, alt: "" },
  "nameplate-darkhelm": { url: npDarkHelm.url, alt: "" },
  "nameplate-desertpod": { url: npDesertPod.url, alt: "" },
  "nameplate-retrobroadcast": { url: npRetroBroadcast.url, alt: "" },
  "nameplate-cosmiccub": { url: npCosmicCub.url, alt: "" },
  "nameplate-berrykitty": { url: npBerryKitty.url, alt: "" },
  "nameplate-midnightkitty": { url: npMidnightKitty.url, alt: "" },
};

/** v2 plates that use the shared layering helpers in styles.css. */
const V2_CLASSES = new Set([
  ...Object.keys(MASCOTS),
  "nameplate-alpine",
  "nameplate-static",
  "nameplate-weblines",
]);

interface NameplateProps {
  id: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  fallbackStyle?: CSSProperties;
  children?: ReactNode;
}

/** Renders the user's equipped nameplate as a background. If id is null
 * or the nameplate is unavailable, applies fallbackStyle instead. */
export function Nameplate({ id, className, style, fallbackStyle, children }: NameplateProps) {
  const np = useNameplate(id);
  const bg = nameplateBackgroundStyle(np);
  const finalStyle: CSSProperties = { ...(bg ?? fallbackStyle ?? {}), ...style };
  const cls = np?.animation_class ?? "";
  const mascot = MASCOTS[cls];
  return (
    <div
      className={cn("relative overflow-hidden", cls, V2_CLASSES.has(cls) && "np2", className)}
      style={finalStyle}
      aria-hidden={!children}
    >
      {/* Readability scrim: tones down bright nameplate backgrounds so overlaid
          text and badges stay legible. Sits above the background but below
          decorative icons/sparkles and content. */}
      {(np || fallbackStyle) && (
        <div
          className="pointer-events-none absolute inset-0 bg-background/35 dark:bg-background/45 mix-blend-multiply dark:mix-blend-normal"
          aria-hidden
        />
      )}
      {np?.animation_class === "nameplate-hotdog" && (
        <span className="nameplate-hotdog-icon" aria-hidden>🌭</span>
      )}
      {np?.animation_class === "nameplate-pitch" && (
        <>
          <span className="nameplate-pitch-ball" aria-hidden>⚽</span>
          <span className="nameplate-pitch-player" aria-hidden>🏃</span>
        </>
      )}
      {np?.animation_class === "nameplate-cinema" && (
        <>
          <span className="nameplate-cinema-reel r1" aria-hidden>🎞️</span>
          <span className="nameplate-cinema-reel r2" aria-hidden>🎞️</span>
          <span className="nameplate-cinema-tv" aria-hidden>
            <span className="nameplate-cinema-screen">
              <span className="nameplate-cinema-scan" />
            </span>
          </span>
        </>
      )}
      {np?.animation_class === "nameplate-devil" && (
        <>
          <span className="nameplate-devil-icon" aria-hidden>😈</span>
          <span className="nameplate-devil-flame" aria-hidden>🔥</span>
          <span className="nameplate-devil-ember e1" aria-hidden />
          <span className="nameplate-devil-ember e2" aria-hidden />
          <span className="nameplate-devil-ember e3" aria-hidden />
        </>
      )}
      {np?.animation_class === "nameplate-corgi" && (
        <>
          <span className="nameplate-corgi-petal" aria-hidden>🌸</span>
          <span className="nameplate-corgi-petal p2" aria-hidden>🌼</span>
          <span className="nameplate-corgi-dust" aria-hidden />
          <span className="nameplate-corgi-dust d2" aria-hidden />
          <span className="nameplate-corgi-icon" aria-hidden>🐕</span>
        </>
      )}
      {np?.animation_class === "nameplate-panda" && (
        <>
          <span className="nameplate-panda-sparkle s1" aria-hidden>✨</span>
          <span className="nameplate-panda-sparkle s2" aria-hidden>✦</span>
          <span className="nameplate-panda-sparkle s3" aria-hidden>✨</span>
          <span className="nameplate-panda-icon" aria-hidden>🐼</span>
        </>
      )}
      {np?.animation_class === "nameplate-retrotv" && (
        <span className="nameplate-retrotv-tv" aria-hidden>
          <span className="nameplate-retrotv-screen">
            <span className="nameplate-retrotv-scan" />
          </span>
          <span className="nameplate-retrotv-knob k1" aria-hidden />
          <span className="nameplate-retrotv-knob k2" aria-hidden />
        </span>
      )}
      {mascot && (
        <img
          src={mascot.url}
          alt=""
          aria-hidden
          loading="lazy"
          width={512}
          height={512}
          className="nameplate-mascot"
        />
      )}
      {cls === "nameplate-alpine" && <span className="nameplate-alpine-cross" aria-hidden />}
      {children}
    </div>
  );
}