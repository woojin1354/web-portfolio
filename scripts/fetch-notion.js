import { useEffect } from "react";
import "./Popup.css";

const HTML_PREFIX = "__HTML__:";

function parseUrlLine(s) {
  const str = String(s ?? "");

  // 1) URL: <a href="...">...</a>
  const mAnchor = /^URL:\s+<a[^>]+href="([^"]+)"[^>]*>.*<\/a>\s*$/i.exec(str);
  if (mAnchor) return mAnchor[1];

  // 2) URL: https://...
  const mPlain = /^URL:\s+(https?:\/\/\S+)\s*$/i.exec(str);
  if (mPlain) return mPlain[1];

  return null;
}

// "📎 파일명 (host/…)" 같은 첨부 라벨 줄 감지
function parseAttachmentLabel(s) {
  const str = String(s ?? "");
  // 아이콘 + 공백 + 라벨 텍스트
  // 예: "📎 kid16914-데이터과학과머신러닝-1-.hwp (prod-files-secure.s3.us-west-2.amazonaws.com/kid16914-…)"
  const m = /^([📎📄🖼️🎞️🔖🔗])\s+(.+)$/.exec(str);
  if (!m) return null;

  const icon = m[1];
  let label = m[2].trim();

  // 뒤의 (host/..)… 요약은 시각적 보조였으니 링크 텍스트에서는 제거
  // "파일명 (무언가)" 패턴 -> 파일명만
  const paren = label.match(/\s*\((?:.+)\)\s*$/);
  if (paren) {
    label = label.slice(0, paren.index).trim();
  }
  // 혹시 너무 길면 살짝만 줄임 (선택)
  if (label.length > 120) label = label.slice(0, 119) + "…";

  return { icon, label };
}

function Popup({ project, onClose }) {
  // ESC로 닫기
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!project) return null;
  const stop = (e) => e.stopPropagation();

const renderContent = () => {
  const out = [];
  const lines = Array.isArray(project.content) ? project.content : [];

  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] ?? "");

    // 0) 안전 HTML 프리픽스 (__HTML__:) 먼저 처리
    const htmlMatch = /^\uFEFF?\s*__HTML__:(.*)$/s.exec(raw);
    if (htmlMatch) {
      out.push(
        <div
          key={`html-${i}`}
          className="popup-line popup-table"
          dangerouslySetInnerHTML={{ __html: htmlMatch[1] }}
        />
      );
      continue;
    }

    // 1) 첨부 라벨 + 다음 줄 URL 페어 → 단일 하이퍼링크로
    const att = parseAttachmentLabel(raw);
    const next = lines[i + 1] ?? "";
    const nextUrl = parseUrlLine(next);
    if (att && nextUrl) {
      out.push(
        <div key={`att-${i}`} className="popup-line">
          <a href={nextUrl} target="_blank" rel="noreferrer noopener" className="popup-attachment">
            <span aria-hidden="true" className="popup-attachment-icon">{att.icon}</span>{" "}
            <span className="popup-attachment-label">{att.label}</span>
          </a>
        </div>
      );
      i += 1; // URL 줄은 소비하여 숨김
      continue;
    }

    // 2) (페어링 안 된) URL 단독 줄은 평소처럼 링크 처리
    const soloUrl = parseUrlLine(raw);
    if (soloUrl) {
      out.push(
        <div key={`url-${i}`} className="popup-line">
          URL: <a href={soloUrl} target="_blank" rel="noreferrer noopener">{soloUrl}</a>
        </div>
      );
      continue;
    }

    // 3) 백업: 프리픽스 없이 바로 <div class="notion-table-wrap"> 시작 시 HTML로 처리
    if (/^\s*<div\s+class="notion-table-wrap"/.test(raw)) {
      out.push(
        <div
          key={`html2-${i}`}
          className="popup-line popup-table"
          dangerouslySetInnerHTML={{ __html: raw }}
        />
      );
      continue;
    }

    // 4) 기본 텍스트
    out.push(<div key={`txt-${i}`} className="popup-line">{raw}</div>);
  }
  return out;
};


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
              {renderContent()}
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
