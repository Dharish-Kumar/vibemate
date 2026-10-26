import { useCallback, useRef, useState } from "react";

// useState that also keeps the latest value in a ref, so async code (AI calls, voice, timers)
// always reads the current value instead of the one from an older render.
export function useStateRef(initial) {
    const [value, setValue] = useState(initial);
    const ref = useRef(value);
    const set = useCallback((next) => {
        const v = typeof next === "function" ? next(ref.current) : next;
        ref.current = v;
        setValue(v);
    }, []);
    return [value, set, ref];
}
