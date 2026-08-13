import { useEffect, useState } from "react";
import { formatLastSeen } from "@/lib/relative-time";

/** Renders relative time only after hydration to avoid SSR/client mismatches. */
export function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(formatLastSeen(iso));
  }, [iso]);
  return <span>{text ?? ""}</span>;
}
