import ProjectGrid from "./ProjectGrid.js";
import ProjectTop from "./ProjectTop.js";

function ProjectPage() {
    return (
        <>
            <div>
                <ProjectTop/>
            </div>
            <div>
                <ProjectGrid/>
            </div>
        </>
    )
}

export default ProjectPage;