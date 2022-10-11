export default class Template {
    constructor() {
        this.template = document.createElement('template');

        this.template.innerHTML = `
            <style>
                .shadowWrapper {
                    display: flex;
                    align-items: center;
                    height: 28px;
                }

                #selectAudioSource {
                    display: none;
                    float: right;
                    position: relative;
                    text-align: right;
                    cursor: pointer;
                }

                :host {
                    display: none;
                    position: relative;
                    float: right;
                    margin-right: 0;
                    margin-left: 12px;
                    z-index: 11;
                    -webkit-transform: translate3d(0,0,0);
                }

                :host([show]) {
                    display: table;
                    outline: none;
                }

                :host([show]) .btn {
                    display: block;
                }

                audio {
                    display: none;
                }

                .shadowWrapper.hidden {
                    display: none;
                }

                .btn {
                    display: none;
                    position: relative;
                    width: 28px;
                    height: 28px;
                    cursor: pointer;
                    border-radius: 50%;
                    background-color: rgba(0, 0, 0, 0.4);
                    background-image: url("/images/audio_muted.svg");
                    background-position: center;
                    background-repeat: no-repeat;
                    background-size: auto 18px;
                    box-sizing: border-box;
                }

                .btn.playing {
                    background-image: url("/images/audio_on.svg");
                }

                .btn.disabled {
                    display: block !important;
                    cursor: default !important;
                    opacity: 0.5;
                }

                .btn:hover:not(.disabled){
                    background-color: var(--primary-hover-icon-background-color-a05) !important;
                }
            </style>
                <div class="shadowWrapper" part="shadowWrapper">
                    <audio id="audioPlayer" controls style="display:none"></audio>
                    <div part="selectAudioSource" id="selectAudioSource">
                       <slot name="audioSource">
                            <select>
                              <option value="AllSources">All Sources</option>
                              <option value="Microphone">Microphone</option>
                              <option value="Speaker">Speaker</option>
                            </select>
                        </slot>
                    </div>
                    <div id="audioButton" part="audioButton" class="btn featureDisabled disabled"></div>
                </div>
        `;
    }

    get() {
        return this.template;
    }
}