/**This file is used to create view for board 
 * include in : pgn table, evaluation bar, board */

export const GameView = {
    createButton(classbtn, iconbtn, titlebtn) {
        const btn = document.createElement('button');
        btn.className = `btn ${classbtn}`;
        btn.title = titlebtn;

        const icon_btn = document.createElement('i');
        icon_btn.className = iconbtn;

        btn.appendChild(icon_btn);
        return btn;
    },

    el(tag, className, text, id, title) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text) e.textContent = text;
        if (id) e.id = id;
        if (title) e.title = title;
        return e;
    },

    PGNTable() {
        const fragment = document.createDocumentFragment();

        // PGN container 
        const pgn_table = this.el("div", "pgn-table", "", "pgn-table");

        // Notify state of board
        const notify = this.el(
            "div",
            "notify-state flex items-center border-pgn p-2.5 font-bold justify-center"
        );

        const notify_text = this.el("span", "notify-text", "Wait for board connection");
        notify.append(notify_text);

        //black captured
        const black_cap = this.el("div", "black-captured", "", "black-captured");
        const black_piece = this.el("div", "black-piece", "", "black-piece");
        const black_diff = this.el("div", "black-diff", "", "black-diff");

        black_cap.append(black_piece, black_diff);

        // Move list
        const moves = this.el("div", "moves flex-nav", "", "moves");
        const nav_btn = this.el("div", "nav-btn");

        const backward_fast_btn = this.createButton("backward-fast", "fa-solid fa-angles-left", "backward");
        const backward_btn = this.createButton("backward", "fa-solid fa-chevron-left", "back");
        const forward_btn = this.createButton("forward", "fa-solid fa-chevron-right", "next");
        const forward_fast_btn = this.createButton("forward-fast", "fa-solid fa-angles-right", "forward");
        const edit_btn = this.createButton("edit", "fa-solid fa-pen-to-square", "Edit");

        nav_btn.append(
            backward_fast_btn,
            backward_btn,
            forward_btn,
            forward_fast_btn,
            edit_btn
        );

        const move_list = document.createElement('div');
        move_list.className = 'move-list';
        move_list.id = 'move-list';
        moves.appendChild(nav_btn);
        moves.appendChild(move_list);

        // restart and surrender button
        const controls = this.el("div", "controls flex-nav");
        const control_icons = this.el("div", "control-icon");

        const back_btn = this.createButton("restart", "fa-solid fa-rotate-left", "Restart");
        const surrender_btn = this.createButton("surrender", "fa-regular fa-font-awesome", "Đầu hàng");

        control_icons.append(back_btn, surrender_btn);
        controls.appendChild(control_icons);

        //white captured
        const white_cap = this.el("div", "white-captured", "", "white-captured");
        const white_piece = this.el("div", "white-piece", "", "white-piece");
        const white_diff = this.el("div", "white-diff", "", "white-diff");

        white_cap.append(white_piece, white_diff);

        fragment.append( notify, black_cap, moves, controls, white_cap);
            // pgn_table,

        return fragment;
    },

    setNotify(text, type = 'default', gameID = null) {
        const scope = gameID
            ? document.getElementById(`view-game-${gameID}`)
            : document;

        if (!scope) return;

        const notify = scope.querySelector('.notify-state');
        const notify_text = scope.querySelector('.notify-text');

        if (!notify || !notify_text) return;

        // reset class
        notify.classList.remove('notify-ready', 'notify-waiting', 'notify-checkinit');
        notify.classList.add(`notify-${type}`);
        notify_text.textContent = text;
    },

    // create evaluate bar
    EvaluateBar(gameID) {
        const mainbar = this.el("div", "main-eval-bar h-full flex border flex-col w-7 relative");
        const val_black = this.el("div", "eval-black bg-gray-400 absolute");
        const val_white = this.el("div", "eval-white bg-white absolute");

        const text_black = this.el("div", "number-black-eval flex font-mono text-xs mt-1 justify-center absolute left-0 right-0", "+1.0");
        val_black.append(text_black);

        const text_white = this.el("div", "number-white-eval flex font-mono text-xs mb-1 bottom-0 justify-center absolute left-0 right-0", "+1.0");
        val_white.append(text_white);

        mainbar.append(val_black, val_white);
        return mainbar;
    },

    MainContainer(GameID) {
        const wrapper = this.el("div", "container-wrapper overflow-hidden", "", `view-game-${GameID}`);

        const main_wrapper = this.el("div", "main-board");
        const boardid = this.el("div", "myBoard", "", `Board_${GameID}`);

        // the first user
        const top_player = this.el("div", "user-link online user top-player");
        const icon_top_user = this.el("i", "top-icon fa-solid fa-circle", "");
        const black_name = this.el("span", "black-name ml-2.5", "Black Player", "black-name");

        top_player.append(
            icon_top_user,
            black_name
        );

        // the second user
        const bottom_player = this.el("div", "user-link online user bot-player");
        // bottom_player.id = 'bot-player';

        const icon_bottom_user = this.el("i", "bot-icon fa-solid fa-circle", "");
        const white_name = this.el("span", "white-name ml-2.5", "White Player", "white-name");
        bottom_player.append(icon_bottom_user, white_name);

        const evalbar = this.EvaluateBar(GameID);
        main_wrapper.append(boardid);

        const pgn_table = this.PGNTable();
        wrapper.append(
            main_wrapper,
            top_player,
            bottom_player,
            pgn_table,
            evalbar
        );

        return wrapper;
    },
}