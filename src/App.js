import MainPage from "./MainPage";
import "./App.css";
import Nav from "./Nav.js";
import { useState } from "react";

function App() {
    const [mode, setMode] = useState("Main"); // 페이지 선택
    let content = null;
    if(mode === "Main") {
        content = <MainPage/>
    }
    return (
        <div className="screen">
            <Nav />
            {content}
        </div>
    )
}

export default App;