export default class BaseElement extends HTMLElement {
    constructor(name) {
        super();
        this.status = 'created';
        this.name = name;
        this.addEventListener('i18n', this.i18n.bind(this));
    }

    i18n(event) {
        if (event.detail) {
            this.strings = event.detail;
        }
    }

    applyStrings() {
        setTimeout(() => {
            if (this.strings) {
                let i18nNodes = this.shadow.querySelectorAll('[data-translate]');
                for (let i = 0; i < i18nNodes.length; i++) {
                    let string = i18nNodes[i].getAttribute('data-translate');
                    if (this.strings[string]) {
                        if (i18nNodes[i].nodeName.toLowerCase() === 'slot') {
                            i18nNodes[i].assignedNodes()[0].innerHTML = this.strings[string];
                        } else {
                            i18nNodes[i].innerHTML = this.strings[string];
                        }
                    }
                }
            }
        }, 300);
    }

    setState(id, state) {
        this.dispatchEvent(new CustomEvent("setState", {
            bubbles: true,
            composed: true,
            detail: {
                id: id,
                state: state
            }
        }));
    }

    deleteState(id) {
        this.dispatchEvent(new CustomEvent("deleteState", {
            bubbles: true,
            composed: true,
            detail: { id: id }
        }));
    }

    getState(id, callback = () => { }) {
        this._onStateReceivedCallback = this.onStateReceived.bind(this, callback, id);
        this.addEventListener(id, this._onStateReceivedCallback);
        this.dispatchEvent(new CustomEvent("getState", {
            bubbles: true,
            composed: true,
            detail: { id: id }
        }));
    }

    onStateReceived(callback, id, e) {
        this.removeEventListener(id, this._onStateReceivedCallback);
        delete this._onStateReceivedCallback;
        callback && callback(e.detail);
    }

    connectedCallback() {
        if (this.status !== 'destroyed') {
            this.status = 'connected';
        }
        this.dispatchEvent(new CustomEvent("connected", { bubbles: true, composed: true, detail: { component: this.name } }));

        this.onConnect && this.onConnect();
    }

    disconnectedCallback() {
        this.onDisconnected && this.onDisconnected();
    }
}