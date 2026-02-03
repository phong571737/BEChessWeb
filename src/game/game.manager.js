const {Chess} = require("chess.js");

const game = new Chess();

function makeMove(uci){
    const from = uci.slice(0, 2); // start
    const to = uci.slice(2, 4); // end

    const move = game.move({
      from, 
      to, 
      promotion: "q"
    })

    if(!move){
      throw new Error("Illegal move");
    }

    return {
      fen: game.fen(),
      pgn: game.pgn(),
      lastMove: {from, to, uci},
      turn: game.turn(),
    };
}

function loadPGN(pgn){
    game.loadPgn(pgn);
}

module.exports = {makeMove, loadPGN};