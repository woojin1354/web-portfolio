import { useEffect, useState } from "react";
import "./ProjectGrid.css";

function ProjectGrid() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const getStatusColor = (status) => {
    switch (status) {
      case "완료":   return "#2d5a2d";
      case "진행중": return "#ef6c00";
      case "계획중": return "#1565c0";
      default:       return "#666666";
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // GitHub Pages 루트에 배포되므로 '/projects.json'
        const res = await fetch("/projects.json", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (e) {
        setError("프로젝트 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="projects-grid-wrapper">로딩중…</div>;
  if (error)   return <div className="projects-grid-wrapper">{error}</div>;

  return (
    <div className="projects-grid-wrapper">
      <div className="heading">
        <div className="text-wrapper-3">프로젝트 목록</div>
      </div>

      <div className="projects-grid">
        {projects.map((project) => (
          <div key={project.id} className="project-card">
            <div className="project-image">
              <img src={project.image} alt={project.title} />
              <div
                className="project-status"
                style={{ backgroundColor: getStatusColor(project.status) }}
              >
                {project.status}
              </div>
            </div>

            <div className="project-content">
              <div className="project-title">{project.title}</div>

              {project.date && (
                <div className="project-date">
                  {new Date(project.date).toLocaleDateString()}
                </div>
              )}

              {/* description은 비어있을 수 있음 */}
              {project.description && (
                <div className="project-description">{project.description}</div>
              )}

              <div className="project-tech">
                {project.tags?.map((tag, idx) => (
                  <span key={idx} className="tech-tag">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div>표시할 프로젝트가 없습니다.</div>}
      </div>
    </div>
  );
}

export default ProjectGrid;
