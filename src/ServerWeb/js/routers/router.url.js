import { IDUtils } from "../utils/id.utils.js";

export function RouterURL(path){
    if (path === "/") {
        return { name: "home"};
    }

    //navigation to board
    else if (path.startsWith("/board")) {
        // const gameID = path.split("/")[2];
        const params = new URLSearchParams(window.location.search);
        const hash = params.get("id");
        if (!hash) return {name: "notfound"};
        const gameID = IDUtils.decode(hash)
        return {name: "board", params: {gameID}};
    }
    else if (path.startsWith("/played")){
        return {name: "played"};
    }
    else if (path.startsWith("/log")) {
        return {name: "logviewer"};
    }

    return {name: "notfound"};
}
