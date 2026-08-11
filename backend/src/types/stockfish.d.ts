declare module "stockfish" {
    interface StockfishEngine {
        listener?: (line: string) => void;
        sendCommand(command: string): void;
    }

    export default function initStockfish(path?: string): Promise<StockfishEngine>;
}
