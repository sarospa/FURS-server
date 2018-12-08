var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var sse = require('./sse');
var access_headers = require('./access-headers');
var bcrypt = require('bcrypt');
var crypto = require('crypto');

app.use(access_headers);
app.use(sse);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function Persona(name, hash) {
	this.name = name,
	this.hash = hash
}

function Connection(persona, response, token) {
	this.persona = persona,
	this.response = response,
	this.token = token
}

var connections = [];
var personas = [];

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
	for (connection in connections)
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
function validateUser(req, res)
{
	var persona = personas[req.params.name]
	if (persona === undefined)
	{
		res.set({
			"WWW-Authenticate": "Basic"
		});
		res.status(401).send();
		return;
	}
	bcrypt.compare(req.params.password, persona.hash, function(err, result)
	{
		if (result)
		{
			joinUser(req, res)
		}
		else
		{
			res.set({
				"WWW-Authenticate": "Basic"
			});
			res.status(401).send();
			return;
		}
	})
}

// Set up SSE so the client receives messages broadcast to the persona.
function joinUser(req, res)
{
	var persona = personas[req.params.name];
	var newConnection = new Connection(persona, null, generateToken());
	console.log("Session token for " + persona.name + " generated: " + newConnection.token);
	connections[newConnection.token] = newConnection;
	res.status(200).send({
		type: "token",
		content: newConnection.token
	});
}

app.post('/register/:name/:password', function (req, res) {
	console.log("Register: " + JSON.stringify(req.params));
	if (personas[req.params.name] !== undefined)
	{
		res.status(200).send();
		return;
	}
	bcrypt.hash(req.params.password, 10, function(err, hash){
		personas[req.params.name] = new Persona(req.params.name, hash);
		joinUser(req, res);
	});
});

app.post('/join/:name/:password', function (req, res) {
	console.log("Login: " + JSON.stringify(req.params));
	validateUser(req, res);
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
		if (connections[token].persona.name !== connection.persona.name)
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

var server = app.listen(8081, function () {
   var host = server.address().address
   var port = server.address().port
   
   console.log("Example app listening at http://%s:%s", host, port)
});
server.timeout = 0;