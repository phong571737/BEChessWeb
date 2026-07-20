import { MoveLike } from "../types/chess.types.js";

export const games = new Map();
export const gameSeq = new Map();
export const activeBranches = new Map();
export const currentGameByBoard = new Map();
export const boardIDByGame = new Map<string, string>(); 
export const pendingNextTurn  = new Map();
export const rawMoveHistory = new Map<string, MoveLike[]>();
export const pgnBaseFen = new Map<string, string>();
