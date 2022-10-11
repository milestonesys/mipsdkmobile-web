import BaseElement from './base.js';
import Template from './js/template.js';
import AudioControllerWebAudioAPI from './js/lib/AudioControllerWebAudioAPI.js';
import AudioControllerStandart from './js/lib/AudioControllerStandart.js';

const AudioCompressionLevel = 99;
const AudioCompressionLevelAudioAPI = 41;
const name = 'audios-stream';

class AudioStream extends BaseElement {
    static get observedAttributes() {
        return ['source', 'disabled'];
    }
    constructor() {
        super(name);
        this.shadow = this.attachShadow({ mode: 'open' });

        this.params = this.state = {};
        this.addEventListener('destroy', this.destroy.bind(this));
        this.addEventListener('start', this.onStart.bind(this));
        this.addEventListener('stop', this.onStop.bind(this));

        this.addEventListener('onNetworkError', this.onNetworkError.bind(this));
        this.addEventListener('switchToPlayback', this.onSwitchToPlayback.bind(this));
        this.addEventListener('switchToLive', this.onSwitchToLive.bind(this));
        this.addEventListener('setAudioStreamOption', this.onSetAudioStreamOption.bind(this));
        this.addEventListener('setContinueToPlay', this.setContinueToPlay.bind(this));
        this.addEventListener('focusCamera', this.onFocusCamera.bind(this));

        this.addEventListener('mouseover', this.showAudioSelectLabel.bind(this));
        this.addEventListener('mouseleave', this.hideAudioSelectLabel.bind(this));

        this.addEventListener('deleteAudioState', this.deleteAudioState.bind(this));
        this.playbackControllerId = null;
    }

    get active() {
        return this.audioController && this.audioController.audioActive;
    }

    get title() {
        return this.audioButtonElement.getAttribute('title');
    }

    set title(value) {

        this.audioButtonElement = this.shadow.getElementById('audioButton');

        if (value) {
            if (this.audioButtonElement) {
                this.audioButtonElement.title = value;
            }
        } else {
            this.audioButtonElement.removeAttribute('title');
        }
    }

    get disabled() {
        return this.hasAttribute('disabled');
    }

    set disabled(value) {
        if (value) {
            this.setAttribute('disabled', '');
        } else {
            this.removeAttribute('disabled');
        }

        this.audioController && this.audioController.setDisabled(value);
    }

    get source() {
        return this.getAttribute('source');
    }

    set source(value) {
        if (value) {
            this.setAttribute('source', value);
        }
        else {
            this.removeAttribute('source');
        }
    }

    get show() {
        return this.hasAttribute('show');
    }

    set show(value) {
        if (value) {
            this.setAttribute('show', '');
        } else {
            this.removeAttribute('show');
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const hasValue = newValue !== null;
        switch (name) {
            case 'disabled':
                this.setAttribute('aria-disabled', hasValue);

                if (hasValue) {
                    this.removeAttribute('tabindex');
                    this.blur(); // todo test
                } else {
                    this.setAttribute('tabindex', '0');
                }
                break;
            case 'source':
                if (oldValue !== newValue) {
                    this.source = newValue;
                }
            default:
                if (oldValue == "" && newValue === null) {
                    this[name] = false;
                } else if (oldValue == null && newValue === "") {
                    this[name] = true;
                }
                break;
        }
    }

    connectedCallback() {
        if (this.status == "connected") {
            return;
        }

        this._upgradeProperty('show');
        this._upgradeProperty('disabled');
        this._upgradeProperty('title');
        this._upgradeProperty('source');

        this.status = "connected";
    };

    _upgradeProperty(prop) {
        if (this.hasAttribute(prop)) {
            let value = this[prop];
            delete this[prop];
            this[prop] = value;
        }
    }

    onSlotChange() {
        this._setAudioSourceDropDown();
        this.dispatchEvent(new CustomEvent("slotChanged", { bubbles: true, composed: true, detail: { component: this.name } }));
    }

    _setAudioSourceDropDown() {

        this.audioSourceDropDown = this.querySelector('dropdown-menu');

        if (!this.audioSourceDropDown) {
            this.audioSourceDropDown = this._optionSlot.querySelector('select');
        }
    }

    showAudioSelectLabel(event) {
        if (this.audioSourceDropDown) {
            this.audioSourceDropDown.label = true;
        }

    }

    hideAudioSelectLabel(event) {
        if (this.audioSourceDropDown && !this.sourceLabel) {
            this.audioSourceDropDown.label = false;
        }
    }

    startAudioStream(event) {
        const template = new Template(this.name).get();
        this.shadow.appendChild(template.content.cloneNode(true));

        this.audioButtonElement = this.shadow.getElementById('audioButton');
        this._optionSlot = this.shadow.querySelector('slot');

        if (this._optionSlot) {
            this._optionSlot.addEventListener('slotchange', this.onSlotChange.bind(this));
        }

        this._setAudioSourceDropDown();

        this.applyStrings();

        this.params = event.detail || this.params;

        if (this.playbackControllerId) {
            this.params['playbackControllerId'] = this.playbackControllerId;
        }

        this.stateId = name;

        this.params.AudioCompressionLevel = AudioCompressionLevel;
        this.params.audioButtonElement = this.shadow.getElementById('audioButton');

        this.params.isVisible = () => { return this.show; };

        this.params.onStart = () => {
            this.setState(this.stateId, { id: this.params.cameraId, state: 'started', live: this.audioController.isLive, source: this.audioController.audioSource });
        };
        this.params.onStop = () => {
            this.deleteState(this.stateId);
        };
        this.params.onPlayingCallback = () => {
            this.dispatchEvent(new CustomEvent("onAudioPlaying", { bubbles: true, composed: true, detail: { component: name } }));
        };
        this.params.onStalledCallback = () => {
            this.dispatchEvent(new CustomEvent("onAudioStalled", { bubbles: true, composed: true, detail: { component: name } }));
        };
        this.params.onButtonStateChanged = () => {
            this.dispatchEvent(new CustomEvent("buttonStateChanged"));
        };
        this.params.player = this.shadow.getElementById('audioPlayer');

        this.params.audioButtonElement.removeClassName('featureDisabled');

        this.params.audioSourceDropDown = this.audioSourceDropDown;

        if ('MediaSource' in window
            && window.MediaSource
            && MediaSource.isTypeSupported('audio/mpeg')
            && 'ReadableStream' in window) {

            if (AudioCompressionLevelAudioAPI) {
                this.params.AudioCompressionLevel = AudioCompressionLevelAudioAPI;
            }

            this.audioController = new AudioControllerWebAudioAPI(this.params);
        } else {
            this.audioController = new AudioControllerStandart(this.params);
        }

        this.audioController.initialize();
        this.dispatchEvent(new CustomEvent("audioInitialized", { detail: { selectAudioSource: this.audioSourceDropDown } }));
        this.audioController.onErrorCallback = this.onErrorCallback.bind(this);
        this.audioController.setDisabled(this.disabled);
        if (event.detail.canPlay) {
            this.setContinueToPlay();
        }
    }

    getAudioSourceState() {
        return this.state.source || this.audioController.audioSource;
    }

    onErrorCallback(error) {
        this.dispatchEvent(new CustomEvent('audioError', { detail: { error: error } }));

        this.deleteState(this.stateId);
    }

    deleteAudioState() {
        this.deleteState(this.stateId);
    }

    onConnect() {

    }

    setContinueToPlay() {
        if (this.stateId) {
            this.getState(this.stateId, (data) => {
                this.state = data;
                if (data.id == this.params.cameraId && data.state == 'started' && data.live == this.audioController.isLive) {
                    setTimeout(() => {
                        this.show && !this.audioController.isDisabled && this.audioController.play();
                    }, 300);
                }
            });
        }
    }

    onFocusCamera(event) {
        if (this.stateId) {
            this.getState(this.stateId, (data) => {
                this.state = data;
                if (data.id != event.detail.cameraId) {
                    setTimeout(() => {
                        this.audioController.pause();
                    }, 300);
                }
            });
        }
    }

    onSetAudioStreamOption(event) {
        if (this.audioController) {
            this.audioController.setAudioStreamOption(event.detail.name, event.detail.value);
        } else {
            this.playbackControllerId = event.detail.value;
        }
    }

    onSwitchToLive(event) {
        setTimeout(() => {
            this.audioController && this.audioController.switchToLive();
            this.setContinueToPlay();
        }, 100); // Give some time for the shadow dom elements to be ready
    }

    onSwitchToPlayback(event) {
        setTimeout(() => {
            this.audioController && this.audioController.switchToPlayback(event.detail.playbackControllerId, this.getAudioSourceState())
        }, 100); // Give some time for the shadow dom elements to be ready
    }

    onNetworkError(event) {
        this.audioController && this.audioController.onNetworkError();
    }

    onStop(event) {
        this.audioController && this.audioController.pause();
    }

    onStart(event) {
        setTimeout(() => {
            this.startAudioStream(event);
        }, 100); // Give some time for the shadow dom elements to be ready
    }

    onDisconnected() {
        // called when the element is removed from DOM
    }

    destroy() {
        this.status = 'destroyed';
        this.dispatchEvent(new CustomEvent("disconnected", { bubbles: true, composed: true, detail: { component: name } }));
        this.audioController && this.audioController.destroy();

        this.removeEventListener('mouseover', this.showAudioSelectLabel.bind(this));
        this.removeEventListener('mouseleave', this.hideAudioSelectLabel.bind(this));

        this.removeEventListener('focusCamera', this.onFocusCamera.bind(this));

        this.removeEventListener('start', this.onStart.bind(this));
        this.removeEventListener('stop', this.onStop.bind(this));

        this.removeEventListener('onNetworkError', this.onNetworkError.bind(this));
        this.removeEventListener('switchToPlayback', this.onSwitchToPlayback.bind(this));
        this.removeEventListener('switchToLive', this.onSwitchToLive.bind(this));
        this.removeEventListener('setAudioStreamOption', this.onSetAudioStreamOption.bind(this));
        this.removeEventListener('setContinueToPlay', this.setContinueToPlay.bind(this));

        this.removeEventListener('deleteAudioState', this.deleteAudioState.bind(this));
        this.playbackControllerId = null;
    }
}

window.customElements.define(name, AudioStream);