export const GamePlayed = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
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
        const performance_card = this.el("div", "performance-card mb-8");
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
        const white_title = this.el("div", "flex text-xs items-center text-gray-600 gap-2");
        const white_color = this.el("span", "w-2 h-2 rounded-full bg-green-500");
        white_title.append(white_color, "White");

        //Draw
        const draw_title = this.el("div", "flex text-xs items-center text-gray-600 gap-2");
        const draw_color = this.el("span", "w-2 h-2 rounded-full bg-gray-400");
        draw_title.append(draw_color, "Draw");

        //White
        const black_title = this.el("div", "flex text-xs items-center text-gray-600 gap-2");
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
        const whitetitle = this.el("div", "flex items-center gap-2 mb-2");
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
        const blacktitle = this.el("div", "flex items-center gap-2 mb-2");
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
        const drawtitle = this.el("div", "flex items-center gap-2 mb-2");
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

    /**This function is used to create search bar */
    SearchBar(){
        const main = this.el("div", "flex mb-4 gap-3");
        const search = this.el("div", "flex-1 relative");
        
        //icon search
        const search_icon = this.el("div", "w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400");
        const icon = this.el("i", "fa-solid fa-magnifying-glass");
        search_icon.appendChild(icon);

        //input search
        const input_search = document.createElement("input");
        input_search.id = "search-input";
        input_search.type = "text";
        input_search.placeholder = "Search...";
        input_search.className = "bg-white border border-gray-300 w-full text-sm text-gray-900 py-2.5 rounded-lg pl-9";

        //selection
        const select_color = this.el("div", "flex border border-gray-300 bg-white rounded-lg overflow-hidden");
        const all_select = document.createElement("button");
        all_select.textContent = "All Colors";
        all_select.className = "px-4 text-xs font-medium bg-blue-600 text-white";

        const white_select = document.createElement("button");
        white_select.className = "px-4 text-xs font-medium text-gray-600 bg-transparent";
        const white_square = document.createElement("i");
        white_square.className = "fa-regular fa-square";
        white_select.append(white_square, "White");

        const black_select = document.createElement("button");
        black_select.className = "px-4 text-xs font-medium text-gray-600 bg-transparent";
        const black_square = document.createElement("i");
        black_square.className = "fa-solid fa-square";
        black_select.append(black_square, "Black");

        //option 
        const sorting_option = this.el("div", "relative");
        const icon_selection = this.el("div", "absolute w-4 h-4 left-3 top-1/2 -translate-y-1/2 text-gray-400");
        const icon_slider = this.el("i", "fa-solid fa-sliders");
        icon_selection.appendChild(icon_slider);

        const select_option = this.el("select", "bg-white border border-gray-300 border-none rounded-lg py-2.5 text-sm text-gray-900 pl-9 pr-8 cursor-pointer appearance-none");
        select_option.id = "select-option";

        const newest = document.createElement("option");
        newest.value = "dates";
        newest.textContent = "Newest First";

        const mostmove = document.createElement("option");
        mostmove.value = "moves";
        mostmove.textContent = "Most Moves";
        select_option.append(newest, mostmove);
        
        search.append(search_icon, input_search);
        select_color.append(all_select, white_select, black_select);
        sorting_option.append(icon_selection, select_option);

        main.append(search, select_color, sorting_option);
        return main;
    },

    ChipSelection(){
        const main_chip = this.el("div", "flex gap-2 mb-5");
        const all_btn = this.el("button", "px-4 py-1.5 bg-blue-600 rounded-lg text-sm border font-medium text-white", "All");
        const win_btn = this.el("button", "px-4 py-1.5 bg-white rounded-lg text-sm border font-medium text-gray-600", "Wins");
        const loss_btn = this.el("button", "px-4 py-1.5 bg-white rounded-lg text-sm border font-medium text-gray-600", "Losses");
        const draw_btn = this.el("button", "px-4 py-1.5 bg-white rounded-lg text-sm border font-medium text-gray-600", "Draws");
        const total_game = this.el("span", "ml-auto px-4 py-1.5 text-sm font-medium text-gray-600", "0 game");
        
        main_chip.append(all_btn, win_btn, loss_btn, draw_btn, total_game);
        return main_chip;
    },

    ItemGame(){
        const list_item = this.el("div");
        const item = this.el("div", 
            "group-item flex bg-white gap-4 px-4 py-3.5 border border-gray-200 rounded-xl items-center cursor-pointer"
        );
        const number = this.el("span", "text-gray-400 text-sm text-center", "#1");
        const chip = this.el("span", 
            "rounded-full text-center text-xs font-medium border border-green-300 bg-green-100 px-3 py-1", 
            "Win"
        )
        const win_color = this.el("div");
        const circuit = this.el("div", "rounded-full w-5 h-5 bg-gray-800 border-gray-600","", "", "Black win");
        win_color.appendChild(circuit);

        item.append(number, chip, win_color);

        list_item.append(item);
        return list_item;
    },

    MainPlayed(){
        const played_view = this.el("div", "main-played");
        const title = this.HeaderView();
        const progressbar = this.ProgressBar();
        const cardbar = this.CardBar();
        const searchbar = this.SearchBar();
        const chipselection = this.ChipSelection();
        const itemgame = this.ItemGame();
        played_view.append(
            title,
            cardbar,
            progressbar,
            searchbar,
            chipselection,
            itemgame
        );
        return played_view;
    }
}