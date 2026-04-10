import { RouterURL } from "/app/src/ServerWeb/js/routers/router.url.js";
import { HomePage } from "/app/src/ServerWeb/js/pages/home.pages.js";
import { BoardPage } from "/app/src/ServerWeb/js/pages/board.page.js";
import { ViewManager } from "/app/src/ServerWeb/js/core/viewManager.js";
import { GamePage } from "/app/src/ServerWeb/js/pages/played.page.js";


export const RouterPath = {
    currentController: null,

    navigationTo(url) {
        history.pushState(null, null, url);
        this.handle();
    },

    handle(){
        this.currentController?.destroy();
        this.currentController = null;

        const router = RouterURL(window.location.pathname);

        switch(router.name){
            case "home":
                HomePage.render();
                break;

            case "board":
                BoardPage.render(router.params.gameID).then(controller => {
                    this.currentController = controller;
                });
                break;

            case "played":
                GamePage.render();
                break;

            default:
                break;
        }
    },

    init() {
        const dashboard = document.getElementById("dashboard-view");
        if (dashboard) ViewManager.setView("dashboard-view", dashboard);

        document.addEventListener("click", (e) => {
            const link = e.target.closest("a");
            if (link && link.href && link.origin === window.location.origin) {
                e.preventDefault(); // stop reload
                this.navigationTo(link.pathname);
            }
        });

        //Forward navigation
        window.addEventListener("popstate", () => {
            this.handle();
        })

        this.handle();
    },

}