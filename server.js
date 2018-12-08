var express = require('express');
var app = express();
var bodyParser = require('body-parser')
var sse = require('./sse')

app.use(sse);
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

function Character(name, response) {
	this.name = name,
	this.response = response
}

var connections = [];

function sendToAll(data)
{
	for(var i = 0; i < connections.length; i++)
	{
		connections[i].response.sseSend(data);
	}
}

function printConnections()
{
	console.log("Connections:");
	for (var i = 0; i < connections.length; i++)
	{
		console.log(connections[i].name);
	}
}

app.get('/join/:name', function (req, res) {
	res.sseSetup();
	for (var i = 0; i < connections.length; i++)
	{
		res.sseSend({
			type: "connect",
			name: connections[i].name
		});
	}
	var reqCharacter = new Character(req.params.name, res);
	connections.push(reqCharacter);
	sendToAll({
		type: "connect",
		name: req.params.name
	})
	printConnections();
	res.on("close", function()
	{
		sendToAll({
			type: "disconnect",
			name: reqCharacter.name
		});
		connections.splice(connections.indexOf(reqCharacter), 1);
		printConnections();
	});
});

app.post('/send', function (req, res) {
	console.log(req.body);
	sendToAll({
		type: "message",
		content: req.body.message,
		name: req.body.name
	});
	res.set(
	{
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
	});
	res.status(200).send("success");
});

var server = app.listen(8081, function () {
   var host = server.address().address
   var port = server.address().port
   
   console.log("Example app listening at http://%s:%s", host, port)
});