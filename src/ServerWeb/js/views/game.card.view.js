export const GameCardView = {
    el(tag, className, text, id, title){
        const e = document.createElement(tag);
        if(className) e.className = className;
        if(text) e.textContent = text;
        if(id) e.id = id;
        if(title) e.title = title;
        return e;
    },

    BoardWrapper(GameID, player1, player2){
        /*div class='board-wrapper'*/
        const wrapper = this.el("div", "board-wrapper");
        // container board
        const container = this.el("div", "container-card-board bg-white");

        // round and remove game
        const top_board = this.el("div", "round-remove flex px-2.5 justify-center align-center", );
        const round = this.el("div", "font-mono text-sm text-gray-600", "Round 1");
        const remove = this.el("i", "fa-solid fa-xmark ml-auto cursor-pointer");
        top_board.append(round, remove);

        // mini board
        const boardchess = this.el("div", "game-card justify-center", "", `MiniBoard_${GameID}`);

        // bottom board 
        const bot_board = this.el("div", "flex px-2.5 justify-center align-center");
        const player_1 = this.el("div", "mx-1", `${player1}`);
        const versus = this.el("div", "", "vs");
        const player_2 = this.el("div", "mx-1", `${player2}`);
        bot_board.append(player_1, versus, player_2);

        container.append(top_board ,boardchess, bot_board);

        wrapper.append(container);
        return wrapper;
    },

    createCard(GameID, player1, player2){
        const card = this.el("div", "game-card-container justify-center");

        const boardwrapper = this.BoardWrapper(GameID, player1, player2);
        card.appendChild( boardwrapper);

        return card;
    },

    // This function is used to initialize empty state
    hideEmptyState(){
        const empty = document.getElementById('emptyState');
        if(empty) empty.style.display = 'none';
    },
}