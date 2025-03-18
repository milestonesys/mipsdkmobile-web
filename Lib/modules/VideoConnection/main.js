import Socket from "./js/WebSocket.js";
import { VideoConnectionState } from "./js/config.js";

class VideoConnection extends HTMLElement {
  #state;

  constructor() {
    super();
    this.state = VideoConnectionState.notOpened;
    this.addEventListener("destroy", this.destroy.bind(this));
    this.addEventListener("start", this.startStream.bind(this));
  }

  get state() {
    return this.#state;
  }

  set state(value) {
    this.#state = value;
    this.socket && this.socket.onStateChange(value);
  }

  get videoId() {
    return this.getAttribute("videoId") || "";
  }

  set videoId(value) {
    if (value) {
      this.setAttribute("videoId", value);
    } else {
      this.removeAttribute("videoId");
    }
  }

  get location() {
    return this.getAttribute("location") || "";
  }

  set location(value) {
    if (value) {
      this.setAttribute("location", value);
    } else {
      this.removeAttribute("location");
    }
  }

  startStream() {
    if (this.status == "destroyed") {
      return;
    }
    this.socket = new Socket(this.videoId, this.location);
    this.socket.start();
    this.socket.onReceivedFrame = this.onReceivedFrame.bind(this);
    this.socket.onSocketError = this.onSocketError.bind(this);
    this.socket.onSocketClose = this.onSocketClose.bind(this);
  }

  refresh() {
    if (!this.isClosed) {
      this.socket.pingServer();
    }
  }

  onReceivedFrame(frame) {
    this.dispatchEvent(
      new CustomEvent("onReceivedFrame", { detail: { frame: frame } }),
    );
  }

  onSocketError() {
    if (!this.isClosed) {
      this.dispatchEvent(new CustomEvent("onConnectionError"));
    }
  }

  onSocketClose() {
    if (!this.isClosed) {
      this.dispatchEvent(new CustomEvent("onConnectionError"));
    }
  }

  get isClosed() {
    return this.state === VideoConnectionState.closed;
  }

  destroy() {
    this.state = VideoConnectionState.closed;
    this.socket && this.socket.destroy();
    this.socket = null;
  }
}

window.customElements.define("video-connection", VideoConnection);
