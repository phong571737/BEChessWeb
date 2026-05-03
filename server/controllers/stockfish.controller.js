import { stockfishService } from "../services/stockfish.instance.js";

export async function getEval(req, res) {
    try {
        const fen = req.query.fen;

        const result = await stockfishService.evaluate(fen);
        res.json(result);
    } catch (err){
        res.status(500).json({error: err.message});
    }
}