// =====================================================
// vibeMate 3.2 · history.jsx
// Entry for history.html: checks the login, then shows the History page inside the shared layout.
// =====================================================
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/style.css";
import "./styles/shell.css";
import AppShell from "./components/AppShell.jsx";
import HistoryPage from "./history/HistoryPage.jsx";
import { requireUser } from "./lib/auth.js";

function HistoryApp() {
    const [user, setUser] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => { requireUser().then(setUser).catch((err) => setError(err.message)); }, []);

    if (error) return <div className="shell-loading"><p className="msgbox">{error}</p></div>;
    if (!user) return <div className="shell-loading"><span className="loader__spinner" /></div>;
    return (
        <AppShell active="history" user={user}>
            <HistoryPage />
        </AppShell>
    );
}

createRoot(document.getElementById("root")).render(<StrictMode><HistoryApp /></StrictMode>);
