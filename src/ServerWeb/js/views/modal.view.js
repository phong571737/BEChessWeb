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

    showResignModal(options = {}){
        const modal = this.ResignModal(options);
        document.body.appendChild(modal.modal_container);
        modal.modal_container.showModal();
        return modal;
    },
}