export const PGNModalView = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
        return e;
    },

    TopModal(game, onclose){
        const top_modal = this.el("div", "flex justify-between p-5 items-start border-b");
        const player_and_date = this.el("div", "");

        // get name
        const playerText = `${game.White || "White"} vs ${game.Black || "Black"}`;
        const player = this.el("h2", "text-gray-900 text-xl", playerText, "player");

        // Get date
        const dateText = `${game.Date}` || "Unknown Date" ;
        const date = this.el("p", "text-gray-600 text-sm", dateText);
        player_and_date.append(player, date);

        const close_btn = this.el("button", "bg-transparent close-modal text-gray-200 text-2xl", "", "close-modal" );
        const close_icon = this.el("i", "fa-regular fa-circle-xmark ");
        close_btn.append(close_icon);
        close_btn.addEventListener("click", onclose);

        top_modal.append(player_and_date, close_btn);
        return top_modal;
    },

    ModalInformation(game){
        const main = this.el("div", "flex gap-5");
        const main_wrapper = this.el("div", "flex-1 space-y-3");
        const player = this.el("div", "space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3");

        // White player
        const whiteplayer = this.el("div", "flex items-center gap-2");
        const whitecircle = this.el("div", "rounded-full border-gray-400 border-2 w-4 h-4");
        const whitename = this.el("span", "text-gray-900 text-sm font-medium leading-none", `${game.White || "White"}`);
        whiteplayer.append(whitecircle, whitename);

        const border_bottom = this.el("div", "border-bot-player");

        // Black player 
        const blackplayer = this.el("div", "flex items-center gap-2");
        const blackcircle = this.el("div", "rounded-full border-gray-600 bg-gray-800 border-2 w-4 h-4");
        const blackname = this.el("span", "text-gray-900 text-sm font-medium leading-none", `${game.Black || "Black"}`);
        blackplayer.append(blackcircle, blackname);
        player.append(whiteplayer, border_bottom, blackplayer);

        // Time and number of move
        const time_move_win = this.el("div", "grid gap-2 grid-cols-2");
        // Times
        const times = this.el("div", "bg-gray-50 border border-gray-200 rounded-lg p-2.5");
        const time_title = this.el("div", "flex items-center gap-1.5 mb-1");
        const icon_time = this.el("i", "fa-regular fa-clock text-gray-600 text-xs");
        const t_time = this.el("div", "text-gray-600 text-xs", "Time Control");

        time_title.append(icon_time, t_time);
        
        const time_number = this.el("span", "text-gray-900 font-medium text-sm", "-", "times-match");
        times.append(time_title, time_number);

        // Moves
        const moves = this.el("div", "bg-gray-50 border border-gray-200 rounded-lg p-2.5");
        const move_title = this.el("div", "flex items-center gap-1.5 mb-1");
        const icon_moves = this.el("i", "fa-solid fa-hashtag text-gray-600 text-xs");
        const tmove = this.el("div", "text-gray-600 text-xs", "Moves");
        move_title.append(icon_moves, tmove);
        const move_number = this.el("span", "text-gray-900 font-medium text-sm", game.totalMoves || "-", "moves-total");
        moves.append(move_title, move_number);

        // Result
        const result_match = this.el("div", "bg-gray-50 border border-gray-200 rounded-lg p-2.5");
        const result_title = this.el("div", "flex items-center gap-1.5 mb-1");
        const icon_cup = this.el("i", "fa-solid fa-trophy text-gray-600 text-xs");
        const t_result = this.el("div", "text-gray-600 text-xs", "Result");
        result_title.append(icon_cup, t_result);
        const result = this.el("span", "text-gray-900 font-medium text-sm", game.Result, "result-match");
        result_match.append(result_title, result);

        // Event 
        const event_match = this.el("div", "bg-gray-50 border border-gray-200 rounded-lg p-2.5");
        const event_title = this.el("div", "flex items-center gap-1.5 mb-1");
        const icon_calendar = this.el("i", "fa-regular fa-calendar text-gray-600 text-xs");
        const e_title = this.el("div", "text-gray-600 text-xs", "Event");
        const event = this.el("span", "text-gray-900 font-medium text-sm", game.Event, "event-match");
        event_title.append(icon_calendar, e_title);
        event_match.append(event_title, event);

        time_move_win.append(times, moves, result_match, event_match);

        main_wrapper.append(player, time_move_win);
        main.append(main_wrapper);
        return main;
    },

    PGNNotation(game){
        const main_notation = this.el("div");
        const title_pgn = this.el("div", "flex items-center justify-between mb-2");
        const notation = this.el("h3", "text-gray-900 text-sm", "PGN Notation");
        const copy = this.el("button", "copy-btn flex items-center gap-1.5 text-xs text-gray-600 px-3 py-1.5 border border-gray-300 rounded-lg");
        const icon_copy = this.el("i", "fa-regular fa-copy");

        copy.append(icon_copy, "Copy PGN");
        title_pgn.append(notation, copy);

        // PGN area
        const fullpgnText = game.pgn || game.PGN;
        
        const movesOnlyPGN = fullpgnText.replace(/\[[^\]]+\]\s*/g, '').trim();
        const pgn_area = this.el("div", "bg-gray-50 border border-gray-200 text-gray-800 font-mono rounded-xl text-sm max-h-40 overflow-y-auto p-4 text-gray-800");
        pgn_area.textContent = movesOnlyPGN;

        copy.dataset.pgn = fullpgnText; //save pgn to copy button
    
        // Show full PGN 
        const show_full_PGN = this.el("details", "mt-2");
        const summary = this.el(
            "summary", 
            "summary-pgn text-gray-500 text-xs cursor-pointer font-medium", 
            "Show full PGN"
        );
        const content_pgn = this.el(
            "pre", 
            "content-pgn mt-2 bg-gray-50 border border-gray-200 rounded-xl font-mono overflow-y-auto text-xs p-4 whitespace-pre-wrap break-words"
        );
        content_pgn.textContent = fullpgnText;
        show_full_PGN.append(summary, content_pgn);
        main_notation.append(title_pgn, pgn_area, show_full_PGN);

        return main_notation;
    },

    BodyModal(game){
        const body_modal = this.el("div", "p-5 space-y-5");
        
        body_modal.append(this.ModalInformation(game), this.PGNNotation(game));

        return body_modal;
    },

    MainModal(game, onclose){
        console.log("modal called");
        const game_modal = this.el("div", "flex hidden fixed inset-0 items-center justify-center p-4", "", "game-modal");
        const bg_blur = this.el("div", "absolute inset-0 bg backdrop-blur-sm");
        const modal_bg = this.el("div", "relative border border-gray-200 bg-white overflow-y-auto max-w-2xl max-h-90vh rounded-2xl w-full");

        const top_modal = this.TopModal(game, onclose);
        const body_modal = this.BodyModal(game);
        modal_bg.append(top_modal, body_modal);
        game_modal.append(bg_blur, modal_bg);

        return game_modal;
    },
}