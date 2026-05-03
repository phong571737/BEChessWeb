/**This file is used to create a modal confirm 
 * when a button is pressed */

export const ModalView = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
        return e;
    },

    ResignModal({ onConfirmWhite, onConfirmBlack, onCancel} = {}){
        const modal_container = this.el("dialog", 
            "resign-dialog inset-0 fixed h-screen flex p-4 bg-transparent border-none w-full items-center justify-center");
        const modal = this.el("div", 
            "resign-modal bg-white p-8 rounded-xl relative shadow-2xl max-w-xl");
        
        // Close
        const closeBtn = this.el("button", "absolute bg-transparent cursor-pointer leading-none top-3 right-3");
        const icon = this.el("i", "fa-solid fa-x bg-transparent");
        closeBtn.appendChild(icon);

        // Heading
        const heading = this.el("h2", 
            "text-lg font-bold text-center mt-1 mb-6",
            "Are you sure you want to resign?");

        // Button row
        const btn_Row = this.el("div",
            "flex gap-3"
        )
        const btn_white = this.el("button", 
            "btn-white flex-1 bg-gray-100 text-black py-3 rounded-lg font-bold text-sm border border-gray-200 cursor-pointer text-gray-200", 
            "White Resign"
        )
        const btn_black = this.el("button", 
            "btn-black flex-1 py-3 rounded-lg bg-zinc-800 text-white font-bold text-sm border-none cursor-pointer text-gray-200 ", 
            "Black Resign"
        )

        btn_Row.append(btn_white, btn_black);
        modal.append(closeBtn, heading, btn_Row);

        modal_container.append(modal);
        return {
            modal_container,
            closeBtn,
            btn_white,
            btn_black
        };
    },

    // create a restart modal
    RestartModal({onConfirm, onCancel} = {}) {
        const modal_container = this.el("dialog", 
            "restart-dialog inset-0 fixed h-screen flex p-4 bg-transparent border-none w-full items-center justify-center");
        const modal = this.el("div", 
            "restart-modal bg-white p-8 rounded-xl relative shadow-2xl max-w-xl");

        // Heading
        const heading = this.el("h2", 
            "text-lg font-bold text-center mt-1 mb-6",
            "Are you sure you want to restart the game?");

        // Button row
        const btn_Row = this.el("div",
            "flex gap-3"
        )
        const abort = this.el("button", 
            "btn-abort flex-1 bg-gray-100 text-black py-3 rounded-lg font-bold text-sm border border-gray-200 cursor-pointer text-gray-200", 
            "Abort"
        )
        const confirm = this.el("button", 
            "btn-confirm flex-1 py-3 rounded-lg bg-zinc-800 text-white font-bold text-sm border-none cursor-pointer text-gray-200 ", 
            "Confirm"
        )

        btn_Row.append(abort, confirm);
        modal.append(heading, btn_Row);

        modal_container.append(modal);
        return {
            modal_container,
            confirm, 
            abort
        }
    },

    // Move line by line 
    LogRow(mv) {
        const row = this.el(
            "div",
            "grid grid-cols-[50px_80px_1fr_1fr_150px] p-2 border-gray-200 shadow-sm py-3"
        );

        row.append(
            this.el("div", "", mv.seq || ""),
            this.el("div", "truncate", mv.uci || ""),
            this.el("div", "truncate", (mv.lift || []).join(", ")),
            this.el("div", "truncate", (mv.place || []).join(", ")),
            this.el("div", "", new Date(mv.createdAt).toLocaleTimeString())
        );

        return row;
    },

    LogContent(game){
        const main = this.el("div", "flex gap-5");
        const main_wrapper = this.el("div", "flex-1");
        // top content
        const top = this.el("div", "grid grid-cols-[50px_80px_1fr_1fr_150px] py-2 font-mono text-gray-400 bg-gray-100 p-2 border border-gray-200 shadow-sm");
        const seq = this.el("div", "", "Seq");
        const uci = this.el("div", "", "UCI");
        const lift = this.el("div", "", "LIFT");
        const place = this.el("div", "", "PLACE");
        const date = this.el("div", "", "DATE")
        top.append(seq, uci, lift, place, date);

        const content = this.el("div", "content-log");

        // loop moves 
        (game.moves || []).forEach((mv) => {
            const row = this.LogRow(mv);
            content.appendChild(row);
        });

        main_wrapper.append(top, content);
        main.append(main_wrapper);
        return main;
    },

    // Log modal
    LogModal(data, onclose){
        console.log("log modal called");
        const log_modal = this.el("div", "log-modal-container flex hidden fixed inset-0 items-center justify-center p-4");
        const bg_blur = this.el("div", "absolute inset-0 bg backdrop-blur-sm");
        const modal_bg = this.el("div", "modal-log-content relative border border-gray-200 bg-white overflow-y-auto max-w-4xl max-h-90vh rounded-2xl w-full");

        // top modal
        const top_modal = this.el("div", "flex justify-between p-5 items-start");
        const close_btn = this.el("button", "bg-transparent close-modal text-gray-200 text-2xl", "", "close-modal" );
        const close_icon = this.el("i", "fa-regular fa-circle-xmark ");
        close_btn.append(close_icon);
        close_btn.addEventListener("click", onclose);
        top_modal.append(close_btn);

        // modal content
        const content = this.LogContent(data);

        modal_bg.append(top_modal, content);
        log_modal.append(bg_blur, modal_bg);

        return log_modal;
    },

    showRestartModal(options = {}) {
        const modal = this.RestartModal(options);
        document.body.append(modal.modal_container);
        modal.modal_container.showModal();
        return modal;
    },

    showResignModal(options = {}){
        const modal = this.ResignModal(options);
        document.body.appendChild(modal.modal_container);
        modal.modal_container.showModal();
        return modal;
    },
}