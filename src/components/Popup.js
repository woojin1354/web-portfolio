import { useEffect } from "react";
import "./Popup.css";

function Popup({ project, onClose }) {
  // ESC로 닫기
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!project) return null;
  const stop = (e) => e.stopPropagation();

  return (
    <div className="popup-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="popup-content" onClick={stop}>
        <div className="popup-header">
          <h2 className="popup-title">{project.title}</h2>
          <button className="popup-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="popup-body">
          {Array.isArray(project.content) && project.content.length > 0 ? (
            <div className="popup-plain">
              {project.content.map((line, idx) => {
                const m = /^URL:\s+(https?:\/\/\S+)/.exec(line);
                if (m) {
                  return (
                    <div key={idx} className="popup-line">
                      URL:{" "}
                      <a href={m[1]} target="_blank" rel="noreferrer">
                        {m[1]}
                      </a>
                    </div>
                  );
                }
                if (typeof line === "string" && line.startsWith('<div class="notion-table-wrap">')) {
                  return (
                    <div
                      key={idx}
                      className="popup-line popup-table"
                      dangerouslySetInnerHTML={{ __html: line }}
                    />
                  );
                }
                return (
                  <div key={idx} className="popup-line">
                    {line}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="popup-desc">본문이 없습니다.</p>
          )}
        </div>

        <div className="popup-footer">
          {project.url && (
            <a className="popup-link" href={project.url} target="_blank" rel="noreferrer">
              Notion에서 열기
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default Popup;