export const PGNEditView = {
    PGNView(pgn){
        const wrapper = document.createElement("div");
        wrapper.className = "wrapper-pgn-edit";
        wrapper.id = "wrapper-pgn-edit";

        const pgn_text = document.createElement("textarea");
        pgn_text.className = "pgn-editor";
        pgn_text.id = "pgn-editor";
        pgn_text.value = pgn;

        const nav_btn = document.createElement("div");
        nav_btn.className = "btn-save-cancel";
        nav_btn.id = "btn-save-cancel"

        const save_btn = document.createElement("button");
        save_btn.className = "save-btn";
        save_btn.id = "save-btn";
        save_btn.textContent = "Lưu"

        const cancel_btn = document.createElement("button");
        cancel_btn.id = "cancel-btn";
        cancel_btn.className = "cancel-btn";
        cancel_btn.textContent = "Hủy";

        nav_btn.append(
            save_btn,
            cancel_btn,
        );

        wrapper.append(
            pgn_text,
            nav_btn
        );
        return wrapper;
    },
}