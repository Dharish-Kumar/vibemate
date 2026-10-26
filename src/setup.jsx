// =====================================================
// vibeMate 1.1 · setup.jsx
// Entry for setup.html: checks the login, then shows the Setup page (brand kits) inside the shared layout.
// =====================================================
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/style.css";
import "./styles/shell.css";
import "./styles/setup.css";
import AppShell from "./components/AppShell.jsx";
import SetupPage from "./setup/SetupPage.jsx";
import { requireUser } from "./lib/auth.js";

function SetupApp() {
    const [user, setUser] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => { requireUser().then(setUser).catch((err) => setError(err.message)); }, []);

    if (error) return <div className="shell-loading"><p className="msgbox">{error}</p></div>;
    if (!user) return <div className="shell-loading"><span className="loader__spinner" /></div>;
    return (
        <AppShell active="setup" user={user}>
            <SetupPage />
        </AppShell>
    );
}

createRoot(document.getElementById("root")).render(<StrictMode><SetupApp /></StrictMode>);
