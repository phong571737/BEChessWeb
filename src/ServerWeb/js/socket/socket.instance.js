let socket = null;

export function initSocket() {
    socket = io();
    return socket;
}

export function getSocket() {
    return socket;
}