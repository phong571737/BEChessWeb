export function RouterURL(path){
    if (path === "/") {
        return { name: "home"};
    }

    //navigation to board
    else if (path.startsWith("/board/")) {
        const gameID = path.split("/")[2];
        // const gameID = fullID.replace(/^Board_/i, "");
        return {name: "board", params: {gameID}};
    }
    else if (path.startsWith("/played")){
        return {name: "played"};
    }

    return {name: "notfound"};
}
