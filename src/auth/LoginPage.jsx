// Log in / Sign up (one page, two tabs)
import { useEffect, useState } from "react";
import { getMe, login, nextPage, signup } from "../lib/auth.js";

export default function LoginPage() {
    const [mode, setMode] = useState(new URLSearchParams(location.search).get("signup") ? "signup" : "login");
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [show, setShow] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const isSignup = mode === "signup";

    // Already logged in? Go straight in.
    useEffect(() => {
        getMe().then((u) => { if (u) location.replace(nextPage()); }).catch(() => {
            setError("Couldn't reach the vibeMate server. Is it running?");
        });
    }, []);

    const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setError(""); };

    async function submit(e) {
        e.preventDefault();
        if (busy) return;
        if (isSignup && !form.name.trim()) return setError("Please enter your name.");
        if (isSignup && form.password.length < 8) return setError("Use at least 8 characters for the password.");
        setBusy(true);
        setError("");
        try {
            if (isSignup) await signup(form.name.trim(), form.email.trim(), form.password);
            else await login(form.email.trim(), form.password);
            location.replace(nextPage());
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    function switchTo(next) {
        setMode(next);
        setError("");
        setForm((f) => ({ ...f, password: "" }));
    }

    return (
        <main className="auth">
            <div className="auth__card card">
                <a href="index.html" className="auth__brand">vibe<span>Mate</span></a>
                <h1 className="auth__title">{isSignup ? "Create your account" : "Welcome back"}</h1>
                <p className="auth__sub text-muted">{isSignup ? "Design banners and creatives with AI." : "Log in to continue to vibeMate."}</p>

                <div className="segmented auth__tabs" role="tablist">
                    <label><input type="radio" name="authmode" checked={!isSignup} onChange={() => switchTo("login")} /><span>Log in</span></label>
                    <label><input type="radio" name="authmode" checked={isSignup} onChange={() => switchTo("signup")} /><span>Sign up</span></label>
                </div>

                <form className="auth__form" onSubmit={submit} noValidate>
                    {isSignup && (
                        <div className="field">
                            <label className="field__label" htmlFor="name">Name</label>
                            <input className="input" id="name" autoComplete="name" maxLength={60} value={form.name} onChange={set("name")} autoFocus />
                        </div>
                    )}
                    <div className="field">
                        <label className="field__label" htmlFor="email">Email</label>
                        <input className="input" id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} autoFocus={!isSignup} />
                    </div>
                    <div className="field">
                        <div className="field__top">
                            <label className="field__label" htmlFor="password">Password</label>
                            <button type="button" className="auth__show" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
                        </div>
                        <input className="input" id="password" type={show ? "text" : "password"} maxLength={128}
                            autoComplete={isSignup ? "new-password" : "current-password"} value={form.password} onChange={set("password")} />
                        {isSignup && <small className="field__hint">At least 8 characters.</small>}
                    </div>

                    <p className="auth__error" role="alert">{error}</p>
                    <button type="submit" className={`btn btn--primary btn--block btn--lg${busy ? " is-busy" : ""}`} disabled={busy}>
                        {busy ? (isSignup ? "Creating account…" : "Logging in…") : isSignup ? "Create account" : "Log in"}
                    </button>
                </form>

                <p className="auth__switch text-muted">
                    {isSignup ? "Already have an account? " : "New to vibeMate? "}
                    <button type="button" onClick={() => switchTo(isSignup ? "login" : "signup")}>{isSignup ? "Log in" : "Create an account"}</button>
                </p>
            </div>
        </main>
    );
}
