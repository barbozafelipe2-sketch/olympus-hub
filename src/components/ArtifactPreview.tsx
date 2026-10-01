import { useEffect, useState } from "react";
import {
  getArtifactPreviewUrl,
  type ArtifactRow
} from "../lib/artifacts";

type Props = {
  artifact: ArtifactRow;
};

export function ArtifactPreview({ artifact }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!artifact.mime_type.startsWith("image/")) {
      setUrl(null);
      return () => {
        active = false;
      };
    }

    void getArtifactPreviewUrl(artifact)
      .then((signedUrl) => {
        if (active) setUrl(signedUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => {
      active = false;
    };
  }, [artifact.id, artifact.current_version, artifact.mime_type]);

  if (!url) return null;

  return (
    <a
      className="artifact-preview"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={"Open " + artifact.title}
    >
      <img src={url} alt={artifact.title} loading="lazy" />
    </a>
  );
}
