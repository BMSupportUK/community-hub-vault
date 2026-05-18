import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNameplate, nameplateBackgroundStyle } from "@/lib/nameplates";

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
  return (
    <div
      className={cn("relative overflow-hidden", np?.animation_class, className)}
      style={finalStyle}
      aria-hidden={!children}
    >
      {np?.animation_class === "nameplate-hotdog" && (
        <span className="nameplate-hotdog-icon" aria-hidden>🌭</span>
      )}
      {children}
    </div>
  );
}