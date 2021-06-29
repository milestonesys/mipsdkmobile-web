export default class Template {
    constructor(name) {
        this.template = document.createElement('template');
        this.template.innerHTML = `
            <style>
                .camera {
                    width: 100%;
                    height: 100%;
                }
                .player {
                    width: 100%;
                    height: 100%;
                }
            </style>
            <div class="shadowWrapper">
                <div class="camera">
                    <h4>${name}</h4>
                    <video class="player" part="video-player"></video>
                </div>
            </div>
        `;
    }

    get() {
        return this.template;
    }
}