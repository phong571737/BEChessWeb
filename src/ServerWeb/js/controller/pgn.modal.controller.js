import { PGNModalView } from "/ServerWeb/js/views/pgn.modal.view.js";

export const PGNModalController = {
    mount(){
        if(document.querySelector('#game-modal')) return;

        const close = () => {
            document.querySelector("#game-modal")?.remove();
        };
    
        const modal = PGNModalView.MainModal(close);
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