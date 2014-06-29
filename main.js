var Client = require("./bfclient").Client;
var login = require("./login");

var serverIp = login.serverIp;
var serverPort = login.serverPort;
var adminPassword = login.adminPassword;

var c = new Client();
c.connect(serverIp, serverPort);

var cmd = function(command) {
  return c.sendCommand.bind(c, command);;
}


// INPUT HANDLING
var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var sequence = 0;

function handleInput() {
  rl.question("> ", function(command) {
    c.sendCommand(command)
      .then(console.log, function(error) {
        console.log(error);
      })
      .finally(setTimeout.bind(this, handleInput, 0));
  });
}


// LOGIN, SHOW CURRENT PLAYERS AND START HANDLING USER INPUT
c.sendCommand("login.plainText " + adminPassword)
  .then(console.log.bind(this, "Login status:"))
  .then(cmd("listPlayers all"))
  .then(function(playerList) {
    console.log("Now playing: ");
    playerList.players.forEach(function(player) {
      console.log("\t" + player.name);
    });
  })
  .then(function() {
    handleInput();
  })
  .done();

// REGISTER SERVER EVENT HANDLER
c.on("serverEvent", function(data) {
  console.log(data);
});
