/**This file is used to create a list of pieces 
 * for user choose a piece rather than queen default */

export const PromotionUI = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
        return e;
    },

    show(color, squareEls){
        return new Promise((resolve) => {
            const pieces = ["q", "r", "b", "n"]; 
            const labels = {q: "Queen", r: "Rook", b: "Bishop", n: "Knight"};

            const squares = Array.isArray(squareEls) ? squareEls: [squareEls];
            const containers = [];

            if(!squareEls.length || squareEls.every(s => !s)) {
                return resolve("q");
            }

            const cleanup = () => {
                containers.forEach(c => c.remove());
                squares.forEach(sq => {
                    if (!sq) return;
                    sq.style.position = "";
                    sq.style.zIndex = "";
                    sq.style.overflow = "";
                });
            }

            squares.forEach(squareEl => {
                // Get the square position
                squareEl.style.position = "relative";
                squareEl.style.zIndex = "50";
                squareEl.style.overflow = "visible";
    
                const container = this.el("div", "absolute z-50 bg-white border border-gray-200");

                container.style.left = "0";
                if( color === "w") {
                    container.style.top = "100%";
                }else {
                    container.style.bottom = "100%";
                    container.style.top = "auto";
                }
                container.style.minWidth = "100px";

                pieces.forEach(p =>{
                    const btn = this.el("button", "btn-select-promotion flex w-full items-center gap-2");
                    const img = document.createElement("img");
                    img.src = `/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/${color}${p}.png`;
                    img.width = 40;
                    img.height = 40;
    
                    const label = this.el("span", "text-sm text-gray-700", labels[p]);
    
                    btn.append(img, label);
                    btn.addEventListener("click", () => {
                        cleanup();
                        resolve(p);
                    });
    
                    container.append(btn);
                });
                squareEl.append(container);
                containers.push(container);
            });
        });
    },
}