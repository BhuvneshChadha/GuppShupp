import React, { Component } from 'react'
import io from 'socket.io-client'
import faker from "faker"

import {IconButton, Badge, Input, Button} from '@material-ui/core'
import VideocamIcon from '@material-ui/icons/Videocam'
import VideocamOffIcon from '@material-ui/icons/VideocamOff'
import MicIcon from '@material-ui/icons/Mic'
import MicOffIcon from '@material-ui/icons/MicOff'
import ScreenShareIcon from '@material-ui/icons/ScreenShare'
import StopScreenShareIcon from '@material-ui/icons/StopScreenShare'
import CallEndIcon from '@material-ui/icons/CallEnd'
import ChatIcon from '@material-ui/icons/Chat'

import { message } from 'antd'
import 'antd/dist/antd.css'

import { Row } from 'reactstrap'
import Modal from 'react-bootstrap/Modal'
import 'bootstrap/dist/css/bootstrap.css'
import "./Video.css"

const server_url = process.env.NODE_ENV === 'production' ? 'https://video.sebastienbiollo.com' : "http://localhost:4001"

const peerConnectionConfig = {
  'iceServers': [
    { 'urls': 'stun:stun.l.google.com:19302' },
  ]
}

var connections = {}
var socket = null
var socketId = null
var elms = 0

class Video extends Component {
  constructor(props) {
    super(props)

    this.localVideoref = React.createRef()

    this.videoAvailable = false
    this.audioAvailable = false

    this.state = {
      video: false,
      audio: false,
      screen: false,
      whiteboard: false,
      drawing: false,
      showModal: false,
      screenAvailable: false,
      messages: [],
      message: "",
      newmessages: 0,
      askForUsername: true,
      username: localStorage.getItem("username") || faker.internet.userName(),
      eraser: false,
      penSize: 2,
      eraserSize: 20,
      penColor: '#000000'
    }
    connections = {}

    this.getPermissions()
  }

  getPermissions = async () => {
    try{
      await navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => this.videoAvailable = true)
        .catch(() => this.videoAvailable = false)

      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => this.audioAvailable = true)
        .catch(() => this.audioAvailable = false)

      if (navigator.mediaDevices.getDisplayMedia) {
        this.setState({ screenAvailable: true })
      } else {
        this.setState({ screenAvailable: false })
      }

      if (this.videoAvailable || this.audioAvailable) {
        navigator.mediaDevices.getUserMedia({ video: this.videoAvailable, audio: this.audioAvailable })
          .then((stream) => {
            window.localStream = stream
            this.localVideoref.current.srcObject = stream
          })
          .catch((e) => console.log(e))
      }
    } catch(e) { console.log(e) }
  }

  // ---------- Whiteboard helpers ----------
  initWhiteboard = () => {
    const canvas = document.getElementById("whiteboard")
    if (!canvas) return
    const ctx = canvas.getContext("2d")

    // set default pen properties
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // use pointer events for mouse + touch
    let drawing = false
    let lastX = 0
    let lastY = 0

    const toCanvasCoords = (e) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }

    const start = (e) => {
      e.preventDefault()
      const p = toCanvasCoords(e.type.includes('touch') ? e.touches[0] : e)
      drawing = true
      lastX = p.x
      lastY = p.y
    }

    const draw = (e) => {
      if (!drawing) return
      e.preventDefault()
      const p = toCanvasCoords(e.type.includes('touch') ? e.touches[0] : e)

      const payload = {
        fromX: lastX,
        fromY: lastY,
        toX: p.x,
        toY: p.y,
        erase: this.state.eraser,
        size: this.state.eraser ? this.state.eraserSize : this.state.penSize,
        color: this.state.penColor
      }

      this.drawOnCanvas(ctx, payload, false)
      // broadcast
      if (socket) socket.emit('whiteboard-draw', payload)

      lastX = p.x
      lastY = p.y
    }

    const stop = (e) => {
      if (!drawing) return
      drawing = false
    }

    // pointer events
    canvas.addEventListener('pointerdown', start)
    canvas.addEventListener('pointermove', draw)
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('pointercancel', stop)
    canvas.addEventListener('pointerleave', stop)

    // listen for remote draw events
    socket && socket.on('whiteboard-draw', (data) => {
      // data may come as Json string or object
      const payload = typeof data === 'string' ? JSON.parse(data) : data
      this.drawOnCanvas(ctx, payload, true)
    })
	socket.on("whiteboard-clear", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

    // expose ctx for clearing / exporting if needed
    this.whiteboardContext = ctx
  }

  drawOnCanvas = (ctx, payload, remote) => {
    if (!ctx || !payload) return

    ctx.save()

    if (payload.erase) {
      // Eraser: use destination-out to remove pixels
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = payload.color || this.state.penColor
    }

    ctx.lineWidth = payload.size || (payload.erase ? this.state.eraserSize : this.state.penSize)
    ctx.beginPath()
    ctx.moveTo(payload.fromX, payload.fromY)
    ctx.lineTo(payload.toX, payload.toY)
    ctx.stroke()
    ctx.closePath()

    ctx.restore()
  }

  clearWhiteboard = () => {
    const canvas = document.getElementById('whiteboard')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0,0,canvas.width, canvas.height)
    // Broadcast clear action so others also clear
    if (socket) socket.emit('whiteboard-draw', { type: "clear" },JSON.stringify({ clear: true }))
  }

  // ---------- End whiteboard helpers ----------

  componentDidUpdate(prevProps, prevState) {
    if (this.state.whiteboard && !prevState.whiteboard) {
      // small delay to ensure canvas is mounted and sized
      setTimeout(() => this.initWhiteboard(), 50)
    }

    // if toggled eraser/pen, update cursor to reflect it
    if (this.state.whiteboard && this.state.eraser !== prevState.eraser) {
      const canvas = document.getElementById('whiteboard')
      if (canvas) canvas.style.cursor = this.state.eraser ? 'crosshair' : 'crosshair'
    }
  }

  // existing media methods (unchanged) ...
  getDislayMedia = () => {
    if (this.state.screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          .then(this.getDislayMediaSuccess)
          .catch((e) => console.log(e))
      }
    }
  }

  getDislayMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach(track => track.stop())
    } catch(e) { console.log(e) }

    window.localStream = stream
    this.localVideoref.current.srcObject = stream

    for (let id in connections) {
      if (id === socketId) continue

      connections[id].addStream(window.localStream)

      connections[id].createOffer().then((description) => {
        connections[id].setLocalDescription(description)
          .then(() => {
            socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
          })
          .catch(e => console.log(e))
      })
    }

    stream.getTracks().forEach(track => track.onended = () => {
      this.setState({ screen: false }, () => {
        try {
          let tracks = this.localVideoref.current.srcObject.getTracks()
          tracks.forEach(track => track.stop())
        } catch(e) {}

        let blackSilence = (...args) => new MediaStream([this.black(...args), this.silence()])
        window.localStream = blackSilence()
        this.localVideoref.current.srcObject = window.localStream

        this.getUserMedia()
      })
    })
  }

  // ... rest of existing methods unchanged (getPermissions, getMedia, getUserMedia, getUserMediaSuccess, etc.)
  getMedia = () => {
    this.setState({ video: this.videoAvailable, audio: this.audioAvailable }, () => {
      this.getUserMedia()
      this.connectToSocketServer()
    })
  }

  getUserMedia = () => {
    if ((this.state.video && this.videoAvailable) || (this.state.audio && this.audioAvailable)) {
      navigator.mediaDevices.getUserMedia({ video: this.state.video, audio: this.state.audio })
        .then(this.getUserMediaSuccess)
        .catch((e) => console.log(e))
    } else {
      try {
        let tracks = this.localVideoref.current.srcObject.getTracks()
        tracks.forEach(track => track.stop())
      } catch (e) {}
    }
  }

  getUserMediaSuccess = (stream) => {
    try { window.localStream.getTracks().forEach(track => track.stop()) } catch(e) {}
    window.localStream = stream
    this.localVideoref.current.srcObject = stream

    for (let id in connections) {
      if (id === socketId) continue
      connections[id].addStream(window.localStream)
      connections[id].createOffer().then((description) => {
        connections[id].setLocalDescription(description)
          .then(() => socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription })))
          .catch(e => console.log(e))
      })
    }

    stream.getTracks().forEach(track => track.onended = () => {
      this.setState({ video: false, audio: false }, () => {
        try { let tracks = this.localVideoref.current.srcObject.getTracks(); tracks.forEach(track => track.stop()) } catch(e) {}
        let blackSilence = (...args) => new MediaStream([this.black(...args), this.silence()])
        window.localStream = blackSilence()
        this.localVideoref.current.srcObject = window.localStream

        for (let id in connections) {
          connections[id].addStream(window.localStream)
          connections[id].createOffer().then((description) => {
            connections[id].setLocalDescription(description)
              .then(() => socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription })))
              .catch(e => console.log(e))
          })
        }
      })
    })
  }

  gotMessageFromServer = (fromId, message) => {
    var signal = JSON.parse(message)

    if (fromId !== socketId) {
      if (signal.sdp) {
        connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
          if (signal.sdp.type === 'offer') {
            connections[fromId].createAnswer().then((description) => {
              connections[fromId].setLocalDescription(description).then(() => {
                socket.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }))
              }).catch(e => console.log(e))
            }).catch(e => console.log(e))
          }
        }).catch(e => console.log(e))
      }

      if (signal.ice) {
        connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
      }
    }
  }

  changeCssVideos = (main) => {
    let widthMain = main.offsetWidth
    let minWidth = "30%"
    if ((widthMain * 30 / 100) < 300) { minWidth = "300px" }
    let minHeight = "40%"

    let height = String(100 / elms) + "%"
    let width = ""
    if(elms === 0 || elms === 1) { width = "100%"; height = "100%" }
    else if (elms === 2) { width = "45%"; height = "100%" }
    else if (elms === 3 || elms === 4) { width = "35%"; height = "50%" }
    else { width = String(100 / elms) + "%" }

    let videos = main.querySelectorAll("video")
    for (let a = 0; a < videos.length; ++a) {
      videos[a].style.minWidth = minWidth
      videos[a].style.minHeight = minHeight
      videos[a].style.setProperty("width", width)
      videos[a].style.setProperty("height", height)
    }

    return {minWidth, minHeight, width, height}
  }

  connectToSocketServer = () => {
    socket = io.connect(server_url, { secure: true })

    socket.on('signal', this.gotMessageFromServer)

    socket.on('connect', () => {
      socket.emit('join-call', window.location.href)
      socketId = socket.id

      socket.on('chat-message', this.addMessage)

      socket.on('user-left', (id) => {
        let video = document.querySelector(`[data-socket="${id}"]`)
        if (video !== null) {
          elms--
          video.parentNode.removeChild(video)

          let main = document.getElementById('main')
          this.changeCssVideos(main)
        }
      })

      socket.on('user-joined', (id, clients) => {
        clients.forEach((socketListId) => {
          connections[socketListId] = new RTCPeerConnection(peerConnectionConfig)

          connections[socketListId].onicecandidate = function (event) {
            if (event.candidate != null) {
              socket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
            }
          }

          connections[socketListId].onaddstream = (event) => {
            var searchVidep = document.querySelector(`[data-socket="${socketListId}"]`)
            if (searchVidep !== null) { searchVidep.srcObject = event.stream }
            else {
              elms = clients.length
              let main = document.getElementById('main')
              let cssMesure = this.changeCssVideos(main)

              let video = document.createElement('video')
              let css = {minWidth: cssMesure.minWidth, minHeight: cssMesure.minHeight, maxHeight: "100%", margin: "10px",
                borderStyle: "solid", borderColor: "#bdbdbd", objectFit: "fill"}
              for(let i in css) video.style[i] = css[i]

              video.style.setProperty("width", cssMesure.width)
              video.style.setProperty("height", cssMesure.height)
              video.setAttribute('data-socket', socketListId)
              video.srcObject = event.stream
              video.autoplay = true
              video.playsinline = true

              main.appendChild(video)
            }
          }

          if (window.localStream !== undefined && window.localStream !== null) {
            connections[socketListId].addStream(window.localStream)
          } else {
            let blackSilence = (...args) => new MediaStream([this.black(...args), this.silence()])
            window.localStream = blackSilence()
            connections[socketListId].addStream(window.localStream)
          }
        })

        if (id === socketId) {
          for (let id2 in connections) {
            if (id2 === socketId) continue
            try { connections[id2].addStream(window.localStream) } catch(e) {}

            connections[id2].createOffer().then((description) => {
              connections[id2].setLocalDescription(description)
                .then(() => socket.emit('signal', id2, JSON.stringify({ 'sdp': connections[id2].localDescription })))
                .catch(e => console.log(e))
            })
          }
        }
      })
    })
  }

  silence = () => {
    let ctx = new AudioContext()
    let oscillator = ctx.createOscillator()
    let dst = oscillator.connect(ctx.createMediaStreamDestination())
    oscillator.start()
    ctx.resume()
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
  }
  black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), { width, height })
    canvas.getContext('2d').fillRect(0, 0, width, height)
    let stream = canvas.captureStream()
    return Object.assign(stream.getVideoTracks()[0], { enabled: false })
  }

  // controls
  toggleEraser = () => this.setState({ eraser: !this.state.eraser })
  setPenSize = (e) => this.setState({ penSize: parseInt(e.target.value, 10) || 1 })
  setEraserSize = (e) => this.setState({ eraserSize: parseInt(e.target.value, 10) || 10 })
  setPenColor = (e) => this.setState({ penColor: e.target.value })

  handleVideo = () => {
    if (window.localStream) {
      window.localStream.getVideoTracks().forEach(track => {
        if (!track.label.toLowerCase().includes("screen")) {
          track.enabled = !track.enabled
          this.setState({ video: track.enabled })
        }
      })
    }
  }

  handleAudio = () => {
    if (window.localStream) {
      window.localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled)
      this.setState({ audio: window.localStream.getAudioTracks()[0].enabled })
    }
  }

  handleScreen = async () => {
    if (!this.state.screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
          const screenTrack = screenStream.getVideoTracks()[0]

          for (let id in connections) {
            let sender = connections[id].getSenders().find(s => s.track && s.track.kind === 'video')
            if (sender) sender.replaceTrack(screenTrack)
          }

          this.localVideoref.current.srcObject = screenStream
          window.localStream = new MediaStream([
            ...screenStream.getTracks(),
            ...window.localStream.getAudioTracks()
          ])

          screenTrack.onended = async() => {
            const cam = await navigator.mediaDevices.getUserMedia({ video: true })
            const camVideoTrack = cam.getVideoTracks()[0]
            for (let id in connections) {
              let sender = connections[id].getSenders().find(s => s.track && s.track.kind === 'video')
              if (sender) sender.replaceTrack(camVideoTrack)
            }
            window.localStream.removeTrack(screenTrack)
            window.localStream.addTrack(camVideoTrack)
            this.localVideoref.current.srcObject = window.localStream
            this.setState({ screen: false })
          }

          this.setState({ screen: true })
        } catch (e) { console.log(e) }
      }
    } else {
      const videoTrack = window.localStream.getVideoTracks()[0]
      videoTrack.stop()
      this.setState({ screen: false })
      this.getUserMedia()
    }
  }

  handleEndCall = () => {
    try { let tracks = this.localVideoref.current.srcObject.getTracks(); tracks.forEach(track => track.stop()) } catch (e) {}
    window.location.href = "/"
  }

  openChat = () => this.setState({ showModal: true, newmessages: 0 })
  closeChat = () => this.setState({ showModal: false })
  handleMessage = (e) => this.setState({ message: e.target.value })

  addMessage = (data, sender, socketIdSender) => {
    this.setState(prevState => ({ messages: [...prevState.messages, { "sender": sender, "data": data }] }))
    if (socketIdSender !== socketId) this.setState({ newmessages: this.state.newmessages + 1 })
  }

  handleUsername = (e) => this.setState({ username: e.target.value })

  sendMessage = () => {
    socket.emit('chat-message', this.state.message, this.state.username)
    this.setState({ message: "", sender: this.state.username })
  }

  copyUrl = () => {
    let text = window.location.href
    if (!navigator.clipboard) {
      let textArea = document.createElement("textarea")
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try { document.execCommand('copy'); message.success("Link copied to clipboard!") } catch (err) { message.error("Failed to copy") }
      document.body.removeChild(textArea)
      return
    }
    navigator.clipboard.writeText(text).then(function () { message.success("Link copied to clipboard!") }, () => { message.error("Failed to copy") })
  }

  connect = () => this.setState({ askForUsername: false }, () => this.getMedia())

  isChrome = function () {
    let userAgent = (navigator && (navigator.userAgent || '')).toLowerCase()
    let vendor = (navigator && (navigator.vendor || '')).toLowerCase()
    let matchChrome = /google inc/.test(vendor) ? userAgent.match(/(?:chrome|crios)\/(\d+)/) : null
    return matchChrome !== null
  }

  render() {
    if(this.isChrome() === false){
      return (
        <div style={{background: "white", width: "30%", height: "auto", padding: "20px", minWidth: "400px",
            textAlign: "center", margin: "auto", marginTop: "50px", justifyContent: "center"}}>
          <h1>Sorry, this works only with Google Chrome</h1>
        </div>
      )
    }

    return (
      <div>
        {this.state.askForUsername === true ?
          <div>
            <div style={{background: "white", width: "30%", height: "auto", padding: "20px", minWidth: "400px",
                textAlign: "center", margin: "auto", marginTop: "50px", justifyContent: "center"}}>
              <p style={{ margin: 0, fontWeight: "bold", paddingRight: "50px" }}>Set your username</p>
              <Input placeholder="Username" value={this.state.username} onChange={e => this.handleUsername(e)} />
              <Button variant="contained" color="primary" onClick={this.connect} style={{ margin: "20px" }}>Connect</Button>
            </div>

            <div style={{ justifyContent: "center", textAlign: "center", paddingTop: "40px" }}>
              <video id="my-video" ref={this.localVideoref} autoPlay muted style={{
                borderStyle: "solid",borderColor: "#bdbdbd",objectFit: "fill",width: "60%",height: "30%"}}></video>
            </div>
          </div>
          :
          <div>
            <div className="btn-down" style={{ backgroundColor: "whitesmoke", color: "whitesmoke", textAlign: "center" }}>
              <IconButton style={{ color: "#424242" }} onClick={this.handleVideo}>
                {(this.state.video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
              </IconButton>

              <IconButton style={{ color: "#f44336" }} onClick={this.handleEndCall}>
                <CallEndIcon />
              </IconButton>

              <IconButton style={{ color: "#424242" }} onClick={this.handleAudio}>
                {this.state.audio === true ? <MicIcon /> : <MicOffIcon />}
              </IconButton>

              <IconButton style={{ color: "#424242" }} onClick={() => this.setState({ whiteboard: !this.state.whiteboard })}>
                📝
              </IconButton>

              {this.state.screenAvailable === true ?
                <IconButton style={{ color: "#424242" }} onClick={this.handleScreen}>
                  {this.state.screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                </IconButton>
                : null}

              <Badge badgeContent={this.state.newmessages} max={999} color="secondary" onClick={this.openChat}>
                <IconButton style={{ color: "#424242" }} onClick={this.openChat}>
                  <ChatIcon />
                </IconButton>
              </Badge>
            </div>

            <Modal show={this.state.showModal} onHide={this.closeChat} style={{ zIndex: "999999" }}>
              <Modal.Header closeButton>
                <Modal.Title>Chat Room</Modal.Title>
              </Modal.Header>
              <Modal.Body style={{ overflow: "auto", overflowY: "auto", height: "400px", textAlign: "left" }} >
                {this.state.messages.length > 0 ? this.state.messages.map((item, index) => (
                  <div key={index} style={{textAlign: "left"}}>
                    <p style={{ wordBreak: "break-all" }}><b>{item.sender}</b>: {item.data}</p>
                  </div>
                )) : <p>No message yet</p>}
              </Modal.Body>
              <Modal.Footer className="div-send-msg">
                <Input placeholder="Message" value={this.state.message} onChange={e => this.handleMessage(e)} />
                <Button variant="contained" color="primary" onClick={this.sendMessage}>Send</Button>
              </Modal.Footer>
            </Modal>

            <div className="container">
              <div style={{ paddingTop: "20px" }}>
                <Input value={window.location.href} disable="true"></Input>
                <Button style={{backgroundColor: "#3f51b5",color: "whitesmoke",marginLeft: "20px",
                  marginTop: "10px",width: "120px",fontSize: "10px"
                }} onClick={this.copyUrl}>Copy invite link</Button>
              </div>

              <Row id="main" className="flex-container" style={{ margin: 0, padding: 0 }}>
                <video id="my-video" ref={this.localVideoref} autoPlay muted style={{
                  borderStyle: "solid",borderColor: "#bdbdbd",margin: "10px",objectFit: "fill",
                  width: "100%",height: "100%"}}></video>
              </Row>

              {this.state.whiteboard &&
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <label>Pen:</label>
                    <input type="color" value={this.state.penColor} onChange={this.setPenColor} />
                    <label>Size:</label>
                    <input type="range" min="1" max="30" value={this.state.penSize} onChange={this.setPenSize} />

                    <button onClick={this.toggleEraser} style={{ padding: '6px 10px' }}>
                      {this.state.eraser ? 'Eraser (ON)' : 'Eraser (OFF)'}
                    </button>

                    <label>Eraser size:</label>
                    <input type="range" min="5" max="80" value={this.state.eraserSize} onChange={this.setEraserSize} />

                    <button onClick={this.clearWhiteboard} style={{ padding: '6px 10px' }}>Clear</button>
                  </div>

                  <canvas id="whiteboard" width={800} height={500} style={{ border: "2px solid black", background: "white" }}></canvas>
                </div>
              }

            </div>
          </div>
        }
      </div>
    )
  }
}

export default Video
