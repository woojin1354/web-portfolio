// src/components/Popup.js
import { useEffect } from "react";
import "./Popup.css";

const HTML_PREFIX = "__HTML__:";

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
                const str = String(line ?? "");

                // 1) 안전 HTML 주입 분기 (__HTML__: 프리픽스)
                if (str.startsWith(HTML_PREFIX)) {
                  const html = str.slice(HTML_PREFIX.length);
                  return (
                    <div
                      key={idx}
                      className="popup-line popup-table"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                }

                // 2) URL 자동 링크 (그 외 텍스트 줄)
                const m = /^URL:\s+(https?:\/\/\S+)/.exec(str);
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

                // 3) 기본 텍스트 라인
                return (
                  <div key={idx} className="popup-line">
                    {str}
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