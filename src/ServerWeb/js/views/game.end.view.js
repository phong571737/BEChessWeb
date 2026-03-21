/**This file is used to add animation when the game end */

export const GameEndView = {
    ResultOverlay({ winner, reason }) {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "absolute",
            inset: "0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "100",
            opacity: "0",
            transform: "scale(0.95)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            background: "rgba(0,0,0,0.45)",
            borderRadius: "8px",
        });

        // Icon
        const icon = document.createElement("div");

        if (winner === "White" || winner === "Black") {
            const img = document.createElement("img");
            img.src = winner === "White" 
                ? "/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/wK.png" 
                : "/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/bK.png";
            img.width = 64;
            img.height = 64;
            icon.appendChild(img);
        } else {
            icon.textContent = "1/2-1/2";
            icon.style.fontSize = "64px";
        }
        Object.assign(icon.style, {
            marginBottom: "12px",
            filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
        });

        // Winner text
        const title = document.createElement("p");
        title.textContent = winner ? `${winner} Wins!` : "Draw!";
        Object.assign(title.style, {
            color: "white",
            fontSize: "28px",
            fontWeight: "700",
            marginBottom: "6px",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        });

        // Reason
        const sub = document.createElement("p");
        sub.textContent = reason;
        Object.assign(sub.style, {
            color: "rgba(255,255,255,0.75)",
            fontSize: "14px",
            marginBottom: "20px",
        });

        // Countdown bar
        const barWrap = document.createElement("div");
        Object.assign(barWrap.style, {
            width: "120px",
            height: "4px",
            background: "rgba(255,255,255,0.2)",
            borderRadius: "999px",
            overflow: "hidden",
        });

        const bar = document.createElement("div");
        Object.assign(bar.style, {
            height: "100%",
            width: "100%",
            background: "white",
            borderRadius: "999px",
            transition: "width 3s linear",
        });

        barWrap.appendChild(bar);
        overlay.append(icon, title, sub, barWrap);

        // Start countdown bar animation
        requestAnimationFrame(() => {
            setTimeout(() => bar.style.width = "0%", 50);
        });

        return overlay;
    }
};