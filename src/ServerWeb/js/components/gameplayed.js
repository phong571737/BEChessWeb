export const GamePlayed = {
    el(tag, className, text, id){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        return e;
    },

    HeaderView(){
        const title_played = this.el("div", "title-played mb-8");

        const img = document.createElement("img");
        img.src = "/ServerWeb/img/chess.png";
        img.height = 50;
        img.width = 50;

        const htr_title = this.el("div", "history-title");
        const title = this.el("div", "title", "Game History");
        const played_number = this.el("div", "played-number", "0 game played");

        htr_title.append(title, played_number);
        title_played.append(img, htr_title);

        return title_played;
    },

    /**This function is used to procsess progress bar  */
    ProgressBar(){
        const performance_card = this.el("div", "performance-card");
        const perf_header = this.el("div", "perf-header mb-3 text-gray-600");
        const perf_title = this.el("span", "perf-title", "Performance breakdown");
        const total_game = this.el("span", "total-game", "total games", "total-game");

        //progress bar
        const progress_bar = this.el("div", "progress-bar rounded-full gap-05 mb-3", "", "progress-bar");
        const white = this.el("div", "white-win bg-green-500 round-l-full", "", "white-win");
        const draw = this.el("div", "bar-draw bg-gray-400", "", "bar-draw");
        const black = this.el("div", "black-win bg-red-500 round-r-full", "", "black-win");

        //comment
        const name = this.el("div", "flex gap-6");
        //White
        const white_title = this.el("div", "flex text-xs item-center text-gray-600 gap-2");
        const white_color = this.el("span", "w-2 h-2 rounded-full bg-green-500");
        white_title.append(white_color, "White");

        //Draw
        const draw_title = this.el("div", "flex text-xs item-center text-gray-600 gap-2");
        const draw_color = this.el("span", "w-2 h-2 rounded-full bg-gray-400");
        draw_title.append(draw_color, "Draw");

        //White
        const black_title = this.el("div", "flex text-xs item-center text-gray-600 gap-2");
        const black_color = this.el("span", "w-2 h-2 rounded-full bg-red-500");
        black_title.append(black_color, "Black");

        perf_header.append(perf_title, total_game);
        progress_bar.append(white, draw, black);
        name.append(white_title, draw_title, black_title);

        performance_card.append(perf_header, progress_bar, name);
        return performance_card;
    },

    /**This function is used to create card bar(statistical table) */
    CardBar(){
        const cardbar = this.el("div", "grid grid-cols-3 gap-4 mb-8");
        //White card
        const whitecard = this.el("div", "bg-white border round-xl shadow-sm p-4");
        const whitetitle = this.el("div", "flex item-center gap-2 mb-2");
        const whiteicon = document.createElement("div");
        const w_icon = document.createElement("i");
        w_icon.className = "fa-solid fa-crown text-green-600"
        whiteicon.appendChild(w_icon);
        const whitename = this.el("span", "text-gray-600 text-xs font-medium text-font", "White");
        whitetitle.append(whiteicon, whitename);
        const w_number = this.el("p", "text-2xl text-green-600 font-bold mb-2", "0");
        const w_won = this.el("p", "text-gray-600 text-xs", "Games won");
        whitecard.append(whitetitle, w_number, w_won);

        //Black card
        const blackcard = this.el("div", "bg-white border round-xl shadow-sm p-4");
        const blacktitle = this.el("div", "flex item-center gap-2 mb-2");
        const blackicon = document.createElement("div");
        const b_icon = document.createElement("i");
        b_icon.className = "fa-solid fa-crown text-red-500"
        blackicon.appendChild(b_icon);
        const blackname = this.el("span", "text-gray-600 text-xs font-medium text-font", "Black");
        blacktitle.append(blackicon, blackname);
        const b_number = this.el("p", "text-2xl text-red-500 font-bold mb-2", "0");
        const b_won = this.el("p", "text-gray-600 text-xs", "Games won");
        blackcard.append(blacktitle, b_number, b_won);

        //Draw card
        const drawcard = this.el("div", "bg-white border round-xl shadow-sm p-4");
        const drawtitle = this.el("div", "flex item-center gap-2 mb-2");
        const drawicon = document.createElement("div");
        const d_icon = document.createElement("i");
        d_icon.className = "fa-solid fa-minus text-gray-400"
        drawicon.appendChild(d_icon);
        const drawname = this.el("span", "text-gray-600 text-xs font-medium text-font", "Draws");
        drawtitle.append(drawicon, drawname);
        const d_number = this.el("p", "text-2xl text-gray-400 font-bold mb-2", "0");
        const d_won = this.el("p", "text-gray-600 text-xs", "Games drawn");
        drawcard.append(drawtitle, d_number, d_won);

        cardbar.append(whitecard, blackcard, drawcard);
        return cardbar;
    },

    MainPlayed(){
        const played_view = this.el("div", "main-played");
        const title = this.HeaderView();
        const progressbar = this.ProgressBar();
        const cardbar = this.CardBar();
        played_view.append(
            title,
            cardbar,
            progressbar
        );
        return played_view;
    }
}