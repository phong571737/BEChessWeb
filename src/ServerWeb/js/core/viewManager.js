//cache variables 
const viewCache = {};

export const ViewManager = {
    get(id){
        return viewCache[id];
    },

    setView(id, element){
        viewCache[id] = element;
    },

    hideAll() {
        Object.values(viewCache).forEach(view => {
            if (view) view.style.display = "none";
        });
    },

    show(id){
        if(viewCache[id]){
            viewCache[id].style.display = 'grid';
        }
    }
}