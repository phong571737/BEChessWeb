export const GameView = {
    createButton(classbtn, iconbtn, titlebtn){
        const btn = document.createElement('button');
        btn.className = `btn ${classbtn}`;
        btn.title = titlebtn;
        
        const icon_btn = document.createElement('i');
        icon_btn.className = iconbtn;

        btn.appendChild(icon_btn);
        return btn;
    },

    PGNTable(){
        const fragment = document.createDocumentFragment();

        /**PGN container */
        const pgn_table = document.createElement('div');
        pgn_table.className = 'pgn-table';

        /**the first user */
        const top_user = document.createElement('div');
        top_user.className = 'user-link online user user-top';

        const icon_top_user = document.createElement('i');
        icon_top_user.className = 'fa-solid fa-circle';
        top_user.appendChild(icon_top_user);

        /**Move list */
        const moves = document.createElement('div');
        moves.className = 'moves flex-nav';

        const nav_btn = document.createElement('div');
        nav_btn.className = 'nav-btn';

        const backward_fast_btn = this.createButton("backward-fast", "fa-solid fa-backward-fast", null);
        const backward_btn = this.createButton("backward", "fa-solid fa-backward-step", null);
        const forward_btn = this.createButton("forward", "fa-solid fa-forward-step", null);
        const forward_fast_btn = this.createButton("forward-fast", "fa-solid fa-forward-fast", null);
        const edit_btn = this.createButton("edit", "fa-solid fa-pen-to-square", "Chỉnh sửa");
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

        /**back and surrender button */
        const controls = document.createElement('div');
        controls.className = 'controls flex-nav';

        const control_icons = document.createElement('div');
        control_icons.className = 'control-icon';

        const back_btn = this.createButton("restart", "fa-solid fa-rotate-left", "Restart");
        const surrender_btn = this.createButton("surrender", "fa-regular fa-font-awesome", "Đầu hàng");
        control_icons.append(
            back_btn,
            surrender_btn
        );
        controls.appendChild(control_icons);

        /**the second user */
        const bottom_user = document.createElement('div');
        bottom_user.className = 'user-link online user user-bot';

        const icon_bottom_user = document.createElement('i');
        icon_bottom_user.className = 'fa-solid fa-circle';
        bottom_user.appendChild(icon_bottom_user);

        fragment.append(
            pgn_table,
            top_user,
            moves,
            controls,
            bottom_user,
        );

        return fragment;
    },

    MainContainer(GameID){
        const wrapper = document.createElement('div');
        wrapper.className = 'container-wrapper';
        wrapper.id = `view-game-${GameID}`;

        const main_wrapper = document.createElement('div');
        main_wrapper.className = 'main-board';

        const boardid = document.createElement('div');
        boardid.id = `Board_${GameID}`;
        boardid.className = 'myBoard';
        main_wrapper.appendChild(boardid);

        const pgn_table = this.PGNTable();
        wrapper.append(
            main_wrapper, 
            pgn_table
        );

        return wrapper;
    },
}