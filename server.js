var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var sse = require('./sse');
var access_headers = require('./access-headers');
var bcrypt = require('bcrypt');
var crypto = require('crypto');
var fs = require('fs');

app.use(access_headers);
app.use(sse);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function Persona(name, hash, role) {
	this.name = name,
	this.hash = hash,
	this.role = role
}

function Room(name, desc) {
	this.name = name,
	this.desc = desc,
	this.contents = []
}

function Connection(persona, response, token) {
	this.persona = persona,
	this.response = response,
	this.token = token
}

var connections = {};
var personas = {};
var rooms = [];

// Broadcasts data to all connected users.
function sendToAll(data)
{
	for (token in connections)
	{
		connections[token].response.sseSend(data);
	}
}

// Debug output, displays all current connections.
function printConnections()
{
	console.log("Connections:");
	for (token in connections)
	{
		if (connections[token].response !== undefined) console.log(connections[token].persona.name);
	}
}

// Geneates a session token.
function generateToken()
{
	var token = crypto.randomBytes(16).toString('hex');
	return token;
}

// Validate client credentials to see if the client can be logged into the persona.
// Returns the token on successful login, otherwise returns null.
function validateUser(name, password)
{
	var persona = personas[name]
	if (persona === undefined)
	{
		return null;
	}
	var result = bcrypt.compare(password, persona.hash);
	if (result)
	{
		return joinUser(name)
	}
	else
	{
		return null;
	}
}

// Generates connection data with no response and returns a token.
// Response should be attached by the "/open" route.
function joinUser(name)
{
	var persona = personas[name];
	var newConnection = new Connection(persona, null, generateToken());
	console.log("Session token for " + persona.name + " generated: " + newConnection.token);
	connections[newConnection.token] = newConnection;
	return newConnection.token;
}

function registerUser(name, password, role)
{
	if (personas[name] !== undefined)
	{
		return null;
	}
	var hash = bcrypt.hashSync(password, 10);
	personas[name] = new Persona(name, hash, role);
	fs.writeFile("data/personas.json", JSON.stringify(personas), function() {});
	return joinUser(name);
}

app.post('/register/:name/:password', function (req, res) {
	console.log("Register: " + JSON.stringify(req.params));
	var token = registerUser(req.params.name, req.params.name, "mortal");
	if (token === null)
	{
		res.status(200).send();
	}
	else
	{
		res.status(200).send({
			type: "token",
			content: token
		});
	}
});

app.post('/join/:name/:password', function (req, res) {
	console.log("Login: " + JSON.stringify(req.params));
	var token = validateUser(req.params.name, req.params.password);
	if (token === null)
	{
		res.set({
			"WWW-Authenticate": "Basic"
		});
		res.status(401).send();
	}
	else
	{
		res.status(200).send({
			type: "token",
			content: token
		});
	}
});

app.get('/open/:token', function(req, res){
	console.log("Open: " + JSON.stringify(req.params));
	if (connections[req.params.token] === undefined)
	{
		res.set({
			"WWW-Authenticate": "Basic"
		});
		res.status(401).send();
		return;
	}
	var connection = connections[req.params.token];
	connection.response = res;
	res.sseSetup();
	for (token in connections)
	{
		if (token !== connection.token)
		{
			res.sseSend({
				type: "connect",
				name: connections[token].persona.name
			});
		}
		
	}
	sendToAll({
		type: "connect",
		name: connection.persona.name
	});
	res.sseSend({
		type: "room",
		name: rooms[0].name,
		desc: rooms[0].desc
	});
	printConnections();
	res.on("close", function()
	{
		sendToAll({
			type: "disconnect",
			name: connection.persona.name
		});
		delete connections[connection.token];
		printConnections();
	});
});

app.post('/send/:token', function (req, res) {
	console.log(req.body);
	var connection = connections[req.params.token];
	if (connection !== undefined)
	{
		var persona = connection.persona;
		sendToAll({
			type: "message",
			content: req.body.message,
			name: persona.name
		});
		res.status(200).send("success");
	}
	else
	{
		res.set({
			"WWW-Authenticate": "Basic"
		});
		res.status(401).send();
	}
});

if (!fs.existsSync("data")){
    fs.mkdirSync("data");
}

var personaData = fs.readFileSync("data/personas.json", { encoding: "utf8", flag: "a+" });
if (personaData === "")
{
	var hash = bcrypt.hashSync("potrzebie", 10);
	personas["God"] = new Persona("God", hash, "god");
	fs.writeFile("data/personas.json", JSON.stringify(personas), function() {});
}
else
{
	personas = JSON.parse(personaData);
	console.log(JSON.stringify(personas))
}

var roomData = fs.readFileSync("data/rooms.json", { encoding: "utf8", flag: "a+" });
if (roomData === "")
{
	rooms[0] = new Room("Default Lounge", "It's the default lounge!");
	fs.writeFile("data/rooms.json", JSON.stringify(rooms), function() {});
}
else
{
	rooms = JSON.parse(roomData);
	console.log(JSON.stringify(rooms));
}


var server = app.listen(8081, function () {
   var host = server.address().address
   var port = server.address().port
   
   console.log("Example app listening at http://%s:%s", host, port)
});
server.timeout = 0;