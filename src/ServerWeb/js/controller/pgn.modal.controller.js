import { PGNModalView } from "/app/src/ServerWeb/js/views/pgn.modal.view.js";

export const PGNModalController = {
    /**
     * Initial and display(mount) Modal PGN on screen
     * render content, also handle logic open and close
     */
    mount(game){
        if(document.querySelector('#game-modal')) return;

        const close = () => {
            document.querySelector("#game-modal")?.remove();
        };
    
        const modal = PGNModalView.MainModal(game, close);

        // Handle copy
        const copy_btn = modal.querySelector(".copy-btn");
        if (copy_btn) {
            copy_btn.addEventListener('click', async() => {
                try {
                    const copy_content = copy_btn.dataset.pgn;
                    
                    // Copy text inside the text field
                    await navigator.clipboard.writeText(copy_content);
                    
                    // convert animation to tick 
                    copy_btn.classList.replace("bg-blue-50", "bg-green-50");
                    copy_btn.classList.replace("text-blue-600", "text-green-600");
                    copy_btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
                    
                    // after 2s, rollback
                    setTimeout(() => {
                        copy_btn.classList.replace("bg-green-50", "bg-blue-50");
                        copy_btn.classList.replace("text-green-600", "text-blue-600");
                        copy_btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy PGN`;
                    }, 2000);
                } catch (err) {
                    console.error("among copy PGN, err:", err);
                }
            });
        };

        modal.addEventListener("click", (e) => {
            if (e.target.classList.contains("absolute") || e.target === modal) close();
        });
        document.getElementById("view-game-history").appendChild(modal);
    },

    /**
     * Listen click event all screen of list chess
     * query data and call mount to open modal
     */
    bind(view){
        view.addEventListener("click", (e) =>{
            const item = e.target.closest(".pgn-item");
            if (!item) return;

            // if click to trash, return
            if (e.target.closest(".remove-pgn")) return;

            const gamedata = item.dataset.game;

            if(gamedata) {
                try {
                    const game = JSON.parse(gamedata);
                    this.mount(game);
                }catch (err) {
                    console.error("Error parse game data", err);
                }
            }
        })
    },
}