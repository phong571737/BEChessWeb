import { ViewManager } from "/ServerWeb/js/core/viewManager.js";

export const HomePage = {
    render(){
        ViewManager.hideAll();
        ViewManager.show("dashboard-view");
    },
}