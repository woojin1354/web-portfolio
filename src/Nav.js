import "./Nav.css";

function Nav() {
    const navItems = ['Main', 'Projects', 'Contact'];
    return (
        <nav className="navigation">
            <div className="nav-container">
            {navItems.map((item, index) => (
                <div key={item} className={`nav-item ${index === 0 ? 'active' : ''}`}>
                {item}
                </div>
            ))}
            </div>
        </nav>
    )
}

export default Nav;