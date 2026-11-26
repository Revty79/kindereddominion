import { useEffect, useState } from "react";
import { FALLBACK_ART, portableAssetURL } from "../assets/references";
export default function Artwork({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      className={className}
      src={failed ? portableAssetURL(FALLBACK_ART) : src}
      alt={failed ? `${alt} (artwork unavailable; fallback shown)` : alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
