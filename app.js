// Include the cluster module
var cluster = require('cluster');
// Code to run if we're in the master process
if (cluster.isMaster) {
    var cpuCount = require('os').cpus().length;
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }
    // Listen for terminating workers
    cluster.on('exit', function (worker) {
        // Replace the terminated workers
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();
    });

} else
{
	// Code to run if we're in a worker process
	var restify = require('restify');
	var server = restify.createServer({
	    name : "myapp"
	});
	var CookieParser = require('restify-cookies');
	server.use(restify.plugins.queryParser());
	server.use(restify.plugins.jsonBodyParser());
	server.use(CookieParser.parse);
	//print request url for development env
	if(!process.env.PORT) {
		var logger = require('restify-logger');
		server.use(logger('custom', {
			skip: function (req) {
			  return process.env.NODE_ENV === "test" || req.method === "OPTIONS" || req.url === "/status";
			}
		}));
	}
	var port = process.env.PORT || 8080;

	server.listen(port , function(){
	    console.log('%s listening at %s ', server.name , server.url);
	});

	var config = require('./config'); // db conn included
	config.connDB().catch(function(err){
		console.log('db connect', err);
		process.exit(-1);
	}); // async connect to db

	var Router = require('restify-router').Router;
	var routerNeedAuth = new  Router();
////////////////////request handler///////////////////////
	var userAuth = require('./user-auth');
	var shareService = require("./shares");
	var dealRecordService = require("./dealRecords");
	var fundService = require("./funds");
	var settings = require("./settings");
	var bondsService = require('./bonds');
//////////////////////////////////////////////////////////
	routerNeedAuth.use(userAuth.checkToken);
	server.get('/users', userAuth.fetchAllUsers);
	routerNeedAuth.patch('/user', userAuth.patchUser);
	routerNeedAuth.post('/changePassword', userAuth.changePassword);
	routerNeedAuth.get('/create-user', userAuth.createUser);
	routerNeedAuth.get('/user', userAuth.currentUser);
	routerNeedAuth.get('/deal-notify-test/:dealId', dealRecordService.dealNotifyTest);
	server.post('/api/login', userAuth.login);
	server.get('/api/logout', userAuth.logout);

	var PATH = '';
	routerNeedAuth.get({path : PATH + "/shares" , version : '0.0.1'}, shareService.findAllShares);
	routerNeedAuth.get({path : PATH + "/shares/export-excel" , version : '0.0.1'}, shareService.exportExcel);
	server.get({path : "/api/shares4h5" , version : '0.0.1'}, shareService.findShares4h5);
	routerNeedAuth.get({path : PATH +'/shares/:shareId' , version : '0.0.1'}, shareService.findShare);
	routerNeedAuth.post({path : PATH + "/shares" , version: '0.0.1'}, shareService.postNewShare);
	routerNeedAuth.patch({path : PATH +'/shares/:shareId' , version: '0.0.1'}, shareService.patchShare);
	routerNeedAuth.del({path : PATH +'/shares/:shareId' , version: '0.0.1'}, shareService.deleteShare);
	routerNeedAuth.post({path : PATH + "/import-shares" , version: '0.0.1'}, shareService.importShares);
	routerNeedAuth.patch({path: PATH + '/shares/price/:shareId', version: '0.0.1'}, shareService.patchLatesPrice);

	// deal records
	routerNeedAuth.post({path : PATH + '/deal-records' , version: '0.0.1'}, dealRecordService.postNewDealRecord);
	routerNeedAuth.patch({path : PATH + '/deal-records/:recordId' , version: '0.0.1'}, dealRecordService.patchDealRecord);
	routerNeedAuth.del({path : PATH + '/deal-records/:recordId' , version: '0.0.1'}, dealRecordService.delDealRecord);
	routerNeedAuth.get({path : PATH + '/enable-deal-reminder/:dealId' , version: '0.0.1'}, dealRecordService.enableDealReminder);

	routerNeedAuth.get({path : PATH + '/funds' , version : '0.0.1'}, fundService.findAllFunds);
	routerNeedAuth.get({path : PATH + '/funds/:fundId' , version : '0.0.1'}, fundService.findFund);
	routerNeedAuth.post({path : PATH + '/funds' , version: '0.0.1'} ,fundService.postNewFund);
	routerNeedAuth.patch({path : PATH + '/funds/:fundId' , version: '0.0.1'}, fundService.patchFund);
	routerNeedAuth.del({path : PATH + '/funds/:fundId' , version: '0.0.1'}, fundService.delFund);
	routerNeedAuth.get({path : PATH + '/fund-idnames' , version: '0.0.1'}, fundService.findFundIdNames);
	routerNeedAuth.patch({path : PATH + '/funds/:fundId/deal-records' , version: '0.0.1'}, fundService.patchDealRecords);
	routerNeedAuth.post({path : PATH + '/fund-tracks' , version: '0.0.1'}, fundService.createTrack);
	routerNeedAuth.patch({path : PATH + '/fund-tracks/:trackId' , version: '0.0.1'}, fundService.patchTrack);
	routerNeedAuth.del({path : PATH + '/fund-tracks/:trackId' , version: '0.0.1'}, fundService.deleteTrack);
	routerNeedAuth.get({path : PATH + '/gen-latest-fund-track/:fundId' , version : '0.0.1'} , fundService.genLatestTrack);
	routerNeedAuth.get({path : PATH + '/fund-tracks' , version : '0.0.1'} , fundService.tracks);

	// remindee settings
	routerNeedAuth.get({path : PATH + '/remindees' , version : '0.0.1'}, settings.fetchAllRemindees);
	routerNeedAuth.post({path : PATH + '/remindees' , version : '0.0.1'}, settings.addRemindee);
	routerNeedAuth.del({path : PATH + '/remindees/:arn' , version : '0.0.1'}, settings.delRemindee);
	
	// 债券的
	routerNeedAuth.get({path: PATH + '/bonds', version: '0.0.1'}, bondsService.findAllBonds);
	routerNeedAuth.get({path: PATH + '/bonds/:bondId',version: '0.0.1'}, bondsService.findBond);
	routerNeedAuth.post({path: PATH + '/bonds', version: '0.0.1'}, bondsService.postNewBond);
	routerNeedAuth.patch({path: PATH + '/bonds/:bondId', version: '0.0.1'}, bondsService.patchBond);
	routerNeedAuth.del({path: PATH + '/bonds/:bondId',version: '0.0.1'}, bondsService.delBond);
	routerNeedAuth.get({path: PATH + '/bonds-idnames', version: '0.0.1'}, bondsService.findBondsIdNames);
	routerNeedAuth.patch({path: PATH + '/bonds/price/:bondId', version: '0.0.1'}, bondsService.patchLatesPrice);

	server.get({path : "/api/bonds4h5" , version : '0.0.1'}, bondsService.findBonds4h5);
	server.get({path : "/api/funds4h5" , version : '0.0.1'}, fundService.findFunds4h5);
	server.get({path: '/api/shares/simple', version: '0.0.1'}, shareService.findAllShareSimple);

	routerNeedAuth.applyRoutes(server, '/api');
}

