export const GameCardView = {
    BoardWrapper(GameID){
        /*div class='board-wrapper'*/
        const wrapper = document.createElement('div');
        wrapper.className = 'board-wrapper'; 

        /**div class='game-card' id='game-card' */
        const boardchess = document.createElement('div');
        boardchess.className = 'game-card';
        boardchess.id = `MiniBoard_${GameID}`;  

        wrapper.appendChild(boardchess);
        return wrapper;
    },

    createCard(GameID){
        const card = document.createElement('div');
        card.className = 'game-card';

        const boardwrapper = this.BoardWrapper(GameID);
        card.appendChild( boardwrapper);

        return card;
    },

    // This function is used to initialize empty state
    hideEmptyState(){
        const empty = document.getElementById('emptyState');
        if(empty) empty.style.display = 'none';
    },
}