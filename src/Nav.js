import "./Nav.css";
import { NavLink } from "react-router-dom";

function Nav(props) {
    const navItems = props.navItems;
    return (
        <nav className="navigation">
            <div className="nav-container">
                {navItems.map((item) => (
                <NavLink
                    key={item.title}
                    to={item.path}
                    className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                    }
                >
                    {item.title}
                </NavLink>
                ))}
            </div>
        </nav>
    )
}

export default Nav;