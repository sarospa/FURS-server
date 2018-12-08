module.exports = function (req, res, next) {
	res.set(
	{
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
	});
	next();
}