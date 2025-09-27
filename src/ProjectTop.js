import "./ProjectTop.css";
import Profileimage from "./assets/images/ProfileImage.png";
function ProjectTop() {
  return (
    <div className="projects-section">
      <div className="profile">
        <img
          className="image"
          alt="Profile"
          src={Profileimage}
        />
      </div>

      <div className="container">
        <div className="div">
          <div className="text-wrapper">프로젝트</div>
        </div>
        <div className="div">
          <p className="p">
            <span className="span">지금까지 진행한 </span>
            <span className="text-wrapper-2">다양한 프로젝트들</span>
            <span className="span">을 소개합니다.</span>
          </p>
        </div>
        <div className="stats-info">
          <div className="stat-item">
            <div className="stat-number">12+</div>
            <div className="stat-text">완료된 프로젝트</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">3</div>
            <div className="stat-text">진행 중인 프로젝트</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">5+</div>
            <div className="stat-text">사용 기술</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectTop;