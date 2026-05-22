import { GAME_ACTIONS } from "@/lib/constants/game";
import { CLIENT_EVENT, SERVER_EVENT } from "@/lib/constants/socket";

export interface ClientToServerEvent {
    [CLIENT_EVENT.JOIN]: {gameID: string};
    [CLIENT_EVENT.REQUEST_CURRENT]: {gameID: string};
    [GAME_ACTIONS.RESIGN]: {gameID: string, resignSide: "white" | "black"};
    [GAME_ACTIONS.RESTART]: {gameID: string};
}

export interface ServerToClientEvent {
    [SERVER_EVENT.ESP_MOVE]: {gameID: string; lastMove: MoveData; fen: string; pgn?: string };
}

export type SocketEvents = ClientToServerEvent &ServerToClientEvent;

export interface MoveData {
    from: string;
    to: string;
    promotion?: string;
    uci?: string;
}