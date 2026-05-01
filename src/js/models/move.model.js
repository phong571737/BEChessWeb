import { getDB } from "../config/database.js";

const moveGames = () => getDB().collection("moves");

export function getMoveCollections(){ return moveGames();}