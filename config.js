const mongodb = require('mongodb');
const connect = mongodb.MongoClient.connect;

exports.maxRemindCount = 2;
exports.db = null;
exports.secret = '';
exports.ObjectId = mongodb.ObjectId;
exports.connDB = async function () {
	if (exports.db) return exports.db;

	let mongoUrl = "mongodb://127.0.0.1:27017";
	
	const dbName = "test";
	const _dbconn = await mongodb.connect(mongoUrl);
	exports.db = _dbconn.db(dbName);
	exports.db.close = _dbconn.close;
	return exports.db;
};
exports.closeDB = function () {
	exports.db.close();
};


// exports.database = 'mongodb://localhost/iWin';
