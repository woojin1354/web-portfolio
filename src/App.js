import "./App.css";
import Nav from "./Nav.js";
import MainPage from "./MainPage";
import { Route, Routes } from "react-router-dom";
import ProjectPage from "./ProjectPage.js";

const navItems = [{title: 'Main', path:'/', page: <MainPage/>}, {title : 'Projects', path:'/projects', page: <ProjectPage/>}, {title : 'Contact', path:'/contact'}];

function App() {
    return (
            <div className="screen">
                <Nav navItems={navItems}/>
                <Routes>
                    {navItems.map((item) => (
                        <Route path={item.path} element={item.page}/>
                    ))}
                </Routes>
            </div>
            
        
    )
}

export default App;