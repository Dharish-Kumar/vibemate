// Toast message (bottom on the editor, top on the home page through app.css)
import { useCallback, useRef, useState } from "react";

export function useToast({ duration } = {}) {
    const [toast, setToast] = useState({ message: "", type: "", visible: false });
    const timer = useRef(0);
    const show = useCallback((message, type = "") => {
        setToast({ message: String(message), type, visible: true });
        clearTimeout(timer.current);
        // longer text stays longer (unless a fixed duration is given)
        const ms = duration || Math.min(12000, Math.max(3600, String(message).length * 55));
        timer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), ms);
    }, [duration]);
    return [toast, show];
}

export function Toast({ toast }) {
    return (
        <div className={`toast${toast.visible ? " is-visible" : ""}${toast.type ? " toast--" + toast.type : ""}`} role="status" aria-live="polite">
            {toast.message}
        </div>
    );
}
