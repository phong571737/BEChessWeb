"use client"

import { useEffect, useState } from "react";

/** Subscribe to a CSS media query. Returns false until mounted (SSR-safe). */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia(query);
        const update = () => setMatches(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [query]);

    return matches;
}
