import { LogController } from "../controller/log.controller.js";
import { ViewManager } from "../core/view.manager.js";
import { LogView } from "../views/log.view.js";

export const LogPage = {
    render() {
        const viewID = "view-game-log";
        ViewManager.hideAll();
        const main_wrapper = document.getElementById("main-wrapper");

        let view = ViewManager.get(viewID);
        if (!view) {
            view = LogView.MainContainer();
            view.id = viewID;
            main_wrapper.append(view); 
            ViewManager.setView(viewID, view);
        }
        ViewManager.show(viewID);

        LogController.init(view);
    }
}