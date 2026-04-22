export class EventBus  {
    constructor() {
        this.event = Object.create(null);
    }

    on(eventName, cb) {
        if (!this.event[eventName]) {
            this.event[eventName] = [];
        }
        this.event[eventName].push(cb);
    }

    off(eventName, callback) {
        if (!this.event[eventName]) return;
        this.event[eventName] = this.event[eventName].filter(cb => cb != callback);
    }

    emit(eventName, payload) {
        if (!this.event[eventName]) return;
        this.event[eventName].forEach(cb => {
            try {
                cb(payload);
            } catch (e) {
                console.error(`[EventBus] ${eventName} error`, e);
            }
        });
    }
}