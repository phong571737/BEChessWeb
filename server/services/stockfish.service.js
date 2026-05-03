import Stockfish from "stockfish";

export class StockfishService {
    constructor() {
        this.engine = null;
        this.busy = false;
        this.queue = [];
        this._currentJob = null;
        this._jobSeq = 0;
    }

    init() {
        this.engine = Stockfish("lite-single", () => {
            this.engine.sendCommand("uci");
            this.engine.sendCommand("isready");
        });

        this.engine.listener = (line) => {
            console.log("[ENGINE]:", line);

            // get score cp realtime
            if (line.includes("score cp")) {
                const match = line.match(/score cp (-?\d+)/); // get the number of negative interger or not
                if (match && this._currentJob?.active && this._currentJob?.onEval) {
                    this._currentJob.onEval(parseInt(match[1]));
                }
            }

            // get best move
            if (line.startsWith("bestmove")) {
                const move = line.split(" ")[1];

                if (this._currentJob?.active) {
                    this._currentJob.active = false;
                    this._currentJob.resolve({
                        bestMove: move === "(none)" ? null : move
                    });
                }
                this._currentJob = null;
                this.busy = false;
                this._processQueue();
            }
        };
    }

    // process queue
    _processQueue() {
        if (this.busy || this.queue.length === 0) return;
        this.busy = true;
        this._currentJob = this.queue.shift();
        if (!this._currentJob) {
            this.busy = false;
            return;
        }
        this.engine.sendCommand("ucinewgame");
        this.engine.sendCommand("position fen " + this._currentJob.fen);
        this.engine.sendCommand("go depth 15");
    }

    evaluate(fen, onEval, timeoutMs = 30_000) {
        return new Promise((resolve, reject) => {
            const jobId = ++this._jobSeq;
            const timer = setTimeout(() => {
                const timedOutJob = this._currentJob;
                if (timedOutJob && timedOutJob.id === jobId && timedOutJob.active) {
                    timedOutJob.active = false;
                    reject(new Error("Stockfish evaluation timed out"));
                    this._currentJob = null;
                    this.busy = false;
                    this.engine?.sendCommand("stop");
                    this._processQueue();
                }
            }, timeoutMs);

            this.queue.push({
                id: jobId,
                active: true,
                fen,
                onEval,
                resolve: (result) => { clearTimeout(timer); resolve(result); },
                reject:  (err)    => { clearTimeout(timer); reject(err); },
            });
            this._processQueue();
        });
    }
}
