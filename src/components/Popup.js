// src/components/Popup.js
import { useEffect } from "react";
import "./Popup.css";

// URL: ... 줄에서 실제 URL을 추출 (플레인/앵커 모두 지원)
function parseUrlLine(s) {
  const str = String(s ?? "");
  // URL: <a href="...">...</a>
  const mAnchor = /^URL:\s+<a[^>]+href="([^"]+)"[^>]*>.*<\/a>\s*$/i.exec(str);
  if (mAnchor) return mAnchor[1];
  // URL: https://...
  const mPlain = /^URL:\s+(https?:\/\/\S+)\s*$/i.exec(str);
  if (mPlain) return mPlain[1];
  return null;
}

// 공백/빈 줄 판별
function isBlankLine(s) {
  return String(s ?? "").trim().length === 0;
}

// 첨부 라벨 줄 감지 (아이콘 + 라벨)
// - 아이콘 뒤 공백 유무 허용
// - 괄호(...) 요약은 제거
function parseAttachmentLabel(s) {
  let str = String(s ?? "").trim().normalize("NFC");

  // 라인 맨 앞 이모지 1개 추출 (Extended_Pictographic + optional FE0F/ZWJ)
  const m = /^([\p{Extended_Pictographic}](?:[\uFE0F\u200D])?)/u.exec(str);
  if (!m) return null;

  const icon = m[1]; // 실제 앞쪽 이모지
  let label = str.slice(m[0].length).trim();

  // 라벨 앞에도 이모지가 남아 있으면 한 번 더 제거 (중복 방지)
  label = label.replace(/^([\p{Extended_Pictographic}](?:[\uFE0F\u200D])?\s*)/u, "").trim();

  // 뒷부분의 (host/… ) 요약은 제거
  label = label.replace(/\s*\([^()]*\)\s*$/, "").trim();

  // 길이 제한(선택)
  if (label.length > 120) label = label.slice(0, 119) + "…";

  return { icon, label };
}

function Popup({ project, onClose }) {
  // ESC 닫기
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

      // 0) 안전 HTML 프리픽스 (__HTML__:)
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

      // 1) 첨부 라벨 줄: 가장 가까운 URL 줄(최대 5줄 앞)을 찾아 페어링
      const att = parseAttachmentLabel(raw);
      if (att) {
        let pairedUrl = null;
        let j = i + 1;
        const LOOKAHEAD = 5; // 필요하면 범위 조절
        while (j < lines.length && j <= i + LOOKAHEAD) {
          const probe = String(lines[j] ?? "");
          const url = parseUrlLine(probe);
          if (url) {
            pairedUrl = url;
            break;
          }
          // URL 줄이 아니면, 빈 줄은 무시하고 계속 탐색
          if (!isBlankLine(probe)) break; // 다른 내용이 끼면 중단
          j++;
        }

        if (pairedUrl) {
          out.push(
            <div key={`att-${i}`} className="popup-line">
              <a
                href={pairedUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="popup-attachment"
              >
                <span aria-hidden="true" className="popup-attachment-icon">
                  {att.icon}
                </span>{" "}
                <span className="popup-attachment-label">{att.label}</span>
              </a>
            </div>
          );
          i = j; // URL 줄까지 소비(숨김)
          continue;
        }
        // URL을 못 찾으면 일반 텍스트로 통과 (fallback)
      }

      // 2) (페어링 안 된) URL 단독 줄
      const soloUrl = parseUrlLine(raw);
      if (soloUrl) {
        out.push(
          <div key={`url-${i}`} className="popup-line">
            URL:{" "}
            <a href={soloUrl} target="_blank" rel="noreferrer noopener">
              {soloUrl}
            </a>
          </div>
        );
        continue;
      }

      // 3) 기본 텍스트
      out.push(
        <div key={`txt-${i}`} className="popup-line">
          {raw}
        </div>
      );
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
            <div className="popup-plain">{renderContent()}</div>
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
