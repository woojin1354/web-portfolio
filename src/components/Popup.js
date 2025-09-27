import { useEffect } from "react";
import "./Popup.css";

function Popup({ project, onClose }) {
  if (!project) return null;

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stop = (e) => e.stopPropagation();

  return (
    <div className="popup-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="popup-content" onClick={stop}>
        <div className="popup-header">
          <h2 className="popup-title">{project.title}</h2>
          <button className="popup-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {project.image && (
          <img className="popup-image" src={project.image} alt={project.title} />
        )}

        <div className="popup-body">
          <p className="popup-desc">
            {project.description || "설명이 없습니다."}
          </p>

          <div className="popup-meta">
            {project.date && (
              <span className="popup-chip">
                {new Date(project.date).toLocaleDateString()}
              </span>
            )}
            {project.status && (
              <span className="popup-chip">{project.status}</span>
            )}
          </div>

          {Array.isArray(project.tags) && project.tags.length > 0 && (
            <div className="popup-tags">
              {project.tags.map((t, i) => (
                <span key={i} className="popup-tag">{t}</span>
              ))}
            </div>
          )}
        </div>

        {project.url && (
          <div className="popup-actions">
            <a className="popup-link" href={project.url} target="_blank" rel="noreferrer">
              Notion에서 열기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default Popup;