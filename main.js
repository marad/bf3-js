var Client = require("./bfclient").Client;

var serverIp = "";
var serverPort = 0;
var adminPassword = "";

var c = new Client();
c.connect(serverIp, serverPort);

c.sendCommand("login.plainText " + adminPassword, function(loginStatus) {
  console.log('Login status:', loginStatus);
  //c.sendCommand("admin.eventsEnabled true");
  c.sendCommand("listPlayers all", function(msg) {
    console.log("Currently playing:");
    msg.players.forEach(function(player) {
      console.log("\t" + player.name);
    });
  });
});


c.on("serverEvent", function(data) {
  console.log(data);
});

// INPUT HANDLING
var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var sequence = 0;

function handleInput() {
  rl.question("> ", function(commands) {
    c.sendCommand(commands, function(response) {
      console.log(response);
      setTimeout(handleInput(), 0);
    });
  });
}

handleInput();
