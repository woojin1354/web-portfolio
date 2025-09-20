import "./MainPage.css";
import Git_logo from "./assets/icons/Git.svg"
import Tistory_logo from "./assets/icons/Tistory.svg"
import Profile_image from "./assets/images/ProfileImage.png"



const socialLinks = [
  { alt: "Git logo", src: Git_logo, link: "https://github.com/woojin1354"},
  { alt: "Tistory logo", src: Tistory_logo, link: "https://woojin1354.tistory.com/"}
];

const aboutData = [
  { icon: "🎓", title: "학력", content: "부경대학교 정보통신공학과", detail: "3학년 재학 중" },
  { 
    icon: "💼", 
    title: "경력", 
    experiences: [
      { name: "IM4U 영재 교육원 동래점", period: "22.04. ~ 現" },
      { name: "KAGE 영재교육원 남구점", period: "25.05. ~ 25.08." }
    ]
  }
];

const skillLevel = ["Beginner", "Intermediate", "Advanced", "Expert"]; // 만약 단계 이름 바꾸면, css에서도 클래스 이름 수정해야됨

const skillsData = [
  { category: "Languages", skills: [
    { name: "Python", level: skillLevel[3] },
    { name: "C/C++", level: skillLevel[2] },
    { name: "JavaScript", level: skillLevel[1] }
  ]},
  { category: "Frameworks", skills: [
    { name: "React", level: skillLevel[1] },
    { name: "Spring", level: skillLevel[0] }
  ]},
  { category: "Database", skills: [
    { name: "MySQL", level: skillLevel[1] },
    { name: "PostgreSQL", level: skillLevel[0] }
  ]},
  { category: "Other", skills: [
    { name: "Algorithm", level: skillLevel[2] }
  ]}
];

function MainPage() {
  return (
    <main className="main-content">
      <section className="hero-section">
        <div className="hero-content">
          <div className="profile-section">
            <img
              className="profile-image"
              alt="Profile"
              src={Profile_image}
            />
            <div className="hero-text">
              <h1 className="greeting">안녕하세요!</h1>
              <p className="introduction">
                학원 강사이자 개발자 <span className="name">김우진</span>입니다.
              </p>
              <div className="social-links">
                {socialLinks.map((link) => (
                  <a key={link.alt} href={link.link} className="social-link">
                    <img alt={link.alt} src={link.src} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="section-header">
          <h2>About</h2>
        </div>
        <div className="about-grid">
          {aboutData.map((item) => (
            <div key={item.title} className="about-card">
              <div className="card-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              {item.content ? (
                <>
                  <p>{item.content}</p>
                  <span className="detail">{item.detail}</span>
                </>
              ) : (
                <div className="experience-list">
                  {item.experiences.map((exp) => (
                    <div key={exp.name} className="experience-item">
                      <p>{exp.name}</p>
                      <span className="period">{exp.period}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="skills-section">
        <div className="section-header">
          <h2>Tech Stack</h2>
        </div>
        <div className="skills-grid">
          {skillsData.map((category) => (
            <div key={category.category} className="skill-category">
              <h3>{category.category}</h3>
              <div className="skill-tags">
                {category.skills.map((skill) => (
                  <span key={skill.name} className={`skill-tag ${skill.level}`}>
                    <span className="front">{skill.name}</span>
                    <span className="back">{skill.level}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};


export default MainPage;