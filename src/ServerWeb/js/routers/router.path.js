import { RouterURL } from "/ServerWeb/js/routers/router.url.js";
import { HomePage } from "/ServerWeb/js/pages/home.pages.js";
import { BoardPage } from "/ServerWeb/js/pages/board.page.js";
import { ViewManager } from "/ServerWeb/js/core/viewManager.js";


export const RouterPath = {
    navigationTo(url) {
        history.pushState(null, null, url);
        this.handle();
    },

    handle(){
        console.log("Current path:", window.location.pathname);
        const router = RouterURL(window.location.pathname);
        console.log("Router result:", router);

        switch(router.name){
            case "home":
                HomePage.render();
                break;

            case "board":
                console.log("Navigation to board",router.params.gameID);
                BoardPage.render(router.params.gameID);
                break;

            default:
                break;
        }
    },

    init() {
        const dashboard = document.getElementById("dashboard-view");
        if (dashboard) ViewManager.register("dashboard-view", dashboard);

        document.addEventListener("click", (e) => {
            const link = e.target.closest("a");
            if (link && link.href && link.origin === window.location.origin) {
                e.preventDefault(); // stop reload
                this.navigationTo(link.pathname);
            }
        });

        window.addEventListener("popstate", () => {
            this.handle();
        })

        this.handle();
    },

}