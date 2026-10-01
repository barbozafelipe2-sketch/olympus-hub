import type { ApiSource } from "../types";

type Props = {
  sources?: ApiSource[];
};

export function MessageSources({ sources }: Props) {
  if (!sources?.length) return null;

  return (
    <div className="message-sources" aria-label="Web sources">
      <span>Sources</span>
      <div className="message-source-list">
        {sources.map((source, index) => (
          <a
            key={source.url + index}
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            title={source.title}
          >
            <strong>{index + 1}</strong>
            <span>{source.title || source.url}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
