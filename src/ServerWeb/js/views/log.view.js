export const LogView = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
        return e;
    },

    ItemLog(index = 1) {
        const item = this.el(
            "div",
            "log-item group-item flex bg-white gap-4 px-4 py-3.5 border border-gray-200 rounded-xl items-center cursor-pointer",
            "",
            "log-item"
        );

        const number = this.el("span", "item-number text-gray-400 text-sm text-center", `#${index}`);
        item.append(number);
        return item;
    },

    MainContainer() {
        const main = this.el("div", "main-log overflow-hidden py-end-8 px-6");
        main.append(
            this.el("div", "log-list space-y-2"),
        );

        return main;    
    }
}