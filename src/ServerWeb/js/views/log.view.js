export const LogView = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
        return e;
    },

    MainContainer() {
        const main = this.el("div", "");
        main.append(
            this.el("div", "log-list space-y-2"),
        );

        return main;
    }
}