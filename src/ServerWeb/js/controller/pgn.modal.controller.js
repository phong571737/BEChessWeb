import { PGN_Modal } from "/ServerWeb/js/components/pgn.modal.js"

export const PGNModalController = {
    mount(){
        if(document.querySelector('#game-modal')) return;

        const close = () => {
            document.querySelector("#game-modal")?.remove();
        };
    
        const modal = PGN_Modal.MainModal(close);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) close();
        });
        document.getElementById("view-game-history").appendChild(modal);
    },

    bind(view){
        view.addEventListener("click", (e) =>{
            if(!e.target.closest(".pgn-item")) return;
            this.mount();
        })
    },
}