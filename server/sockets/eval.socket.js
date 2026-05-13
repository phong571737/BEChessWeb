import { stockfishService } from "../services/stockfish.instance.js";

const evalState = new Map(); // gameID -> { inFlight, queuedFen, lastFen }

function getState(gameID) {
  if (!evalState.has(gameID)) {
    evalState.set(gameID, { inFlight: false, queuedFen: null, lastFen: null });
  }
  return evalState.get(gameID);
}

async function runEval(io, gameID, fen) {
  const st = getState(gameID);
  if (!fen || fen === st.lastFen) return;
  if (st.inFlight) {
    st.queuedFen = fen;
    return;
  }

  st.inFlight = true;
  try {
    await stockfishService.evaluate(fen, (cp) => {
      io.to(gameID).emit("eval_update", { gameID, cp });
    });
    st.lastFen = fen;
  } catch (err) {
    console.error("[EvalSocket] evaluation error:", err);
  } finally {
    st.inFlight = false;
    const nextFen = st.queuedFen;
    st.queuedFen = null;
    if (nextFen && nextFen !== st.lastFen) {
      runEval(io, gameID, nextFen);
    }
  }
}

export function EvalSocket(io) {
  io.on("connection", (socket) => {
    socket.on("request_eval", ({ gameID, fen }) => {
      if (!gameID || !fen) return;
      runEval(io, gameID, fen);
    });
  });
}
