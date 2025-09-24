import React, { Component } from 'react';
import { Input, Button } from '@material-ui/core';
import "./Home.css";

class Home extends Component {
  constructor(props) {
    super(props);
    this.state = {
      url: '',
      name: '', // user input for interactive logo
      logoColor: '#222' // default color
    };
  }

  handleChange = (e) => this.setState({ url: e.target.value });
  handleNameChange = (e) => this.setState({ name: e.target.value });

  join = () => {
  if (this.state.url !== "" && this.state.name) {
    var url = this.state.url.split("/");
    localStorage.setItem("username", this.state.name );
    window.location.href = `/${url[url.length - 1]}`;
  } else {
    var url = Math.random().toString(36).substring(2, 7);
    localStorage.setItem("username", this.state.name);
    window.location.href = `/${url}`;
  }
};


  // 🎨 Change logo color on click
  changeLogoColor = () => {
    const colors = ["#ff6b81", "#6c5ce7", "#00b894", "#e17055", "#0984e3"];
    const random = colors[Math.floor(Math.random() * colors.length)];
    this.setState({ logoColor: random });
  };

  render() {
    return (
      <div className="container2">
        {/* Particle background */}
        <div id="particles-js"></div>

        <div className="brand-tagline">
          ⚡ Made with passion by Bhuvi ⚡
        </div>

        {/* Logo Area */}
<div 
  className={`logo-thumbnail ${this.state.name ? "logo-glow" : ""}`} 
  onClick={this.changeLogoColor}
>
  <div className="orbit-dot"></div>
  <div 
    className="user-name-display"
    style={{ color: this.state.logoColor }}
  >
    {this.state.name || "GuppShupp"}
  </div>
</div>


        <div>
          <p className="header-sub">
            Lets have a little
          </p>
          <h1 className="header-title">GuppShupp 😉</h1>
          <p className="header-sub">
            Connect instantly. Meet in style. A soothing, futuristic video app.
          </p>
        </div>

        {/* Meeting Card */}
        <div className="meeting-card">
          <p>Start or join a meeting</p>
          <Input
            placeholder="Enter meeting URL or code"
            className="meeting-input"
            onChange={this.handleChange}
          />
          <Button variant="contained" color="primary" onClick={this.join}>
            Go
          </Button>

          {/* User input for dynamic logo */}
          <Input
            placeholder="Enter your name to light up the logo ✨"
            className="name-input"
            onChange={this.handleNameChange}
          />
        </div>
      </div>
    );
  }
}

export default Home;
