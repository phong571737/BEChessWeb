export function RouterURL(path){
    if (path === "/") {
        return { name: "home"};
    }

    //navigation to board
    else if (path.startsWith("/board/")) {
        const gameID = path.split("/")[2];
        // const gameID = fullID.replace(/^Board_/i, "");
        console.log("Navigation to gameid: ", gameID);
        return {name: "board", params: {gameID}};
    }

    return {name: "notfound"};
}
